#!/usr/bin/env node

import copy from 'recursive-copy'
import * as fs from 'node:fs'
import { parseMeadows } from './common.js'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions } from './common.js'

export async function gather() {
  const { meadows, vars } = parseMeadows()

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

  const promises = meadows.map(async (meadow) => {
    if (await (meadow.if?.(vars) ?? true)) {
      if (meadow.path) {
        return copy(
          fixInstalledPath(meadow.path),
          fixSourceControlPath(meadow.path),
          buildCopyOptions(copyOptions, meadow)
        )
          .then((...args) => console.log(`Copied '${fixInstalledPath(meadow.path)}' to '${fixSourceControlPath(meadow.path)}'`))
          .catch(logNoSuchFile)
      }
      // we're ignoring "run"s during gather for now.
    } else {
      if (meadow.path) {
        console.log(`Skipping '${meadow.path}' on this system.`)
      }
    }
  })

  await Promise.all(promises)
    .then(() => console.log('Done gathering.'))
    .catch((err) => console.error('Error while gathering:', err))

  // At some point, we should probably clean up files that have been previously committed, but aren't referenced by the meadows.js anymore. That would require some thinking so we don't remove files we're skipping on this system, but are referenced in meadows.js.
}

(async () => {
  if (process.argv[1].split('/').pop() === 'wildflower.js')
    await gather()
})()
