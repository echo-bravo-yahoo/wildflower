const example = `[ 
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
]`

try {
  Deno.statSync("./meadows.js")
  console.log(`You already have a meadows.js in ${Deno.cwd()}. Did you mean to run wildflower in a different directory?`)
} catch(e) {
  console.log(`Creating new sample meadows.js file in ${Deno.cwd()}! Modify it to start adding files to your meadows.`)
  Deno.writeTextFileSync('./meadows.js', example)
}