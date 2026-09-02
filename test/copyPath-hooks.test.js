import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// Own tmp valley + real meadows.mjs, for the same reason by.test.js has one:
// getValleyDir() caches VALLEY_PATH at module scope for the life of the
// process, and node --test runs each matched file in its own subprocess.
//
// parseMeadows() also dynamically imports meadows.mjs from a fixed path, so
// Node's ESM cache serves the same module object on every call -- both
// meadows below must exist in the file from the start; a later test can't
// rewrite it and expect a fresh read.
const tmpValley = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-hooks-'))
fs.mkdirSync(path.join(tmpValley, 'meadows'), { recursive: true })

globalThis.__sowCalls = []
globalThis.__gatherCalls = []

fs.writeFileSync(
  path.join(tmpValley, 'meadows.mjs'),
  `export const meadows = [
    {
      path: '~/.hooked',
      sow: (args) => { globalThis.__sowCalls.push(args) },
      gather: (args) => { globalThis.__gatherCalls.push(args) },
    },
    {
      path: '~/.throws',
      gather: () => { throw new Error('boom') },
    },
  ]\n`
)

process.env.VALLEY_PATH = tmpValley

const { copyPath, parseMeadows } = await import('../common.js')

describe('copyPath invokes the meadow sow()/gather() hook, not just wholesale sow/gather', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-hooks-home-'))
  const realHome = process.env.HOME

  after(() => {
    process.env.HOME = realHome
    fs.rmSync(tmpValley, { recursive: true, force: true })
    fs.rmSync(fakeHome, { recursive: true, force: true })
    delete globalThis.__sowCalls
    delete globalThis.__gatherCalls
  })

  it('a targeted gather runs the meadow gather() hook with copiedFiles scoped to the target', async () => {
    process.env.HOME = fakeHome
    const live = path.join(fakeHome, '.hooked')
    fs.writeFileSync(live, 'live content\n')

    const { meadows } = await parseMeadows()
    const code = await copyPath(live, meadows, 'gather')

    assert.equal(code, 0)
    assert.equal(globalThis.__gatherCalls.length, 1)
    assert.deepEqual(globalThis.__gatherCalls[0].copiedFiles, [
      path.join(tmpValley, 'meadows', '~~', '.hooked'),
    ])
  })

  it('a targeted sow runs the meadow sow() hook with copiedFiles scoped to the target', async () => {
    process.env.HOME = fakeHome
    const mirror = path.join(tmpValley, 'meadows', '~~', '.hooked')
    fs.writeFileSync(mirror, 'mirror content\n')
    const live = path.join(fakeHome, '.hooked')

    const { meadows } = await parseMeadows()
    const code = await copyPath(live, meadows, 'sow')

    assert.equal(code, 0)
    assert.equal(globalThis.__sowCalls.length, 1)
    assert.deepEqual(globalThis.__sowCalls[0].copiedFiles, [live])
  })

  it('a hook that throws is reported but does not fail the targeted operation', async () => {
    process.env.HOME = fakeHome
    const live = path.join(fakeHome, '.throws')
    fs.writeFileSync(live, 'content\n')

    const { meadows } = await parseMeadows()
    const code = await copyPath(live, meadows, 'gather')

    assert.equal(code, 0, 'the copy itself succeeded; only the hook failed')
  })
})
