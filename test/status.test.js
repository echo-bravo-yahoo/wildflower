import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'

// status() ends in process.exit() and getValleyDir() caches its answer for the
// life of the module, so each case runs the real CLI in a child process with
// its own VALLEY_PATH and HOME. That also exercises the exit codes, which are
// the part dotfiles-update.sh depends on.
const CLI = path.join(import.meta.dirname, '..', 'wildflower.js')

const roots = []
after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
})

// A valley tracking a single `~/dots` meadow, with the four files below sown to
// live and committed to the mirror, and the watermark pointing at that commit.
// Callers then move one side or the other to produce the state under test.
function setup({ git = true } = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-status-')))
  roots.push(root)
  const home = path.join(root, 'home')
  const valley = path.join(root, 'valley')
  const mirror = path.join(valley, 'meadows', '~~', 'dots')
  const live = path.join(home, 'dots')
  fs.mkdirSync(mirror, { recursive: true })
  fs.mkdirSync(live, { recursive: true })
  fs.writeFileSync(path.join(valley, 'meadows.mjs'), 'export const meadows = [{ path: "~/dots" }]\n')

  for (const name of ['synced.txt', 'behind.txt', 'ahead.txt', 'gone.txt']) {
    fs.writeFileSync(path.join(mirror, name), 'v1\n')
    fs.writeFileSync(path.join(live, name), 'v1\n')
  }

  let commit = null
  if (git) {
    const run = (cmd) => execSync(cmd, { cwd: valley, stdio: 'ignore' })
    run('git init -q')
    run('git config user.email test@test.com')
    run('git config user.name Test')
    run('git add -A')
    run('git commit -q -m mirror')
    commit = execSync('git rev-parse HEAD', { cwd: valley }).toString().trim()
    writeWatermark(valley, commit)
  }

  return { root, home, valley, mirror, live, commit }
}

function writeWatermark(valley, commit) {
  fs.writeFileSync(
    path.join(valley, '.wildflower-state.json'),
    JSON.stringify({ commit, sownAt: '2026-01-01T00:00:00.000Z', wildflowerVersion: 'test' }, null, 2) + '\n'
  )
}

function runStatus({ valley, home }, args = []) {
  const res = spawnSync(process.execPath, [CLI, 'status', ...args], {
    env: { ...process.env, VALLEY_PATH: valley, HOME: home },
    encoding: 'utf8',
  })
  return { code: res.status, stdout: res.stdout, stderr: res.stderr }
}

// Parse --porcelain output into { path: state }, keyed by basename.
function states(stdout) {
  const out = {}
  for (const line of stdout.split('\n')) {
    if (!line.trim()) continue
    const [state, file] = line.split('\t')
    out[path.basename(file)] = state
  }
  return out
}

// Move each file into the state named after it: the mirror moves on for
// `behind`, the live file moves for `ahead`, and `gone` disappears from live.
function diverge(env) {
  fs.writeFileSync(path.join(env.mirror, 'behind.txt'), 'v2\n')
  fs.writeFileSync(path.join(env.live, 'ahead.txt'), 'local\n')
  fs.rmSync(path.join(env.live, 'gone.txt'))
}

describe('wildflower status', () => {
  it('reports every tracked file synced right after a sow', () => {
    const env = setup()
    const { code, stdout } = runStatus(env, ['--porcelain'])
    assert.equal(stdout.trim(), '', 'porcelain should list nothing when all synced')
    assert.equal(code, 0)
  })

  it('classifies ahead, behind and missing, and exits 1 for ahead', () => {
    const env = setup()
    diverge(env)
    const { code, stdout } = runStatus(env, ['--porcelain'])
    assert.deepEqual(states(stdout), {
      'ahead.txt': 'ahead',
      'behind.txt': 'behind',
      'gone.txt': 'missing',
    })
    assert.equal(code, 1, 'an ahead file must exit 1 so the update script refuses')
  })

  it('exits 0 when nothing is ahead, even with behind and missing files', () => {
    const env = setup()
    fs.writeFileSync(path.join(env.mirror, 'behind.txt'), 'v2\n')
    fs.rmSync(path.join(env.live, 'gone.txt'))
    const { code, stdout } = runStatus(env, ['--porcelain'])
    assert.deepEqual(states(stdout), { 'behind.txt': 'behind', 'gone.txt': 'missing' })
    assert.equal(code, 0)
  })

  it('reports unknown rather than guessing when there is no watermark', () => {
    const env = setup()
    diverge(env)
    fs.rmSync(path.join(env.valley, '.wildflower-state.json'))
    const { code, stdout, stderr } = runStatus(env, ['--porcelain'])
    assert.deepEqual(states(stdout), {
      'ahead.txt': 'unknown',
      'behind.txt': 'unknown',
      'gone.txt': 'missing',
    })
    assert.equal(code, 0, 'unknown is not ahead, so it does not block')
    assert.equal(stderr, '', 'porcelain stays quiet; the warning is human-mode only')
  })

  it('reports unknown when the watermark commit is unreachable', () => {
    const env = setup()
    diverge(env)
    writeWatermark(env.valley, '0'.repeat(40))
    const { stdout } = runStatus(env, ['--porcelain'])
    assert.deepEqual(states(stdout), {
      'ahead.txt': 'unknown',
      'behind.txt': 'unknown',
      'gone.txt': 'missing',
    })
  })

  it('warns about a missing watermark in human output', () => {
    const env = setup()
    diverge(env)
    fs.rmSync(path.join(env.valley, '.wildflower-state.json'))
    const { stdout, stderr } = runStatus(env)
    assert.match(stdout, /4 tracked, 1 synced, 0 ahead, 0 behind, 1 missing, 2 unknown/)
    assert.match(stderr, /no watermark/)
  })

  it('narrows to a named path', () => {
    const env = setup()
    diverge(env)
    const { code, stdout } = runStatus(env, ['--porcelain', path.join(env.live, 'behind.txt')])
    assert.deepEqual(states(stdout), { 'behind.txt': 'behind' })
    assert.equal(code, 0, 'the ahead file was not asked about')
  })

  it('exits 2 for a path no meadow covers', () => {
    const env = setup()
    const { code, stderr } = runStatus(env, ['--porcelain', path.join(env.home, 'not-tracked')])
    assert.equal(code, 2)
    assert.match(stderr, /not in meadows\.mjs/)
  })

  it('exits 2 when the valley is not a git repo', () => {
    const env = setup({ git: false })
    const { code, stderr } = runStatus(env, ['--porcelain'])
    assert.equal(code, 2)
    assert.match(stderr, /not a git repo/)
  })

  it('emits the watermark, counts and every file under --json', () => {
    const env = setup()
    diverge(env)
    const { stdout } = runStatus(env, ['--json'])
    const parsed = JSON.parse(stdout)
    assert.equal(parsed.watermark, env.commit)
    assert.deepEqual(parsed.counts, { ahead: 1, unknown: 0, behind: 1, missing: 1, synced: 1 })
    assert.equal(parsed.files.length, 4, '--json reports synced files too')
  })
})

// Same shape as setup(), but the tracked meadow is `by`-scoped to
// 'current-host'. A foreign key's mirror subtree is pre-seeded with content
// that would classify as 'behind' if status ever consulted the wrong
// subtree, so a wrong-path bug fails loud rather than reporting 'synced'.
function setupBranched() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-status-by-')))
  roots.push(root)
  const home = path.join(root, 'home')
  const valley = path.join(root, 'valley')
  const mirror = path.join(valley, 'meadows', '~by~', 'current-host', '~~', 'dots')
  const foreignMirror = path.join(valley, 'meadows', '~by~', 'other-host', '~~', 'dots')
  const live = path.join(home, 'dots')
  fs.mkdirSync(mirror, { recursive: true })
  fs.mkdirSync(foreignMirror, { recursive: true })
  fs.mkdirSync(live, { recursive: true })
  fs.writeFileSync(
    path.join(valley, 'meadows.mjs'),
    'export const meadows = [{ path: "~/dots", by: () => "current-host" }]\n'
  )

  fs.writeFileSync(path.join(mirror, 'f.txt'), 'v1\n')
  fs.writeFileSync(path.join(live, 'f.txt'), 'v1\n')
  fs.writeFileSync(path.join(foreignMirror, 'f.txt'), 'FOREIGN -- must never be classified against\n')

  const run = (cmd) => execSync(cmd, { cwd: valley, stdio: 'ignore' })
  run('git init -q')
  run('git config user.email test@test.com')
  run('git config user.name Test')
  run('git add -A')
  run('git commit -q -m mirror')
  const commit = execSync('git rev-parse HEAD', { cwd: valley }).toString().trim()
  writeWatermark(valley, commit)

  return { root, home, valley, mirror, live, commit }
}

describe('wildflower status: by-scoped meadows', () => {
  it('classifies against the current host\'s own mirror subtree, not the base path or a foreign key', () => {
    const env = setupBranched()
    const { code, stdout } = runStatus(env, ['--porcelain'])
    assert.equal(stdout.trim(), '', 'synced against the current-host subtree, so nothing to report')
    assert.equal(code, 0)
  })

  it('reports ahead when the live file diverges from the current host\'s own mirror subtree', () => {
    const env = setupBranched()
    fs.writeFileSync(path.join(env.live, 'f.txt'), 'local\n')
    const { code, stdout } = runStatus(env, ['--porcelain'])
    assert.deepEqual(states(stdout), { 'f.txt': 'ahead' })
    assert.equal(code, 1)
  })
})
