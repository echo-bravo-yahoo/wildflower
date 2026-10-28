import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

// diff() sets the exit code and getValleyDir() caches per process, so each case
// runs the real CLI in a child process with its own VALLEY_PATH and HOME.
const CLI = path.join(import.meta.dirname, '..', 'wildflower.js')

const roots = []
after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
})

const ZERO = { differs: 0, liveOnly: 0, mirrorOnly: 0, absent: 0, other: 0 }

function setup({ meadows = '[{ path: "~/dots" }]', files = {} } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-diff-')))
  roots.push(root)
  const home = path.join(root, 'home')
  const valley = path.join(root, 'valley')
  const mirror = path.join(valley, 'meadows', '~~', 'dots')
  const live = path.join(home, 'dots')
  fs.mkdirSync(mirror, { recursive: true })
  fs.mkdirSync(live, { recursive: true })
  fs.writeFileSync(path.join(valley, 'meadows.mjs'), `export const meadows = ${meadows}\n`)
  const ctx = { root, home, valley, mirror, live }
  for (const [side, entries] of Object.entries(files)) {
    for (const [name, content] of Object.entries(entries)) {
      const p = path.join(ctx[side], name)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, content)
    }
  }
  return ctx
}

function runDiff({ valley, home }, args = []) {
  const res = spawnSync(process.execPath, [CLI, 'diff', ...args], {
    env: { ...process.env, VALLEY_PATH: valley, HOME: home },
    encoding: 'utf8',
  })
  return { code: res.status, stdout: res.stdout, stderr: res.stderr }
}

function byName(doc) {
  const out = {}
  for (const f of doc.files) out[path.basename(f.live ?? f.mirror)] = f
  return out
}

function mixed() {
  return setup({
    files: {
      live: { 'same.txt': 'v1\n', 'changed.txt': 'local\n', 'new.txt': 'n\n' },
      mirror: { 'same.txt': 'v1\n', 'changed.txt': 'v1\n', 'gone.txt': 'g\n' },
    },
  })
}

describe('diff --json', () => {
  it('reports an identical tree as empty', () => {
    const ctx = setup({ files: { live: { 'a.txt': 'v1\n' }, mirror: { 'a.txt': 'v1\n' } } })
    const res = runDiff(ctx, ['--json'])
    assert.equal(res.code, 0)
    assert.deepEqual(JSON.parse(res.stdout), { counts: ZERO, files: [] })
  })

  it('reports differs, liveOnly and mirrorOnly as pure JSON', () => {
    const ctx = mixed()
    const res = runDiff(ctx, ['--json'])
    assert.equal(res.code, 1)
    const doc = JSON.parse(res.stdout)
    assert.deepEqual(doc.counts, { ...ZERO, differs: 1, liveOnly: 1, mirrorOnly: 1 })
    assert.doesNotMatch(res.stdout, /Files |Only in /)
    const f = byName(doc)
    assert.equal(f['same.txt'], undefined)
    assert.equal(f['changed.txt'].state, 'differs')
    assert.equal(f['changed.txt'].live, path.join(ctx.live, 'changed.txt'))
    assert.equal(f['changed.txt'].mirror, path.join(ctx.mirror, 'changed.txt'))
    assert.equal('patch' in f['changed.txt'], false)
    assert.equal(f['new.txt'].state, 'liveOnly')
    assert.equal(f['new.txt'].live, path.join(ctx.live, 'new.txt'))
    assert.equal(f['new.txt'].mirror, path.join(ctx.mirror, 'new.txt'))
    assert.equal(f['gone.txt'].state, 'mirrorOnly')
    assert.equal(f['gone.txt'].live, path.join(ctx.live, 'gone.txt'))
    assert.equal(f['gone.txt'].mirror, path.join(ctx.mirror, 'gone.txt'))
  })

  it('adds a patch to differs entries with --verbose', () => {
    const ctx = mixed()
    const res = runDiff(ctx, ['--json', '--verbose'])
    assert.equal(res.code, 1)
    const f = byName(JSON.parse(res.stdout))
    assert.equal(typeof f['changed.txt'].patch, 'string')
    assert.match(f['changed.txt'].patch, /^-local$/m)
    assert.match(f['changed.txt'].patch, /^\+v1$/m)
    assert.equal('patch' in f['new.txt'], false)
  })

  it('accepts the flag before --verbose or paths', () => {
    const ctx = mixed()
    const res = runDiff(ctx, ['--verbose', '--json'])
    assert.equal(JSON.parse(res.stdout).counts.differs, 1)
  })

  it('honours the meadow filter', () => {
    const ctx = setup({
      meadows: '[{ path: "~/dots", filter: (rel) => !rel.endsWith("-tokens.json") }]',
      files: {
        live: { 'a.txt': 'v1\n', 'secret-tokens.json': 'x\n' },
        mirror: { 'a.txt': 'v1\n' },
      },
    })
    const res = runDiff(ctx, ['--json'])
    assert.equal(res.code, 0)
    const doc = JSON.parse(res.stdout)
    assert.deepEqual(doc.files, [])
    assert.equal(doc.counts.liveOnly, 0)
  })

  it('reports a path missing on both sides as absent with exit 2', () => {
    const ctx = setup({
      meadows: '[{ path: "~/dots" }, { path: "~/nothing.txt" }]',
      files: { live: { 'a.txt': 'v1\n' }, mirror: { 'a.txt': 'v1\n' } },
    })
    const res = runDiff(ctx, ['--json'])
    assert.equal(res.code, 2)
    const doc = JSON.parse(res.stdout)
    assert.equal(doc.counts.absent, 1)
    assert.equal(doc.files.length, 1)
    assert.equal(doc.files[0].state, 'absent')
    assert.equal(doc.files[0].live, path.join(ctx.home, 'nothing.txt'))
    assert.equal(doc.files[0].mirror, path.join(ctx.valley, 'meadows', '~~', 'nothing.txt'))
  })

  it('reports mismatched types as other', () => {
    const ctx = setup({
      files: { live: { 'x/inner.txt': 'i\n' }, mirror: { x: 'file\n' } },
    })
    const res = runDiff(ctx, ['--json'])
    assert.equal(res.code, 1)
    const doc = JSON.parse(res.stdout)
    assert.equal(doc.counts.other, 1)
    const other = doc.files.find((f) => f.state === 'other')
    assert.equal(other.live, null)
    assert.equal(other.mirror, null)
    assert.equal(typeof other.detail, 'string')
    assert.match(other.detail, /x/)
  })

  it('prints an empty document when every named target is untracked', () => {
    const ctx = mixed()
    const res = runDiff(ctx, ['--json', path.join(ctx.home, 'not-tracked')])
    assert.equal(res.code, 2)
    assert.deepEqual(JSON.parse(res.stdout), { counts: ZERO, files: [] })
    assert.match(res.stderr, /not in meadows\.mjs/)
  })

  it('narrows to a named path', () => {
    const ctx = mixed()
    const res = runDiff(ctx, ['--json', path.join(ctx.live, 'new.txt')])
    assert.equal(res.code, 1)
    const doc = JSON.parse(res.stdout)
    assert.equal(doc.files.length, 1)
    assert.equal(doc.files[0].state, 'liveOnly')
  })

  it('is mentioned in diff --help', () => {
    const res = runDiff(mixed(), ['--help'])
    assert.match(res.stdout, /--json/)
  })
})

describe('diff (human output)', () => {
  it('is unchanged without --json', () => {
    const res = runDiff(mixed())
    assert.equal(res.code, 1)
    assert.match(res.stdout, /Files .*changed\.txt and .*changed\.txt differ/)
    assert.match(res.stdout, /Only in /)
  })
})
