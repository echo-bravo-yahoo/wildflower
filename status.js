#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import crypto from 'node:crypto'
import * as fs from 'node:fs'
import path from 'node:path'
import {
  parseMeadows,
  fixInstalledPath,
  fixSourceControlPath,
  findMeadowForPath,
  matchesFilter,
  relUnder,
  runDirectly,
  getValleyDir,
  getWatermarkDir,
  resolveBranchKey,
  meadowLabel,
} from './common.js'

/**
 * `wildflower status [<path>...] [--porcelain|--json]` - classify every tracked
 * path by which side of the mirror has moved. Read-only; never mutates.
 *
 * `diff` answers "do these two files differ"; status answers the question that
 * actually decides what to do about it, by bringing in the sync watermark
 * (.wildflower-state.json, the commit the live FS was last sown to) as a third
 * input and treating it as a merge base:
 *
 *   missing   the mirror tracks it, the live filesystem doesn't have it
 *   synced    live content equals the mirror
 *   behind    live differs from the mirror but equals the watermark's blob for
 *             that path, so the mirror moved on and live is just un-sown
 *   ahead     live differs from both: someone edited it live since the sow
 *   unknown   no watermark, or the watermark commit is unreachable
 *
 * Files are enumerated from the mirror, so a live-only file (never gathered) is
 * out of scope here, and `sow` won't touch it either. Use `diff` to see those.
 *
 * Exit codes: 0 = nothing ahead, 1 = at least one path ahead, 2 = a named path
 * isn't tracked, or the valley isn't a git repo.
 */
export async function status(targets = null, { porcelain = false, json = false } = {}) {
  const { meadows } = await parseMeadows()
  const valley = getValleyDir()
  const watermarkDir = getWatermarkDir()

  if (!isGitRepo(watermarkDir)) {
    console.error(`Error: valley is not a git repo, so there is no watermark to compare against: ${valley}`)
    process.exitCode = 2
    return
  }

  // Meadow/target resolution mirrors diff.js: a target names a path inside some
  // meadow, and with no targets every meadow with a path is in scope.
  let untracked = false
  const pairs = []
  if (targets && targets.length > 0) {
    for (const target of targets) {
      const match = findMeadowForPath(target, meadows)
      if (!match) {
        console.error(`Skipping '${target}': not in meadows.mjs`)
        untracked = true
        continue
      }
      let branchKey
      try {
        // Honor an explicitly named foreign key; otherwise this host's own.
        branchKey = match.foreignBranchKey ?? await resolveBranchKey(match.meadow)
      } catch (error) {
        console.error(`Skipping '${target}': by() failed: ${error.message}`)
        untracked = true
        continue
      }
      const rel = match.absolute.slice(match.installed.length)
      pairs.push({
        meadow: match.meadow,
        mirror: fixSourceControlPath(match.meadow.path, branchKey) + rel,
        root: match.installed,
        mirrorRoot: fixSourceControlPath(match.meadow.path, branchKey),
      })
    }
  } else {
    for (const [index, meadow] of Object.entries(meadows)) {
      if (!meadow.path) continue
      let branchKey
      try {
        branchKey = await resolveBranchKey(meadow)
      } catch (error) {
        console.error(`Skipping ${meadowLabel(meadow, index)}: by() failed: ${error.message}`)
        continue
      }
      pairs.push({
        meadow,
        mirror: fixSourceControlPath(meadow.path, branchKey),
        root: path.resolve(fixInstalledPath(meadow.path)),
        mirrorRoot: fixSourceControlPath(meadow.path, branchKey),
      })
    }
  }

  // Keyed by live path so overlapping meadows or overlapping targets don't
  // report the same file twice.
  const tracked = new Map()
  for (const pair of pairs) {
    const shouldRun = pair.meadow.if ? await pair.meadow.if() : true
    if (!shouldRun) continue
    for (const mirrorFile of walk(pair.mirror)) {
      const rel = relUnder(mirrorFile, pair.mirrorRoot)
      if (rel === null) continue
      if (!matchesFilter(pair.meadow.filter, rel)) continue
      const live = rel === '' ? pair.root : path.join(pair.root, rel)
      tracked.set(live, mirrorFile)
    }
  }

  const watermark = readWatermark(watermarkDir)
  // Loaded on first need: a fully synced valley never has to read the tree.
  let baseTree

  function classify(live, mirror) {
    const liveId = blobIdOfPath(live)
    if (liveId === null) return 'missing'
    if (liveId === blobIdOfPath(mirror)) return 'synced'
    // Diverged from the mirror. Only the watermark says which side moved.
    if (!watermark) return 'unknown'
    if (baseTree === undefined) baseTree = readBaseTree(watermarkDir, watermark)
    if (baseTree === null) return 'unknown'
    const key = relUnder(mirror, valley)
    return key !== null && baseTree.get(key) === liveId ? 'behind' : 'ahead'
  }

  const results = []
  for (const [live, mirror] of tracked) {
    results.push({ state: classify(live, mirror), live, mirror })
  }

  const rank = { ahead: 0, unknown: 1, behind: 2, missing: 3, synced: 4 }
  results.sort((a, b) => (rank[a.state] - rank[b.state]) || a.live.localeCompare(b.live))

  const counts = { ahead: 0, unknown: 0, behind: 0, missing: 0, synced: 0 }
  for (const r of results) counts[r.state]++

  if (json) {
    console.log(JSON.stringify({ watermark, counts, files: results }, null, 2))
  } else if (porcelain) {
    // Like `git status --porcelain`: only what isn't clean.
    for (const r of results) {
      if (r.state !== 'synced') console.log(`${r.state}\t${r.live}`)
    }
  } else {
    for (const r of results) {
      if (r.state !== 'synced') console.log(`${r.state.padEnd(7)} ${r.live}`)
    }
    console.log(
      `${results.length} tracked, ${counts.synced} synced, ${counts.ahead} ahead, ` +
      `${counts.behind} behind, ${counts.missing} missing, ${counts.unknown} unknown`
    )
    if (counts.unknown > 0) {
      console.error(
        watermark
          ? `Warning: watermark commit ${watermark} is unreachable (orphaned by a rebase?). Run a wholesale sow to re-establish it, or reconstruct it with dotfiles-find-ancestor.sh.`
          : 'Warning: no watermark recorded in .wildflower-state.json, so behind and ahead cannot be told apart. Run a wholesale sow to establish one.'
      )
    }
  }

  // exitCode rather than exit(): stdout is async when it's a pipe, and
  // process.exit() drops whatever is still buffered. --json on a real valley
  // is large enough to be truncated mid-object by that.
  process.exitCode = untracked ? 2 : counts.ahead > 0 ? 1 : 0
}

function isGitRepo(dir) {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] })
    return true
  } catch {
    return false
  }
}

// The commit the live filesystem was last sown to, or null when there's no
// usable record (absent file, unreadable, malformed).
function readWatermark(dir) {
  try {
    const commit = JSON.parse(fs.readFileSync(path.join(dir, '.wildflower-state.json'), 'utf8')).commit
    return typeof commit === 'string' && commit ? commit : null
  } catch {
    return null
  }
}

// Repo-relative path to blob id, for every file in the watermark commit's tree.
// One `git ls-tree` rather than a `git rev-parse <commit>:<path>` per file,
// which matters at a few thousand tracked files. Null when the commit is
// unreachable, which is the caller's cue to report `unknown` rather than guess.
function readBaseTree(dir, commit) {
  let out
  try {
    out = execFileSync('git', ['ls-tree', '-r', '-z', commit], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 256 * 1024 * 1024,
    }).toString()
  } catch {
    return null
  }
  // Each -z record is `<mode> <type> <object>\t<path>` with the path unquoted.
  const tree = new Map()
  for (const record of out.split('\0')) {
    const tab = record.indexOf('\t')
    if (tab < 0) continue
    const meta = record.slice(0, tab).split(' ')
    if (meta.length < 3) continue
    tree.set(record.slice(tab + 1), meta[2])
  }
  return tree
}

// Every file under `root`, which may itself be a single file.
function walk(root) {
  let st
  try {
    st = fs.lstatSync(root)
  } catch {
    return []
  }
  if (!st.isDirectory()) return [root]
  const files = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (entry.isDirectory()) continue
    files.push(path.join(entry.parentPath ?? entry.path, entry.name))
  }
  return files
}

// Git's blob id for a buffer: sha1("blob <len>\0" + content). Computed here
// rather than shelling out to `git hash-object`, because one spawn per file
// would dominate the run in a valley with thousands of tracked files.
function blobId(buf) {
  return crypto.createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex')
}

// Blob id for a path on disk, or null when there's no file there. A symlink
// hashes its target string, which is what git stores for it, so a tracked
// symlink compares correctly against both the mirror and a committed blob.
function blobIdOfPath(p) {
  try {
    const st = fs.lstatSync(p)
    if (st.isSymbolicLink()) return blobId(Buffer.from(fs.readlinkSync(p)))
    if (!st.isFile()) return null
    return blobId(fs.readFileSync(p))
  } catch {
    return null
  }
}

if (runDirectly()) {
  const args = process.argv.slice(2)
  const porcelain = args.includes('--porcelain')
  const json = args.includes('--json')
  const paths = args.filter((a) => a !== '--porcelain' && a !== '--json')
  await status(paths.length > 0 ? paths : null, { porcelain, json })
}
