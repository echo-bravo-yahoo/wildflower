import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

// Own tmp valley + real meadows.mjs, set once before the dynamic import --
// getValleyDir() caches VALLEY_PATH at module scope for the life of the
// process, and node --test runs each matched file in its own subprocess, so
// a distinct on-disk valley needs a distinct file (same reason
// writeSyncMetadata.test.js has its own file rather than sharing
// common.test.js's already-locked-in VALLEY_PATH). The second meadow's by()
// always returns undefined, simulating a host with no identity for that file.
const tmpValley = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-by-'))
fs.mkdirSync(path.join(tmpValley, 'meadows'), { recursive: true })
fs.writeFileSync(
  path.join(tmpValley, 'meadows.mjs'),
  `export const meadows = [
    { path: '~/.gitconfig', by: () => 'current-host' },
    { path: '~/.other-config', by: () => undefined },
  ]\n`
)

// Pre-seed a *foreign* key's mirror subtree with different content, so
// tests below can prove gather/sow never read or write it.
const foreignDir = path.join(tmpValley, 'meadows', '~by~', 'other-host', '~~')
fs.mkdirSync(foreignDir, { recursive: true })
fs.writeFileSync(
  path.join(foreignDir, '.gitconfig'),
  'FOREIGN -- must never be read or written by this host\n'
)

// Pre-seed the current host's own subtree with different-again content, so
// the sow test can distinguish "read the right thing" from "read nothing."
const currentDir = path.join(tmpValley, 'meadows', '~by~', 'current-host', '~~')
fs.mkdirSync(currentDir, { recursive: true })
fs.writeFileSync(path.join(currentDir, '.gitconfig'), 'CURRENT HOST CONTENT\n')

// Seed ~default by hand, exactly as a human would -- for the *second*
// meadow (~/.other-config) only. This is the only way anything ever lands
// here; no wildflower command populates it.
const defaultDir = path.join(tmpValley, 'meadows', '~by~', '~default', '~~')
fs.mkdirSync(defaultDir, { recursive: true })
fs.writeFileSync(path.join(defaultDir, '.other-config'), 'DEFAULT CONTENT\n')

process.env.VALLEY_PATH = tmpValley

const { mapPath, copyPath, parseMeadows } = await import('../common.js')

describe('by: forward mapping and gather/sow only ever target the current key', () => {
  const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-by-home-'))
  const realHome = process.env.HOME

  after(() => {
    process.env.HOME = realHome
    fs.rmSync(tmpValley, { recursive: true, force: true })
    fs.rmSync(fakeHome, { recursive: true, force: true })
  })

  it('mapPath resolves to the current key subtree, never the foreign one already on disk', async () => {
    process.env.HOME = fakeHome
    const mapped = await mapPath(path.join(fakeHome, '.gitconfig'))
    assert.equal(mapped, path.join(currentDir, '.gitconfig'))
    assert.ok(!mapped.includes('other-host'), 'must never resolve into a foreign key subtree')
  })

  it('sowing the foreign mirror path as a target still only reads the current key (owned-write)', async () => {
    process.env.HOME = fakeHome
    const { meadows } = await parseMeadows()
    const foreignMirrorPath = path.join(foreignDir, '.gitconfig')

    await copyPath(foreignMirrorPath, meadows, 'sow')

    const written = fs.readFileSync(path.join(fakeHome, '.gitconfig'), 'utf8')
    assert.equal(written, 'CURRENT HOST CONTENT\n')
  })

  it('sow falls back to ~default for a meadow whose by() returns undefined', async () => {
    process.env.HOME = fakeHome
    const { meadows } = await parseMeadows()
    const target = path.join(fakeHome, '.other-config')

    await copyPath(target, meadows, 'sow')

    const written = fs.readFileSync(target, 'utf8')
    assert.equal(written, 'DEFAULT CONTENT\n')
  })

  it('gather refuses when by() returns undefined, and never writes to ~default', async () => {
    process.env.HOME = fakeHome
    const { meadows } = await parseMeadows()
    const target = path.join(fakeHome, '.other-config')

    fs.writeFileSync(target, 'SHOULD NEVER BE GATHERED\n')
    await copyPath(target, meadows, 'gather')

    const stillThere = fs.readFileSync(path.join(defaultDir, '.other-config'), 'utf8')
    assert.equal(stillThere, 'DEFAULT CONTENT\n', 'gather must never overwrite ~default')
  })
})
