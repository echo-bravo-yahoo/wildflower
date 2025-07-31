#!/usr/bin/env node

import copy from 'recursive-copy'
import * as fs from 'node:fs'
import { parseMeadows } from './common.js'
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
      // make sure we have a path
      let shouldGather = typeof meadow.if === "function"
        ? (await meadow.if?.()) && meadow.path
        : meadow.path
      if (shouldGather) {
        if (meadow.path) {
          await copy(
            fixInstalledPath(meadow.path),
            fixSourceControlPath(meadow.path),
            buildCopyOptions(copyOptions, meadow)
          )
            .then(() => console.log(`Copied '${fixInstalledPath(meadow.path)}' to '${fixSourceControlPath(meadow.path)}'`))
            .catch(logNoSuchFile)
        }
      } else {
        if (meadow.path) {
          console.log(`Skipping file "${meadow.path}" (step #${index}).`)
        } else if (meadow.name) {
          console.log(`Skipping step "${meadow.name}" (step #${index}).`)
        } else {
          console.log(`Skipping step # ${index}.`)
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
