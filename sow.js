#!/usr/bin/env node

import copy from 'recursive-copy'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions, parseMeadows, runDirectly, meadowLabel, curableCopy, copyPath } from './common.js'

export async function sow(targetPath) {
  const { meadows } = await parseMeadows()

  if (!meadows) {
    throw new Error("No meadows found! Make sure you're defining it in your meadows.mjs. (e.g. `({ meadows: [...] })`)")
  }

  // Per-file sow: with an explicit path, deploy only that file/subtree from its
  // mirror. Without a path, fall through to the wholesale sow below.
  if (targetPath) {
    return copyPath(targetPath, meadows, 'sow')
  }

  const copyOptions = {
    dot: true,
    overwrite: true,
    expand: true
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

if (runDirectly()) await sow(process.argv[2])
