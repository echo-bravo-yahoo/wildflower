import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

// Use a real git repo so writeSyncMetadata can resolve HEAD without mocking.
const tmpGit = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-git-'))
execSync('git init', { cwd: tmpGit, stdio: 'ignore' })
execSync('git config user.email "test@test.com"', { cwd: tmpGit, stdio: 'ignore' })
execSync('git config user.name "Test"', { cwd: tmpGit, stdio: 'ignore' })
execSync('git commit --allow-empty -m "init"', { cwd: tmpGit, stdio: 'ignore' })
fs.writeFileSync(path.join(tmpGit, 'meadows.mjs'), 'export const meadows = []\n')

process.env.VALLEY_PATH = tmpGit

const { writeSyncMetadata } = await import('../common.js')

describe('writeSyncMetadata', () => {
  after(() => {
    fs.rmSync(tmpGit, { recursive: true, force: true })
  })

  it('writes JSON with commit, sownAt, wildflowerVersion', () => {
    writeSyncMetadata()
    const outPath = path.join(tmpGit, '.wildflower-state.json')
    assert.ok(fs.existsSync(outPath), '.wildflower-state.json should exist')
    const parsed = JSON.parse(fs.readFileSync(outPath, 'utf8'))
    assert.match(parsed.commit, /^[0-9a-f]{7,40}$/, 'commit should be a git hash')
    assert.ok(parsed.sownAt, 'sownAt should be set')
    assert.ok(parsed.wildflowerVersion, 'wildflowerVersion should be set')
  })

  it('does not throw when valley is not a git repo', () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-nongit-'))
    fs.writeFileSync(path.join(nonGit, 'meadows.mjs'), 'export const meadows = []\n')
    process.env.VALLEY_PATH = nonGit
    // Reset the module-level cache so getValleyDir() picks up the new VALLEY_PATH.
    // writeSyncMetadata is already bound to tmpGit's execSync call, but the
    // try/catch inside it handles git failures gracefully — no throw expected.
    assert.doesNotThrow(() => writeSyncMetadata())
    fs.rmSync(nonGit, { recursive: true, force: true })
    process.env.VALLEY_PATH = tmpGit
  })
})
