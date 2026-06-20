import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import os from 'node:os'

// diff.js has a runDirectly() guard that calls diff() → process.exit() when
// argv[1] isn't wildflower.js/wildflower. Setting argv[1] suppresses it so the
// module finishes loading without killing the test process.
process.env.VALLEY_PATH = os.tmpdir()
process.argv[1] = 'wildflower.js'

const { parseDiffLine, relUnder } = await import('../diff.js')

describe('parseDiffLine', () => {
  it('parses "Files A and B differ"', () => {
    const result = parseDiffLine('Files /a/foo.txt and /b/foo.txt differ')
    assert.deepEqual(result, { path: '/a/foo.txt', a: '/a/foo.txt', b: '/b/foo.txt' })
  })

  it('parses "Only in dir: file"', () => {
    const result = parseDiffLine('Only in /some/dir: file.txt')
    assert.deepEqual(result, { path: path.join('/some/dir', 'file.txt'), a: null, b: null })
  })

  it('returns null for unrecognized lines', () => {
    assert.equal(parseDiffLine('Binary files differ'), null)
    assert.equal(parseDiffLine(''), null)
  })
})

describe('relUnder', () => {
  it('returns empty string for exact match', () => {
    assert.equal(relUnder('/a/b', '/a/b'), '')
  })

  it('returns posix-relative path for subpath', () => {
    assert.equal(relUnder('/a/b/c/d.txt', '/a/b'), 'c/d.txt')
  })

  it('returns null when not under root', () => {
    assert.equal(relUnder('/x/y', '/a/b'), null)
  })

  it('does not match sibling with shared prefix string', () => {
    // /a/bc should not be "under" /a/b
    assert.equal(relUnder('/a/bc/d', '/a/b'), null)
  })
})
