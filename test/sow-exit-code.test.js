import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

// Each case runs the real CLI in a child process: getValleyDir() caches
// VALLEY_PATH for the life of a process, and the exit code is what
// dotfiles-update.sh gates on.
const CLI = path.join(import.meta.dirname, '..', 'wildflower.js')

const roots = []
after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
})

// A valley whose meadows are all path-less hooks, so no mirror or live files
// are needed. `meadowsSource` is the body of the exported array.
function sow(meadowsSource) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-sow-exit-')))
  roots.push(root)
  const valley = path.join(root, 'valley')
  const home = path.join(root, 'home')
  const marker = path.join(root, 'last-meadow-ran')
  fs.mkdirSync(valley)
  fs.mkdirSync(home)
  fs.writeFileSync(
    path.join(valley, 'meadows.mjs'),
    `import fs from 'node:fs'\nexport const meadows = [${meadowsSource}]\n`
  )
  const result = spawnSync(process.execPath, [CLI, 'sow'], {
    env: { ...process.env, VALLEY_PATH: valley, HOME: home, WF_MARKER: marker },
    encoding: 'utf8'
  })
  return { ...result, marker }
}

const last = `{ name: 'last', sow: () => fs.writeFileSync(process.env.WF_MARKER, 'ran') }`

describe('wholesale sow exit code', () => {
  it('exits 0 when every meadow succeeds', () => {
    const r = sow(last)
    assert.equal(r.status, 0)
    assert.ok(fs.existsSync(r.marker))
    assert.match(r.stdout, /Done sowing\./)
  })

  it('exits 1 when a sow() hook throws, and still runs the later meadows', () => {
    const r = sow(`{ name: 'broken', sow: () => { throw new Error('boom') } }, ${last}`)
    assert.equal(r.status, 1)
    assert.ok(fs.existsSync(r.marker), 'the meadow after the failure still ran')
    assert.match(r.stderr, /Done sowing, but 1 meadow\(s\) failed: "broken" \(step #0\)/)
  })

  it('exits 1 when an if() throws, and still runs the later meadows', () => {
    const r = sow(`{ name: 'bad-if', if: () => { throw new Error('nope') }, sow: () => {} }, ${last}`)
    assert.equal(r.status, 1)
    assert.ok(fs.existsSync(r.marker))
    assert.match(r.stderr, /'if' or 'by' threw/)
  })

  it('exits 1 on an unexpected error that escapes the loop', () => {
    // meadowLabel(null) throws inside the per-meadow catch, so the error
    // reaches the outer catch around the whole loop.
    const r = sow('null')
    assert.equal(r.status, 1)
    assert.match(r.stderr, /Error while sowing/)
  })
})
