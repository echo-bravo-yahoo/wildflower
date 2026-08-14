#!/usr/bin/env node

import * as fs from 'node:fs'
import { runDirectly } from './common.js'

export async function till() {
  const example = `
const os = await import("os")

let linux = os.platform === 'linux'

export const meadows = [
  // copy in a file
  { path: '~/.zshrc' },

  // copy in a file, but only on linux
  {
    if: () => linux,
    path: '~/.zshrc'
  },

  // copy in a file, but split by a resolved key ("by") -- e.g. per-host.
  // Each key's variant lives side by side in the mirror under
  // meadows/~by~/<key>/, so switching hosts never overwrites another
  // host's variant. If by() returns undefined (e.g. an unlisted host
  // falling out of a lookup table), sow reads a shared '~default' variant
  // instead, when one exists -- gather never writes there. NOT a secrecy
  // mechanism -- every key's variant is still committed to the same shared
  // repo; use \`filter\` (e.g. '!*-tokens.json') to keep something out of
  // the mirror entirely.
  {
    path: '~/.gitconfig',
    by: () => hostname(),
  },

  // copy in a folder, but exclude subfolders
  {
    path: '~/some/folder',
    filter: [
      // required to work
      '**/**',

      // folders need !Folder (for the directory itself) and !Folder/** (for it's files)
      // if you're using git to store these, you can skip the directory ignore

      // include all
      '**/**',

      // except this_folder
      '!**/this_folder',
      '!**/this_folder/**',
    ]
  },
]
`.trim()

  try {
    fs.statSync("./valley/meadows.mjs")
    console.log(`You already have a meadows.mjs in ${process.cwd()}/valley. Did you mean to run 'till' in a different directory?`)
  } catch (e) {
    console.log(`Creating new sample meadows.mjs file in ${process.cwd()}/valley! Modify it to start adding files to your meadows.`)
    fs.mkdirSync('./valley/meadows', { recursive: true })
    fs.writeFileSync('./valley/meadows.mjs', example)
  }
}

if (runDirectly()) await till()
