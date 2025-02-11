#!/usr/bin/env node

import * as fs from 'node:fs'
import path from 'node:path'

import { runDirectly } from './common.js'

const __dirname = import.meta.dirname;

export async function till() {
  const example = `
const os = await import("os")

let linux = os.platform === 'linux'

export const meadows = [
  // copy in a file
  { path: '~/.zshrc' },

  // copy in a file, but only on linux
  {
    if: () => linux
    path: '~/.zshrc'
  },

  // copy in a folder, but exclude subfolders
  {
    path: '~/some/folder',
    filter: [
      // folders need !Folder (for the directory itself) and !Folder/** (for it's files)
      // if you're using git to store these, you can skip the directory ignore

      // include all
      '**/**',

      // except this_folder
      '!**/this_folder',
      '!**/this_folder/**',
    ]
  },
])
`.trim()

  try {
    fs.statSync(path.join(__dirname, "/valley/meadows.mjs"))
    console.log(`You already have a meadows.mjs in ${__dirname}/valley. Did you mean to run wildflower in a different directory?`)
  } catch (e) {
    console.log(`Creating new sample meadows.mjs file in ${__dirname}/valley! Modify it to start adding files to your meadows.`)
    fs.mkdirSync(path.join(__dirname, '/valley/meadows'), { recursive: true })
    fs.writeFileSync(path.join(__dirname, '/valley/meadows.mjs'), example)
  }
}

if (runDirectly()) await till()
