#!/usr/bin/env node

import copy from 'recursive-copy'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions, parseMeadows, runDirectly, meadowLabel, curableCopy, copyPath, writeSyncMetadata } from './common.js'

export async function sow(targets = null) {
  const { meadows } = await parseMeadows()

  if (!meadows) {
    throw new Error("No meadows found! Make sure you're defining it in your meadows.mjs. (e.g. `({ meadows: [...] })`)")
  }

  // Per-file (targeted) mode — symmetric to gather. Resolve each target to its
  // owning meadow and copy just that path meadows → live FS, honoring the
  // meadow's `if` condition and filter. The per-meadow sow() callback is skipped
  // (whole-meadow semantics).
  if (targets && targets.length > 0) {
    let code = 0
    for (const target of targets) {
      code = Math.max(code, await copyPath(target, meadows, 'sow'))
    }
    if (code) process.exitCode = code
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

    // Records HEAD at sow time as the watermark; a valid 3-way merge base only
    // when the valley working tree was clean at sow. Only wholesale sow should
    // advance it — a future per-file sow must NOT write it. Sow is wholesale-only
    // today, so this single call site is correct.
    writeSyncMetadata()

    console.log('Done sowing.')
  } catch (err) {
    console.error('Error while sowing:', err)
  }
}

if (runDirectly()) await sow(process.argv.slice(2).length > 0 ? process.argv.slice(2) : null)
