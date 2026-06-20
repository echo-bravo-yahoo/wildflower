import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import path from 'node:path'

// Prime VALLEY_PATH before importing common.js so getValleyDir() resolves.
process.env.VALLEY_PATH = os.tmpdir()

const {
  meadowLabel,
  fixInstalledPath,
  fixSourceControlPath,
  matchesFilter,
  buildCopyOptions,
  findMeadowForPath,
} = await import('../common.js')

describe('meadowLabel', () => {
  it('uses path when present', () => {
    assert.equal(meadowLabel({ path: '~/foo' }, 0), '"~/foo" (step #0)')
  })
  it('falls back to name', () => {
    assert.equal(meadowLabel({ name: 'bar' }, 1), '"bar" (step #1)')
  })
  it('falls back to index only', () => {
    assert.equal(meadowLabel({}, 2), '# 2')
  })
})

describe('fixInstalledPath', () => {
  it('expands leading ~', () => {
    const result = fixInstalledPath('~/.zshrc')
    assert.equal(result, path.join(process.env.HOME, '.zshrc'))
  })
  it('passes through non-tilde paths', () => {
    assert.equal(fixInstalledPath('/etc/hosts'), '/etc/hosts')
  })
})

describe('fixSourceControlPath', () => {
  it('wraps HOME-relative paths in ~~ and places under meadows/', () => {
    const result = fixSourceControlPath(path.join(process.env.HOME, '.zshrc'))
    assert.ok(result.startsWith(os.tmpdir()), 'should be under valley dir')
    assert.ok(result.includes('meadows'), 'should be under meadows/')
    assert.ok(result.includes('~~'), 'should double-tilde HOME paths')
  })
})

describe('matchesFilter', () => {
  it('returns true when filter is undefined', () => {
    assert.equal(matchesFilter(undefined, 'any/path'), true)
  })
  it('matches glob array includes', () => {
    assert.equal(matchesFilter(['*.js'], 'foo.js'), true)
  })
  it('matches glob array negation', () => {
    assert.equal(matchesFilter(['*', '!*.json'], 'secret.json'), false)
  })
  it('calls function predicate', () => {
    assert.equal(matchesFilter((p) => p.endsWith('.md'), 'README.md'), true)
    assert.equal(matchesFilter((p) => p.endsWith('.md'), 'index.js'), false)
  })
})

describe('buildCopyOptions', () => {
  it('spreads base options', () => {
    const opts = buildCopyOptions({ dot: true, overwrite: true }, {})
    assert.equal(opts.dot, true)
    assert.equal(opts.overwrite, true)
  })
  it('injects filter when meadow has one', () => {
    const filter = ['*.js']
    const opts = buildCopyOptions({}, { filter })
    assert.deepEqual(opts.filter, filter)
  })
  it('does not set filter when meadow has none', () => {
    const opts = buildCopyOptions({}, {})
    assert.equal('filter' in opts, false)
  })
})

describe('findMeadowForPath', () => {
  const home = process.env.HOME
  const meadows = [
    { path: '~/' },
    { path: '~/.config/nvim' },
  ]

  it('returns null for untracked path', () => {
    assert.equal(findMeadowForPath('/tmp/untracked/file.txt', meadows), null)
  })

  it('returns the matching meadow for an exact path', () => {
    const match = findMeadowForPath(home, meadows)
    assert.ok(match)
    assert.equal(match.meadow.path, '~/')
  })

  it('longest-prefix meadow wins', () => {
    const target = path.join(home, '.config/nvim/init.lua')
    const match = findMeadowForPath(target, meadows)
    assert.ok(match)
    assert.equal(match.meadow.path, '~/.config/nvim')
  })

  it('sibling with shared prefix string but different separator does not match', () => {
    // ~/.config/nvimother should NOT match ~/.config/nvim
    const target = path.join(home, '.config/nvimother/init.lua')
    const match = findMeadowForPath(target, meadows)
    assert.ok(match)
    assert.equal(match.meadow.path, '~/')
  })
})
