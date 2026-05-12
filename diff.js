#!/usr/bin/env node

import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import { parseMeadows, fixInstalledPath, fixSourceControlPath, findMeadowForPath, runDirectly } from './common.js'

/**
 * `wildflower diff [<path>...]` — report live FS vs meadows-mirror divergence
 * for tracked paths. Read-only; never mutates. With no args, diffs every
 * meadow; with args, diffs only the named paths.
 *
 * Implementation note: delegates to `diff -rq` (recursively report differing
 * files, brief output). diff is universally available across the target hosts
 * (mac/wsl/termux/stockholm). Exit code aggregates the diff exit codes:
 *   0 = all paths identical
 *   1 = at least one divergence (paths or content)
 *   2 = at least one path not tracked or other error
 */
export async function diff(targets = null) {
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
      })
    }
  }

  let aggregateExit = 0
  for (const { live, meadow } of pairs) {
    const liveExists = fs.existsSync(live)
    const meadowExists = fs.existsSync(meadow)
    if (!liveExists && !meadowExists) {
      console.log(`Missing on both sides: ${live}`)
      aggregateExit = Math.max(aggregateExit, 2)
      continue
    }
    if (!liveExists) {
      console.log(`Only in meadows: ${meadow}`)
      aggregateExit = Math.max(aggregateExit, 1)
      continue
    }
    if (!meadowExists) {
      console.log(`Only in live FS: ${live}`)
      aggregateExit = Math.max(aggregateExit, 1)
      continue
    }
    const { code, out } = await runDiff(live, meadow)
    if (out.trim()) console.log(out.trimEnd())
    if (code !== 0) aggregateExit = Math.max(aggregateExit, code)
  }

  process.exit(aggregateExit)
}

function runDiff(live, meadow) {
  return new Promise((resolve) => {
    const child = spawn('diff', ['-rq', live, meadow], { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    child.stdout.on('data', d => out += d)
    child.stderr.on('data', d => out += d)
    child.on('close', code => resolve({ code: code ?? 0, out }))
  })
}

if (runDirectly()) await diff(process.argv.slice(2).length > 0 ? process.argv.slice(2) : null)
