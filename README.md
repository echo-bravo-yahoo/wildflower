## Basic usage:
Modify meadows.js with the paths to the dotfiles you want to back up. Then run `node ./gather.js` to back the files up in `meadows/**` locally. Run `git init` from `meadows/`, then push your config files to git. From there, clone wildflower and your meadows repo. Run `node ./sow.js` to place the files in the correct place.

## Before making public:
- Comb through the git history and make sure no private details are exposed.

## Known bugs:
- Deleting a file in the filesystem and then running 'node gather' does not clear the file out of the meadows/ directory.
