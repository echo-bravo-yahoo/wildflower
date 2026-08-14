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
  resolveBranchKey,
  resolveSowSource,
  hostname,
  stripLocalSuffix,
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

describe('fixSourceControlPath with a branch key', () => {
  it('splices in ~by~/<key>/ before the ~~ wrap for a string key', () => {
    const result = fixSourceControlPath(path.join(process.env.HOME, '.gitconfig'), 'stockholm')
    assert.ok(result.includes(path.join('~by~', 'stockholm', '~~', '.gitconfig')))
  })
  it('routes an undefined key to the reserved ~default segment', () => {
    const result = fixSourceControlPath(path.join(process.env.HOME, '.gitconfig'), undefined)
    assert.ok(result.includes(path.join('~by~', '~default', '~~', '.gitconfig')))
  })
  it('is identical to the no-key form when branchKey is null or omitted', () => {
    const omitted = fixSourceControlPath(path.join(process.env.HOME, '.gitconfig'))
    const nulled = fixSourceControlPath(path.join(process.env.HOME, '.gitconfig'), null)
    assert.equal(omitted, nulled)
  })
})

describe('resolveBranchKey', () => {
  it('returns null when the meadow has no by', async () => {
    assert.equal(await resolveBranchKey({}), null)
  })
  it('trims a sync by()', async () => {
    assert.equal(await resolveBranchKey({ by: () => '  heron  ' }), 'heron')
  })
  it('awaits an async by()', async () => {
    assert.equal(await resolveBranchKey({ by: async () => 'heron' }), 'heron')
  })
  it('resolves to undefined when by() returns undefined', async () => {
    assert.equal(await resolveBranchKey({ by: () => undefined }), undefined)
  })
  it('resolves to undefined when by() returns null', async () => {
    assert.equal(await resolveBranchKey({ by: () => null }), undefined)
  })
  it('memoizes by function reference -- evaluates once across repeated calls', async () => {
    let calls = 0
    const by = () => {
      calls++
      return 'heron'
    }
    await resolveBranchKey({ by })
    await resolveBranchKey({ by })
    await resolveBranchKey({ by })
    assert.equal(calls, 1)
  })
  it('does not share cache across distinct function references', async () => {
    let calls = 0
    const makeBy = () => () => {
      calls++
      return 'heron'
    }
    await resolveBranchKey({ by: makeBy() })
    await resolveBranchKey({ by: makeBy() })
    assert.equal(calls, 2)
  })
  it('rejects an empty (or whitespace-only) key', async () => {
    await assert.rejects(() => resolveBranchKey({ by: () => '   ' }))
  })
  it('rejects a key containing a slash', async () => {
    await assert.rejects(() => resolveBranchKey({ by: () => 'foo/bar' }))
  })
  it('rejects a key of ..', async () => {
    await assert.rejects(() => resolveBranchKey({ by: () => '..' }))
  })
  it('rejects reserved segment names, including ~default', async () => {
    await assert.rejects(() => resolveBranchKey({ by: () => '~by~' }))
    await assert.rejects(() => resolveBranchKey({ by: () => '~~' }))
    await assert.rejects(() => resolveBranchKey({ by: () => '~default' }))
  })
})

describe('resolveSowSource', () => {
  it('returns the plain path unchanged when branchKey is null (no by)', () => {
    const meadow = { path: '~/.zshrc' }
    const source = resolveSowSource(meadow, null)
    assert.equal(source.from, fixSourceControlPath('~/.zshrc'))
    assert.equal(source.usingDefault, false)
  })
  it('routes to ~default and flags usingDefault when branchKey is undefined', () => {
    const meadow = { path: '~/.gitconfig' }
    const source = resolveSowSource(meadow, undefined)
    assert.equal(source.from, fixSourceControlPath('~/.gitconfig', undefined))
    assert.ok(source.from.includes(path.join('~by~', '~default')))
    assert.equal(source.usingDefault, true)
  })
  it('reports exists: false when nothing is on disk for a given key', () => {
    const meadow = { path: '~/.nonexistent-for-test' }
    const source = resolveSowSource(meadow, 'nobody-has-gathered-this-key')
    assert.equal(source.from, fixSourceControlPath('~/.nonexistent-for-test', 'nobody-has-gathered-this-key'))
    assert.equal(source.usingDefault, false)
    assert.equal(source.exists, false)
  })
})

describe('stripLocalSuffix', () => {
  it('strips a trailing .local', () => {
    assert.equal(stripLocalSuffix('macbook.local'), 'macbook')
  })
  it('leaves non-.local names untouched', () => {
    assert.equal(stripLocalSuffix('heron'), 'heron')
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

  it('strips a ~by~/<key>/ prefix on reverse mapping, for any key (transparent read)', () => {
    const mirrorPath = fixSourceControlPath(path.join(home, '.config/nvim/init.lua'), 'some-other-host')
    const match = findMeadowForPath(mirrorPath, meadows)
    assert.ok(match)
    assert.equal(match.meadow.path, '~/.config/nvim')
    assert.equal(match.absolute, path.join(home, '.config/nvim/init.lua'))
    assert.equal(match.foreignBranchKey, 'some-other-host')
  })
})
