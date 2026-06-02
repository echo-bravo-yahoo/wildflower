#!/usr/bin/env node

import copy from 'recursive-copy'
import maximatch from 'maximatch'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseMeadows, meadowLabel, curableCopy } from './common.js'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions, runDirectly } from './common.js'

export async function gather(targetPath) {
  const { meadows } = await parseMeadows()

  // Per-file gather: with an explicit path, capture only that file/subtree so
  // concurrent edits to other tracked files don't bleed into the working tree.
  // Without a path, fall through to the wholesale gather below (used by
  // dotfiles-update.sh).
  if (targetPath) {
    return gatherPath(targetPath, meadows)
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

// Gather a single tracked path (file or subtree) into its mirror. Finds the
// meadow that owns the path, honors that meadow's `if` condition and filter,
// then copies only files under the target — leaving every other tracked file
// in the working tree untouched.
async function gatherPath(targetPath, meadows) {
  const abs = path.resolve(fixInstalledPath(targetPath))

  let owner
  for (const [index, meadow] of Object.entries(meadows)) {
    if (!meadow.path) continue
    const root = path.resolve(fixInstalledPath(meadow.path))
    if (abs === root || abs.startsWith(root + path.sep)) {
      owner = { index, meadow, root }
      break
    }
  }
  if (!owner) {
    console.error(`No meadow in meadows.mjs tracks '${abs}'. Add it, or gather the whole valley.`)
    process.exit(1)
  }
  const { index, meadow, root } = owner

  const shouldGather = meadow.if ? await meadow.if() : true
  if (!shouldGather) {
    console.log(`Skipping '${abs}' — ${meadowLabel(meadow, index)} condition didn't pass on this host.`)
    return
  }

  // Path of the target relative to the meadow root (posix-style, as the meadow
  // glob filters expect). Empty when the target IS the meadow root.
  const relTarget = path.relative(root, abs).split(path.sep).join('/')
  const meadowFilter = meadow.filter

  const options = {
    dot: true,
    overwrite: true,
    expand: false,
    filter(entry) {
      const norm = String(entry).split(path.sep).join('/')
      // Restrict the copy to the target (and the dirs needed to reach it).
      if (relTarget !== '') {
        const isTarget = norm === relTarget || norm.startsWith(relTarget + '/')
        const isAncestorDir = relTarget.startsWith(norm + '/')
        if (!isTarget && !isAncestorDir) return false
        // Ancestor dirs only need traversal — skip the meadow filter for them.
        if (isAncestorDir && !isTarget) return true
      }
      // Honor the meadow's own include/exclude filter (e.g. !*-tokens.json).
      if (Array.isArray(meadowFilter)) return maximatch([norm], meadowFilter).length > 0
      if (typeof meadowFilter === 'function') return meadowFilter(entry)
      return true
    },
  }

  try {
    const operations = await copy(fixInstalledPath(meadow.path), fixSourceControlPath(meadow.path), options)
    const files = operations.filter((op) => op.stats?.isFile?.() ?? true)
    if (files.length === 0) {
      console.error(`Nothing gathered for '${abs}' — excluded by the ${meadowLabel(meadow, index)} filter?`)
      process.exit(1)
    }
    for (const op of files) {
      console.log(`Copied '${op.src}' to '${op.dest}'`)
    }
  } catch (e) {
    logNoSuchFile(e)
  }
}

if (runDirectly()) await gather(process.argv[2])
