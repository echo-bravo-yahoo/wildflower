#!/usr/bin/env node

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import path from 'node:path'
import { parseMeadows, fixInstalledPath, fixSourceControlPath, findMeadowForPath, matchesFilter, runDirectly } from './common.js'

/**
 * `wildflower diff [<path>...] [--verbose]` — report live FS vs meadows-mirror
 * divergence for tracked paths. Read-only; never mutates. With no args, diffs
 * every meadow; with args, diffs only the named paths.
 *
 * Honors each meadow's filter: filter-excluded paths (e.g. *-tokens.json) are
 * never mirrored, so reporting them as divergent is just noise — they're
 * suppressed on both sides.
 *
 * Brief by default (which files differ); `--verbose` additionally prints the
 * unified patch for each differing file. One-sided files (present on only one
 * side) stay brief even in verbose to avoid dumping whole files.
 *
 * Implementation note: delegates to `diff` (universally available across the
 * target hosts: mac/wsl/termux/stockholm) — `-rq` to decide the filtered set,
 * then `-u` per included differing file in verbose mode. Exit code aggregates:
 *   0 = all tracked paths identical
 *   1 = at least one divergence (paths or content)
 *   2 = at least one path not tracked or other error
 */
export async function diff(targets = null, { verbose = false } = {}) {
  const { meadows } = await parseMeadows()

  let pairs = []
  if (targets && targets.length > 0) {
    let resolveErrors = 0
    for (const target of targets) {
      const match = findMeadowForPath(target, meadows)
      if (!match) {
        console.error(`Skipping '${target}': not in meadows.mjs`)
        resolveErrors = 1
        continue
      }
      const rel = match.absolute.slice(match.installed.length)
      pairs.push({
        live: match.absolute,
        meadow: fixSourceControlPath(match.meadow.path) + rel,
        root: match.installed,
        mirrorRoot: fixSourceControlPath(match.meadow.path),
        filter: match.meadow.filter,
      })
    }
    if (resolveErrors && pairs.length === 0) {
      process.exit(2)
    }
  } else {
    for (const meadow of meadows) {
      if (!meadow.path) continue
      pairs.push({
        live: fixInstalledPath(meadow.path),
        meadow: fixSourceControlPath(meadow.path),
        root: path.resolve(fixInstalledPath(meadow.path)),
        mirrorRoot: fixSourceControlPath(meadow.path),
        filter: meadow.filter,
      })
    }
  }

  let aggregateExit = 0
  for (const { live, meadow, root, mirrorRoot, filter } of pairs) {
    // Whether a path (under either root) is included by the meadow's filter.
    const included = (p) => {
      let rel = relUnder(p, root)
      if (rel === null) rel = relUnder(p, mirrorRoot)
      if (rel === null) return true
      return matchesFilter(filter, rel)
    }

    const liveExists = fs.existsSync(live)
    const meadowExists = fs.existsSync(meadow)
    if (!liveExists && !meadowExists) {
      console.log(`Missing on both sides: ${live}`)
      aggregateExit = Math.max(aggregateExit, 2)
      continue
    }
    if (!liveExists) {
      if (!included(meadow)) continue
      console.log(`Only in meadows: ${meadow}`)
      aggregateExit = Math.max(aggregateExit, 1)
      continue
    }
    if (!meadowExists) {
      if (!included(live)) continue
      console.log(`Only in live FS: ${live}`)
      aggregateExit = Math.max(aggregateExit, 1)
      continue
    }
    const { out } = await runDiff(['-rq', live, meadow])
    // Drop lines about filter-excluded paths; report only tracked divergence.
    const blocks = []
    for (const line of out.split('\n')) {
      if (!line.trim()) continue
      const info = parseDiffLine(line)
      if (info && info.path !== null && !included(info.path)) continue
      if (verbose && info && info.a && info.b) {
        // Expand "Files A and B differ" into its unified patch.
        const { out: patch } = await runDiff(['-u', info.a, info.b])
        blocks.push(patch.trimEnd() || line)
      } else {
        blocks.push(line)
      }
    }
    if (blocks.length) {
      console.log(blocks.join('\n'))
      aggregateExit = Math.max(aggregateExit, 1)
    }
  }

  process.exit(aggregateExit)
}

// Path of `p` relative to `root` (posix), or null if not under root.
function relUnder(p, root) {
  if (p === root) return ''
  if (p.startsWith(root + path.sep)) return p.slice(root.length + 1).split(path.sep).join('/')
  return null
}

// Parse a `diff -rq` line into { path, a, b }: `path` is the filesystem path the
// line refers to (for filtering); `a`/`b` are the two file paths when the line
// is "Files A and B differ" (so verbose mode can re-diff them), else null.
// Unrecognized lines return null and are kept as-is (real errors stay visible).
function parseDiffLine(line) {
  let m = line.match(/^Files (.+?) and (.+?) differ$/)
  if (m) return { path: m[1], a: m[1], b: m[2] }
  m = line.match(/^Only in (.+?): (.+)$/)
  if (m) return { path: path.join(m[1], m[2]), a: null, b: null }
  return null
}

function runDiff(args) {
  return new Promise((resolve) => {
    const child = spawn('diff', args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', d => out += d)
    child.stderr.on('data', d => out += d)
    child.on('close', code => resolve({ code: code ?? 0, out }))
  })
}

if (runDirectly()) {
  const args = process.argv.slice(2)
  const verbose = args.includes('--verbose')
  const paths = args.filter((a) => a !== '--verbose')
  await diff(paths.length > 0 ? paths : null, { verbose })
}
