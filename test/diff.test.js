import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

// diff() sets the exit code and getValleyDir() caches its answer for the life
// of the module, so each case runs the real CLI in a child process with its own
// VALLEY_PATH and HOME.
const CLI = path.join(import.meta.dirname, '..', 'wildflower.js')

const roots = []
after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
})

// A valley tracking a single `~/dots` meadow, with same.txt and changed.txt
// identical on both sides. Callers then diverge one side to produce the state
// under test.
function setup() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-diff-')))
  roots.push(root)
  const home = path.join(root, 'home')
  const valley = path.join(root, 'valley')
  const mirror = path.join(valley, 'meadows', '~~', 'dots')
  const live = path.join(home, 'dots')
  fs.mkdirSync(mirror, { recursive: true })
  fs.mkdirSync(live, { recursive: true })
  fs.writeFileSync(
    path.join(valley, 'meadows.mjs'),
    'export const meadows = [{ path: "~/dots", filter: ["**", "!*-tokens.json"] }]\n'
  )
  for (const name of ['same.txt', 'changed.txt']) {
    fs.writeFileSync(path.join(mirror, name), 'v1\n')
    fs.writeFileSync(path.join(live, name), 'v1\n')
  }
  return { root, home, valley, mirror, live }
}

// changed.txt differs, new.txt is live-only, old.txt is mirror-only.
function diverge(env) {
  fs.writeFileSync(path.join(env.live, 'changed.txt'), 'local\n')
  fs.writeFileSync(path.join(env.live, 'new.txt'), 'new\n')
  fs.writeFileSync(path.join(env.mirror, 'old.txt'), 'old\n')
}

function runDiff({ valley, home }, args = []) {
  const res = spawnSync(process.execPath, [CLI, 'diff', ...args], {
    env: { ...process.env, VALLEY_PATH: valley, HOME: home },
    encoding: 'utf8',
  })
  return { code: res.status, stdout: res.stdout, stderr: res.stderr }
}

function byName(files) {
  return Object.fromEntries(files.map((f) => [path.basename(f.live), f]))
}

describe('diff --json', () => {
  it('emits empty JSON for an identical tree and exits 0', () => {
    const env = setup()
    const res = runDiff(env, ['--json'])
    assert.deepEqual(JSON.parse(res.stdout), {
      counts: { differ: 0, 'live-only': 0, 'mirror-only': 0, absent: 0 },
      files: [],
    })
    assert.equal('watermark' in JSON.parse(res.stdout), false)
    assert.equal(res.code, 0)
  })

  it('classifies differ, live-only and mirror-only and exits 1', () => {
    const env = setup()
    diverge(env)
    const res = runDiff(env, ['--json'])
    const out = JSON.parse(res.stdout)
    assert.deepEqual(out.counts, { differ: 1, 'live-only': 1, 'mirror-only': 1, absent: 0 })
    const files = byName(out.files)
    assert.deepEqual(files['changed.txt'], {
      state: 'differ',
      live: path.join(env.live, 'changed.txt'),
      mirror: path.join(env.mirror, 'changed.txt'),
    })
    assert.deepEqual(files['new.txt'], {
      state: 'live-only',
      live: path.join(env.live, 'new.txt'),
      mirror: path.join(env.mirror, 'new.txt'),
    })
    assert.deepEqual(files['old.txt'], {
      state: 'mirror-only',
      live: path.join(env.live, 'old.txt'),
      mirror: path.join(env.mirror, 'old.txt'),
    })
    assert.equal(files['same.txt'], undefined)
    for (const f of out.files) assert.deepEqual(Object.keys(f).sort(), ['live', 'mirror', 'state'])
    assert.equal(res.code, 1)
  })

  it('orders entries by state rank', () => {
    const env = setup()
    diverge(env)
    const out = JSON.parse(runDiff(env, ['--json']).stdout)
    assert.deepEqual(
      out.files.map((f) => f.state),
      ['differ', 'live-only', 'mirror-only']
    )
  })

  it('suppresses filter-excluded paths', () => {
    const env = setup()
    fs.writeFileSync(path.join(env.live, 'x-tokens.json'), '{}\n')
    const res = runDiff(env, ['--json'])
    const out = JSON.parse(res.stdout)
    assert.deepEqual(out.files, [])
    assert.deepEqual(out.counts, { differ: 0, 'live-only': 0, 'mirror-only': 0, absent: 0 })
    assert.equal(res.code, 0)
  })

  it('reports a wholly missing live side as one mirror-only entry', () => {
    const env = setup()
    fs.rmSync(env.live, { recursive: true, force: true })
    const res = runDiff(env, ['--json'])
    const out = JSON.parse(res.stdout)
    assert.equal(out.files.length, 1)
    assert.deepEqual(out.files[0], { state: 'mirror-only', live: env.live, mirror: env.mirror })
    assert.equal(res.code, 1)
  })

  it('reports a path missing on both sides as absent and exits 2', () => {
    const env = setup()
    const target = path.join(env.live, 'nope.txt')
    const res = runDiff(env, ['--json', target])
    const out = JSON.parse(res.stdout)
    assert.equal(out.files.length, 1)
    assert.equal(out.files[0].state, 'absent')
    assert.equal(out.files[0].live, target)
    assert.equal(out.counts.absent, 1)
    assert.equal(res.code, 2)
  })

  it('narrows to a named path, with the flag before or after it', () => {
    const env = setup()
    diverge(env)
    const target = path.join(env.live, 'changed.txt')
    for (const args of [['--json', target], [target, '--json']]) {
      const res = runDiff(env, args)
      const out = JSON.parse(res.stdout)
      assert.equal(out.files.length, 1)
      assert.equal(out.files[0].state, 'differ')
      assert.equal(out.files[0].live, target)
      assert.equal(res.code, 1)
    }
  })

  it('exits 2 with nothing on stdout when the path is untracked', () => {
    const env = setup()
    const res = runDiff(env, ['--json', path.join(env.home, 'not-tracked')])
    assert.equal(res.code, 2)
    assert.match(res.stderr, /not in meadows\.mjs/)
    assert.equal(res.stdout, '')
  })

  it('ignores --verbose', () => {
    const env = setup()
    diverge(env)
    const res = runDiff(env, ['--json', '--verbose'])
    const out = JSON.parse(res.stdout)
    assert.deepEqual(out.counts, { differ: 1, 'live-only': 1, 'mirror-only': 1, absent: 0 })
    for (const f of out.files) assert.equal('patch' in f, false)
    assert.doesNotMatch(res.stdout, /@@/)
  })
})

describe('diff text mode', () => {
  it('is unchanged without --json', () => {
    const env = setup()
    diverge(env)
    const res = runDiff(env)
    assert.equal(res.code, 1)
    assert.ok(
      res.stdout.includes(`Files ${path.join(env.live, 'changed.txt')} and ${path.join(env.mirror, 'changed.txt')} differ`)
    )
    assert.ok(!res.stdout.startsWith('{'))
  })

  it('documents --json in --help', () => {
    const res = spawnSync(process.execPath, [CLI, 'diff', '--help'], { encoding: 'utf8' })
    assert.match(res.stdout, /--json/)
  })
})
