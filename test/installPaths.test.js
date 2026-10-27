import { it, after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'

const CLI = path.join(import.meta.dirname, '..', 'wildflower.js')
const roots = []
after(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true })
})

function setup({ single = false, overlap = false, curable = false, filter = ['**', '!excluded/**'] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-installs-'))
  roots.push(root)
  const home = path.join(root, 'home')
  const valley = path.join(root, 'valley')
  const mirror = path.join(valley, 'meadows', '~~', 'dots')
  const original = path.join(home, 'dots')
  const alternate = path.join(home, 'other')
  for (const dir of [mirror, original, alternate]) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'config.txt'), 'shared\n')
    fs.writeFileSync(path.join(dir, 'sibling.txt'), 'unchanged\n')
  }
  fs.writeFileSync(path.join(valley, 'meadows.mjs'), `export const meadows = [
    ${overlap ? `{
      path: '~/',
      sow: () => console.log('broad sow'),
      gather: () => console.log('broad gather'),
    },` : ''}
    {
    path: '~/dots',
    curable: ${curable},
    ${single ? '' : "installPath: async () => ['~/other', '~/dots'],"}
    ${overlap ? `
      sow: () => console.log('dots sow'),
      gather: () => console.log('dots gather'),
    ` : ''}
    filter: ${JSON.stringify(filter)}
  }]\n`)
  for (const args of [
    ['init', '-q'], ['config', 'user.email', 'test@test.com'],
    ['config', 'user.name', 'Test'], ['add', '.'], ['commit', '-qm', 'mirror'],
  ]) execFileSync('git', args, { cwd: valley, stdio: 'ignore' })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: valley, encoding: 'utf8' }).trim()
  fs.writeFileSync(path.join(valley, '.wildflower-state.json'), JSON.stringify({ commit }))
  return { home, valley, mirror, original, alternate }
}

function run(env, ...args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, VALLEY_PATH: env.valley, HOME: env.home, NO_UPDATE_NOTIFIER: '1' },
    encoding: 'utf8',
  })
}

it('maps a mirror to the first install location and either live location back to the mirror', () => {
  const env = setup()
  const mirror = path.join(env.mirror, 'config.txt')
  const alternate = path.join(env.alternate, 'config.txt')
  for (const [input, expected] of [
    [mirror, alternate], [alternate, mirror], [path.join(env.original, 'config.txt'), mirror],
  ]) {
    const result = run(env, 'path', input)
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), expected)
  }
})

for (const command of ['path', 'diff', 'status']) {
  it(`${command} resolves an alternate location excluded by a broader meadow`, () => {
    const env = setup({ overlap: true })
    fs.appendFileSync(path.join(env.valley, 'meadows.mjs'), `
      meadows[0].filter = ['**', '!dots/**', '!other/**']
    `)
    const edited = path.join(env.alternate, 'config.txt')
    const mirror = path.join(env.mirror, 'config.txt')
    fs.writeFileSync(edited, 'local edit\n')

    const result = run(env, command, ...(command === 'status' ? ['--json'] : []), edited)
    assert.equal(result.status, command === 'path' ? 0 : 1, result.stderr || result.stdout)
    if (command === 'path') {
      assert.equal(result.stdout.trim(), mirror)
    } else if (command === 'diff') {
      assert.ok(result.stdout.includes(edited), result.stdout)
      assert.ok(result.stdout.includes(mirror), result.stdout)
    } else {
      assert.deepEqual(JSON.parse(result.stdout).files, [{ state: 'ahead', live: edited, mirror }])
    }
  })
}

it('diff reports edits in another install location, both wholesale and when named', () => {
  const env = setup()
  const edited = path.join(env.alternate, 'config.txt')
  fs.writeFileSync(edited, 'local edit\n')
  for (const targets of [[], [edited], [path.join(env.mirror, 'config.txt')]]) {
    const result = run(env, 'diff', ...targets)
    assert.equal(result.status, 1, result.stderr)
    assert.ok(result.stdout.includes(edited), result.stdout)
    assert.doesNotMatch(result.stderr, /not in meadows/)
  }
})

it('status classifies every install location against the shared watermark and accepts aliases', () => {
  const env = setup()
  const edited = path.join(env.alternate, 'config.txt')
  fs.writeFileSync(edited, 'local edit\n')
  for (const targets of [[], [edited], [path.join(env.mirror, 'config.txt')]]) {
    const result = run(env, 'status', '--json', ...targets)
    assert.equal(result.status, 1, result.stderr)
    const report = JSON.parse(result.stdout)
    assert.equal(report.files.find(file => file.live === edited)?.state, 'ahead')
    assert.equal(report.files.length, targets.length ? 1 : 4)
    if (!targets.length) {
      assert.equal(report.files.find(file => file.live === path.join(env.original, 'config.txt'))?.state, 'synced')
    }
  }
})

it('gathers a single location without adding file reads before its existing copy', () => {
  const env = setup({ single: true })
  fs.writeFileSync(path.join(env.original, 'config.txt'), 'updated\n')
  // A one-location gather needs no comparison. Reject whole-file reads while
  // allowing recursive-copy to stream the file normally.
  const preload = path.join(env.valley, 'no-buffered-read.cjs')
  fs.writeFileSync(preload, `
    const fs = require('node:fs');
    const { syncBuiltinESMExports } = require('node:module');
    fs.promises.readFile = async () => { throw new Error('unexpected whole-file read'); };
    syncBuiltinESMExports();
  `)
  const result = spawnSync(process.execPath, ['--require', preload, CLI, 'gather'], {
    env: { ...process.env, VALLEY_PATH: env.valley, HOME: env.home, NO_UPDATE_NOTIFIER: '1' },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(path.join(env.mirror, 'config.txt'), 'utf8'), 'updated\n')
})

it('compares identical copies without whole-file buffering and still gathers their contents', () => {
  const env = setup()
  const preload = path.join(env.valley, 'no-buffered-read.cjs')
  fs.writeFileSync(preload, `
    const fs = require('node:fs');
    const { syncBuiltinESMExports } = require('node:module');
    fs.promises.readFile = async () => { throw new Error('unexpected whole-file read'); };
    syncBuiltinESMExports();
  `)
  fs.writeFileSync(path.join(env.original, 'config.txt'), 'updated\n')
  fs.writeFileSync(path.join(env.alternate, 'config.txt'), 'updated\n')
  const result = spawnSync(process.execPath, ['--require', preload, CLI, 'gather'], {
    env: { ...process.env, VALLEY_PATH: env.valley, HOME: env.home, NO_UPDATE_NOTIFIER: '1' },
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(fs.readFileSync(path.join(env.mirror, 'config.txt'), 'utf8'), 'updated\n')
})

it('writes actual conflicting contents, leaves live copies alone, and recovers after resolution', () => {
  const env = setup()
  const original = path.join(env.original, 'config.txt')
  const alternate = path.join(env.alternate, 'config.txt')
  fs.writeFileSync(original, 'local edit\n')
  const result = run(env, 'gather')
  assert.equal(result.status, 1, result.stderr)
  const conflict = fs.readFileSync(path.join(env.mirror, 'config.txt'), 'utf8')
  assert.ok(conflict.includes(`<<<<<<< ${env.alternate}\nshared\n`), conflict)
  assert.ok(conflict.includes(`=======\nlocal edit\n`), conflict)
  assert.equal(fs.readFileSync(original, 'utf8'), 'local edit\n')
  assert.equal(fs.readFileSync(alternate, 'utf8'), 'shared\n')
  fs.writeFileSync(alternate, 'local edit\n')
  const resolved = run(env, 'gather')
  assert.equal(resolved.status, 0, resolved.stderr)
  assert.equal(fs.readFileSync(path.join(env.mirror, 'config.txt'), 'utf8'), 'local edit\n')
})

for (const curable of [false, true]) {
  for (const targeted of [false, true]) {
    it(`${targeted ? 'targeted' : 'wholesale'} gather ignores divergent junk with curable=${curable}`, () => {
      const env = setup({ curable, filter: null })
      for (const dir of [env.mirror, env.original, env.alternate]) {
        fs.mkdirSync(path.join(dir, 'nested'), { recursive: true })
      }
      for (const live of [env.original, env.alternate]) {
        fs.writeFileSync(path.join(live, 'nested', 'config.txt'), 'updated\n')
        fs.writeFileSync(path.join(live, 'nested', '.settings'), 'hidden settings\n')
        for (const rel of ['.DS_Store', 'nested/.DS_Store', 'nested/Thumbs.db', 'nested/config.txt~']) {
          fs.writeFileSync(path.join(live, rel), live)
        }
      }

      const result = run(env, 'gather', ...(targeted ? [path.join(env.original, 'nested')] : []))
      assert.equal(result.status, 0, result.stderr)
      assert.equal(fs.readFileSync(path.join(env.mirror, 'nested', 'config.txt'), 'utf8'), 'updated\n')
      assert.equal(fs.readFileSync(path.join(env.mirror, 'nested', '.settings'), 'utf8'), 'hidden settings\n')
      for (const rel of ['.DS_Store', 'nested/.DS_Store', 'nested/Thumbs.db', 'nested/config.txt~']) {
        assert.equal(fs.existsSync(path.join(env.mirror, rel)), false, rel)
        for (const live of [env.original, env.alternate]) {
          assert.equal(fs.readFileSync(path.join(live, rel), 'utf8'), live)
        }
      }
    })
  }
}

for (const location of ['original', 'alternate', 'mirror']) {
  it(`targeted sow via ${location} processes overlapping meadows in config order`, () => {
    const env = setup({ overlap: true })
    const broadMirror = path.join(env.valley, 'meadows', '~~', 'other')
    fs.mkdirSync(broadMirror, { recursive: true })
    fs.writeFileSync(path.join(broadMirror, 'config.txt'), 'old settings\n')
    fs.writeFileSync(path.join(env.mirror, 'config.txt'), 'new settings\n')

    const result = run(env, 'sow', path.join(env[location], 'config.txt'))
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /broad sow[\s\S]*dots sow/)
    for (const live of [env.original, env.alternate]) {
      assert.equal(fs.readFileSync(path.join(live, 'config.txt'), 'utf8'), 'new settings\n')
      assert.equal(fs.readFileSync(path.join(live, 'sibling.txt'), 'utf8'), 'unchanged\n')
    }
  })

  it(`targeted gather via ${location} processes overlapping meadows in config order`, () => {
    const env = setup({ overlap: true })
    for (const live of [env.original, env.alternate]) {
      fs.writeFileSync(path.join(live, 'config.txt'), 'updated\n')
    }
    fs.writeFileSync(path.join(env.original, 'sibling.txt'), 'unrelated edit\n')

    const result = run(env, 'gather', path.join(env[location], 'config.txt'))
    assert.equal(result.status, 0, result.stderr)
    assert.match(result.stdout, /broad gather[\s\S]*dots gather/)
    assert.equal(fs.readFileSync(path.join(env.mirror, 'config.txt'), 'utf8'), 'updated\n')
    assert.equal(fs.readFileSync(path.join(env.mirror, 'sibling.txt'), 'utf8'), 'unchanged\n')
    if (location === 'alternate') {
      const broadFile = path.join(env.valley, 'meadows', '~~', 'other', 'config.txt')
      assert.equal(fs.readFileSync(broadFile, 'utf8'), 'updated\n')
    }
  })
}

it('identifies valley targets by meadow.path rather than alternate install locations', () => {
  const env = setup({ overlap: true })
  fs.appendFileSync(path.join(env.valley, 'meadows.mjs'), `
    meadows.push({
      path: '~/unrelated',
      installPath: () => { throw new Error('Do not resolve unrelated install paths for valley targets') },
    })
  `)
  const broadMirror = path.join(env.valley, 'meadows', '~~', 'other')
  fs.mkdirSync(broadMirror, { recursive: true })
  const target = path.join(broadMirror, 'config.txt')
  fs.writeFileSync(target, 'broad settings\n')
  fs.writeFileSync(path.join(env.mirror, 'config.txt'), 'dots settings\n')

  const result = run(env, 'sow', target)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /broad sow/)
  assert.doesNotMatch(result.stdout, /dots sow/)
  assert.equal(fs.readFileSync(path.join(env.alternate, 'config.txt'), 'utf8'), 'broad settings\n')
  assert.equal(fs.readFileSync(path.join(env.original, 'config.txt'), 'utf8'), 'shared\n')
})
