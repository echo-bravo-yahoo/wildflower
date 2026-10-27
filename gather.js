#!/usr/bin/env node

import path from 'node:path'
import * as fs from 'node:fs'
import { parseMeadows, meadowLabel, copyPath, resolveBranchKey, gatherInstallPaths } from './common.js'
import { logNoSuchFile, buildCopyOptions, runDirectly } from './common.js'

export async function gather(targets = null) {
  const { meadows } = await parseMeadows()

  fs.mkdirSync('./meadows', { recursive: true })

  // Per-file (targeted) mode. Each target is a live FS path or a meadows mirror
  // path; process matching meadows in config order and copy just that path
  // live FS → meadows, honoring each meadow's condition, filter, and hook.
  if (targets && targets.length > 0) {
    let code = 0
    for (const target of targets) {
      code = Math.max(code, await copyPath(target, meadows, 'gather'))
    }
    if (code) process.exitCode = code
    return
  }

  const copyOptions = {
    dot: true,
    overwrite: true,
    expand: false,
    debug: false,
    filter: function (e) {
      return !(e.includes('node_modules'))
    }
  }

  try {
    for (const [index, meadow] of Object.entries(meadows)) {
      let shouldGather
      let branchKey
      try {
        shouldGather = meadow.if ? await meadow.if?.() : true
        branchKey = shouldGather ? await resolveBranchKey(meadow) : null
      } catch (error) {
        console.error(`ERROR: ${meadowLabel(meadow, index)} -- 'if' or 'by' threw before this meadow could run; skipping just this meadow.`)
        console.error(error)
        continue
      }

      // Checked before capableOfGather so the "isn't capable" message
      // below can't mask this refusal.
      if (shouldGather && branchKey === undefined) {
        console.log(`Skipping ${meadowLabel(meadow, index)} -- by() returned no identity for this host; nothing to gather into.`)
        continue
      }

      let capableOfGather = Boolean(meadow.path) || Boolean(meadow.gather)
      if (shouldGather && capableOfGather) {
        let copiedFiles

        if (meadow.path) {
          try {
            const result = await gatherInstallPaths(meadow, branchKey, buildCopyOptions(copyOptions, meadow))
            if (result.conflicts.length) {
              for (const conflict of result.conflicts) {
                console.error(`WARNING: '${conflict.rel}' differs across install paths. Wrote a merge conflict file to '${path.join(result.mirror, conflict.rel)}'. Resolve the installed copies and run gather again.`)
              }
              process.exitCode = 1
              return
            }
            let operations = result.operations

            // possibly there's a bug where the operation doesn't work
            copiedFiles = operations.map(operation => operation.dest)

            console.log(`Copied '${result.installs.join("', '")}' to '${result.mirror}'`)
          } catch (e) {
            logNoSuchFile(e)
          }
        }

        if (meadow.gather) {
          try {
            await meadow.gather({ copiedFiles })
          } catch (error) {
            console.error(`ERROR: Gather failed for ${meadowLabel(meadow, index)}!`)
            console.error(error)
          }
        }
      } else {
        if (!capableOfGather) {
          console.log(`Skipping ${meadowLabel(meadow, index)} b/c this meadow isn't capable of it.`)
        } else {
          console.log(`Skipping ${meadowLabel(meadow, index)} b/c the condition didn't pass.`)
        }
      }
    }
    console.log('Done gathering.')
  } catch (err) {
    console.error('Error while gathering:', err)
  }

  // At some point, we should probably add a separate command to clean up files that have been previously committed, but aren't referenced by the meadows.mjs anymore. That would require some thinking so we don't remove files we're skipping on this system, but are referenced in meadows.mjs.
}

if (runDirectly()) await gather(process.argv.slice(2).length > 0 ? process.argv.slice(2) : null)
