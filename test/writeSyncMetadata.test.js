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

const { writeSyncMetadata, getValleyDir, getWatermarkDir } = await import('../common.js')

describe('writeSyncMetadata', () => {
  after(() => {
    fs.rmSync(tmpGit, { recursive: true, force: true })
  })

  it('keeps the watermark in the valley itself for a plain checkout', () => {
    assert.equal(getWatermarkDir(), getValleyDir(), 'existing hosts must see no change')
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

// All worktrees of a valley deliver to the same home directory, so they must
// share one watermark. Resolved from a linked worktree, both the read and the
// write have to land on the main checkout's copy rather than minting a private
// one that leaves the main checkout's copy silently stale.
// Its own repo rather than tmpGit: node:test runs each describe's after() before
// the next describe's before(), so sharing tmpGit would hand this suite a
// directory the first suite had already removed.
describe('getWatermarkDir from a linked worktree', () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-test-wt-'))
  const mainCheckout = path.join(scratch, 'main')
  const wtPath = path.join(scratch, 'session')
  let wt

  before(async () => {
    const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: 'ignore' })
    fs.mkdirSync(mainCheckout)
    run('git init -q', mainCheckout)
    run('git config user.email test@test.com', mainCheckout)
    run('git config user.name Test', mainCheckout)
    run('git commit -q --allow-empty -m init', mainCheckout)
    run(`git worktree add -q -b session ${JSON.stringify(wtPath)}`, mainCheckout)
    process.env.VALLEY_PATH = wtPath
    // A fresh module instance: getValleyDir() caches, so the already-imported
    // copy is pinned to tmpGit. The query string is what makes it fresh.
    wt = await import('../common.js?worktree')
  })

  after(() => {
    process.env.VALLEY_PATH = tmpGit
    fs.rmSync(scratch, { recursive: true, force: true })
  })

  it('resolves to the main checkout, not the worktree', () => {
    assert.equal(fs.realpathSync(wt.getValleyDir()), fs.realpathSync(wtPath))
    assert.equal(fs.realpathSync(wt.getWatermarkDir()), fs.realpathSync(mainCheckout))
  })

  it('writes the main checkout watermark and leaves none in the worktree', () => {
    wt.writeSyncMetadata()
    assert.ok(fs.existsSync(path.join(mainCheckout, '.wildflower-state.json')), 'main checkout gets the watermark')
    assert.ok(!fs.existsSync(path.join(wtPath, '.wildflower-state.json')), 'worktree gets no private copy')
  })
})
