import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'

// The CLI runs update-notifier at import time and ends in process.exit(), so
// each case spawns the real CLI in a child process.
const CLI = path.join(import.meta.dirname, '..', 'wildflower.js')
const pkg = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8'))

function run(args) {
  const res = spawnSync(process.execPath, [CLI, ...args], {
    env: { ...process.env, NO_UPDATE_NOTIFIER: '1' },
    encoding: 'utf8',
  })
  return { code: res.status, stdout: res.stdout, stderr: res.stderr }
}

describe('wildflower --version', () => {
  it('prints the package.json version and exits 0', () => {
    const { code, stdout, stderr } = run(['--version'])
    assert.equal(code, 0)
    assert.equal(stdout, `${pkg.version}\n`)
    assert.equal(stderr, '')
  })

  it('prints a semver-shaped version', () => {
    assert.match(run(['--version']).stdout, /^\d+\.\d+\.\d+/)
  })

  for (const alias of ['-v', 'version']) {
    it(`matches --version for '${alias}'`, () => {
      const { code, stdout } = run([alias])
      assert.equal(code, 0)
      assert.equal(stdout, `${pkg.version}\n`)
    })
  }

  it('is listed in the top-level help', () => {
    const { code, stdout } = run(['--help'])
    assert.equal(code, 0)
    assert.match(stdout, /--version/)
  })
})
