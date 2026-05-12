#!/usr/bin/env node

import copy from 'recursive-copy'
import * as fs from 'node:fs'
import path from 'node:path'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions, parseMeadows, runDirectly, meadowLabel, curableCopy, findMeadowForPath } from './common.js'

export async function sow(targets = null) {
  const { meadows } = await parseMeadows()

  if (!meadows) {
    throw new Error("No meadows found! Make sure you're defining it in your meadows.mjs. (e.g. `({ meadows: [...] })`)")
  }

  // Per-file (targeted) mode. Symmetric to gather's targeted mode: each
  // target resolves to a meadow, and we copy just the mirror path back to
  // its live FS location. Meadow `if` conditions and `meadow.sow()` callbacks
  // are skipped because they're whole-meadow semantics.
  if (targets && targets.length > 0) {
    let exitCode = 0
    for (const target of targets) {
      const match = findMeadowForPath(target, meadows)
      if (!match) {
        console.error(`Skipping '${target}': not in meadows.mjs (add it to track)`)
        exitCode = 1
        continue
      }
      const rel = match.absolute.slice(match.installed.length)
      const src = fixSourceControlPath(match.meadow.path) + rel
      const dst = match.absolute
      try {
        fs.mkdirSync(path.dirname(dst), { recursive: true })
        await copy(src, dst, { dot: true, overwrite: true, expand: false })
        console.log(`Sowed '${src}' to '${dst}'`)
      } catch (e) {
        logNoSuchFile(e)
        exitCode = 1
      }
    }
    if (exitCode !== 0) process.exitCode = exitCode
    return
  }

  const copyOptions = {
    // expand: false preserves symlinks; tracking-as-symlinks (e.g. a script
    // mirrored from a separate workspace) depends on this. Keep aligned with
    // gather.js so the round-trip is type-preserving.
    dot: true,
    overwrite: true,
    expand: false
  }

  try {
    for (const [index, meadow] of Object.entries(meadows)) {
      let shouldSow = meadow.if ? await meadow.if?.() : true
      let capableOfSow = Boolean(meadow.path) || Boolean(meadow.sow)
      if (shouldSow && capableOfSow) {
        let copiedFiles

        // We could, if we wanted to get smart, throw files together in a batch, then trigger them asynchronously.
        if (meadow.path) {
          try {
            let operations = await (meadow.curable ? curableCopy : copy)(
              fixSourceControlPath(meadow.path),
              fixInstalledPath(meadow.path),
              buildCopyOptions(copyOptions, meadow)
            )

            copiedFiles = operations.map(operation => operation.dest)

            console.log(`Copied '${fixSourceControlPath(meadow.path)}' to '${fixInstalledPath(meadow.path)}'`)
          } catch (error) {
            logNoSuchFile(error)
          }
        }

        if (meadow.sow) {
          try {
            await meadow.sow({copiedFiles})
          } catch (error) {
            console.error(`ERROR: Sow failed for ${meadowLabel(meadow, index)}!`)
            console.error(error)
          }
        }
      } else {
        if (!capableOfSow) {
          console.log(`Skipping ${meadowLabel(meadow, index)} b/c this meadow isn't capable of it.`)
        } else {
          console.log(`Skipping ${meadowLabel(meadow, index)} b/c the condition didn't pass.`)
        }
      }
    }

    console.log('Done sowing.')
  } catch (err) {
    console.error('Error while sowing:', err)
  }
}

if (runDirectly()) await sow(process.argv.slice(2).length > 0 ? process.argv.slice(2) : null)
