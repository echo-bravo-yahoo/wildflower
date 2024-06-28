## Basic usage:
### First time users

1. Install node.
2. Install wildflower globally with `npm install --global https://github.com/echo-bravo-yahoo/wildflower`. If you prefer, you can clone this repository and install its dependencies instead with `git clone git@github.com:echo-bravo-yahoo/wildflower.git && cd wildflower && npm install`.
3. From the parent directory of where you would like to store your version-controllable dotfiles, run `wildflower till`. This will create a directory named `valley` containing a sample config file named `meadows.js` and a directory to store dotfiles in named `meadows`. Skip down to [the filesystem section](#Filesystem) for a full description.
4. Add descriptions of the files you want to gather to `valley/meadows.js`.
5. Run `wildflower gather`. This will collect all the files you specified in `valley/meadows.js` into the `valley/meadows` directory. Files in your home directory (`~`) will be stored in `valley/meadows/~~`; everything else will be stored by its verbatim path.
6. Back up or version control the contents of `./valley` however you like.

### Returning users on a new device

1. Install node.
2. Install wildflower globally with `npm install --global https://github.com/echo-bravo-yahoo/wildflower`. If you prefer, you can clone this repository and install its dependencies instead with `git clone git@github.com:echo-bravo-yahoo/wildflower.git && cd wildflower && npm install`.
3. Pull in your existing `valley` directory using the version control or backup tool you selected [earlier](#first-time-users).
4. Run `wildflower sow` to distribute your config files.

## Filesystem
The filesystem you should have after tilling will look something like:
```
.../
  valley/        # choose where you want to root this directory by running till from ...
    meadow.js    # config for backup and restore lives here
    meadow/      # actual backed up files live here
      ~~/        # this is the only special / mutated directory name
    .git         # if you want to version control with git, make `valley` a repository
```

## Todo:
- Create an "update" or "install" command or something to simplify installation and update
- Add ability for wildflower to run commands
- Add some kind of ordering/dependency mechanism (wait for 'x' before doing 'y'.)
- Improve runtime perf (parallelize async fs operations)
- Add runtime perf / debugging utilities
