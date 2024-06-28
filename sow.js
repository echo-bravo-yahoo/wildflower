#!/usr/bin/env node

import copy from 'recursive-copy'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions, parseMeadows } from './common.js'

export async function sow() {
  const { meadows, vars } = parseMeadows()

  if (!meadows) {
    throw new Error("No meadows found! Make sure you're defining it in your meadows.js. (e.g. `({ meadows: [...] })`)")
  }

  const copyOptions = {
    dot: true,
    overwrite: true,
    expand: true
  }

  try {
    for (const [index, meadow] of Object.entries(meadows)) {
      let shouldSowMeadow = await (meadow.if?.(vars) ?? true)
      if (shouldSowMeadow) {

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
          await meadow.run(vars)
        }
      } else {
        if (meadow.path) {
          console.log(`Skipping file '${meadow.path}'.`)
        } else if (meadow.run) {
          console.log(`Skipping run step "${meadow.name || `Step ${index}`}".`)
        }
      }
    }

    console.log('Done sowing.')
  } catch (err) {
    console.error('Error while sowing:', err)
  }
}

(async () => {
  if (process.argv[1].split('/').pop() !== 'wildflower.js')
    await sow()
})()
