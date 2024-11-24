#!/usr/bin/env node

import copy from 'recursive-copy'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions, parseMeadows, runDirectly } from './common.js'

export async function sow() {
  const { meadows } = await parseMeadows()

  if (!meadows) {
    throw new Error("No meadows found! Make sure you're defining it in your meadows.mjs. (e.g. `({ meadows: [...] })`)")
  }

  const copyOptions = {
    dot: true,
    overwrite: true,
    expand: true
  }

  try {
    for (const [index, meadow] of Object.entries(meadows)) {
      let shouldSow = await (meadow.if?.() ?? true)
      if (shouldSow) {

        // We could, if we wanted to get smart, throw files together in a batch, then trigger them asynchronously.
        if (meadow.path) {
          await copy(
            fixSourceControlPath(meadow.path),
            fixInstalledPath(meadow.path),
            buildCopyOptions(copyOptions, meadow)
          )
            .then(() => console.log(`Copied '${fixSourceControlPath(meadow.path)}' to '${fixInstalledPath(meadow.path)}'`))
            .catch(logNoSuchFile)
        } else if (meadow.run) {
          await meadow.run()
        }
      } else {
        if (meadow.path) {
          console.log(`Skipping file "${meadow.path}" (step # ${index}).`)
        } else if (meadow.name) {
          console.log(`Skipping step "${meadow.name}" (step # ${index}).`)
        } else {
          console.log(`Skipping step # ${index}.`)
        }
      }
    }

    console.log('Done sowing.')
  } catch (err) {
    console.error('Error while sowing:', err)
  }
}

if (runDirectly()) await sow()
