#!/usr/bin/env node

import copy from 'recursive-copy'
import * as fs from 'node:fs'
import { parseMeadows, meadowLabel, curableCopy } from './common.js'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions, runDirectly } from './common.js'

export async function gather() {
  const { meadows } = await parseMeadows()

  const copyOptions = {
    dot: true,
    overwrite: true,
    expand: false,
    debug: false,
    filter: function (e) {
      return !(e.includes('node_modules'))
    }
  }

  fs.mkdirSync('./meadows', { recursive: true })

  try {
    for (const [index, meadow] of Object.entries(meadows)) {
      let shouldGather = meadow.if ? await meadow.if?.() : true
      let capableOfGather = Boolean(meadow.path) || Boolean(meadow.gather)
      if (shouldGather && capableOfGather) {
        let copiedFiles

        if (meadow.path) {
          try {
            let operations = await (meadow.curable ? curableCopy : copy)(
              fixInstalledPath(meadow.path),
              fixSourceControlPath(meadow.path),
              buildCopyOptions(copyOptions, meadow)
            )
            
            // possibly there's a bug where the operation doesn't work
            copiedFiles = operations.map(operation => operation.dest)

            console.log(`Copied '${fixInstalledPath(meadow.path)}' to '${fixSourceControlPath(meadow.path)}'`)
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

if (runDirectly()) await gather()
