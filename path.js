#!/usr/bin/env node

import { mapPath, runDirectly } from './common.js'

/**
 * `wildflower path <target>` — map a tracked path between its live FS form
 * and its meadows-mirror form. Pure: no I/O beyond reading meadows.mjs.
 *
 * Direction is inferred from whether <target> is under the meadows/ tree
 * or under the live FS (typically $HOME).
 */
export async function pathCmd(targets = []) {
  if (targets.length === 0) {
    console.error('Error: wildflower path requires at least one path argument')
    process.exit(2)
  }

  let exitCode = 0
  for (const target of targets) {
    try {
      const mapped = await mapPath(target)
      console.log(mapped)
    } catch (err) {
      if (err.code === 'ENOMEADOW') {
        console.error(err.message)
        exitCode = 1
      } else {
        throw err
      }
    }
  }
  process.exit(exitCode)
}

if (runDirectly()) await pathCmd(process.argv.slice(2))
