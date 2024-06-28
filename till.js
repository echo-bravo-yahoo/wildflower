#!/usr/bin/env node

import * as fs from 'node:fs'

export async function till() {
  const example = `
({
  vars: {
  },
  meadows: [
    // copy in a file
    { path: '~/.zshrc' },

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
  ]
})
`.trim()

  try {
    fs.statSync("./meadows.js")
    console.log(`You already have a meadows.js in ${process.cwd()}. Did you mean to run wildflower in a different directory?`)
  } catch (e) {
    console.log(`Creating new sample meadows.js file in ${process.cwd()}! Modify it to start adding files to your meadows.`)
    fs.writeFileSync('./meadows.js', example)
  }
}

(async () => {
  if (process.argv[1].split('/').pop() !== 'wildflower.js')
    await till()
})()
