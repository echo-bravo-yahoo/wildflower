## Basic usage:
### First time users

1. Install node.
2. Install wildflower globally with `npm install --global https://github.com/echo-bravo-yahoo/wildflower`. If you prefer, you can clone this repository and install its dependencies instead with `git clone git@github.com:echo-bravo-yahoo/wildflower.git && cd wildflower && npm install`.
3. From the parent directory of where you would like to store your version-controllable dotfiles, run `wildflower till`. This will create a directory named `valley` containing a sample config file named `meadows.mjs` and a directory to store dotfiles in named `meadows`. Skip down to [the filesystem section](#Filesystem) for a full description.
4. Add descriptions of the files you want to gather to `valley/meadows.mjs`.
5. Run `wildflower gather`. This will collect all the files you specified in `valley/meadows.mjs` into the `valley/meadows` directory. Files in your home directory (`~`) will be stored in `valley/meadows/~~`; everything else will be stored by its verbatim path.
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
    meadow.mjs   # config for backup and restore lives here
    meadow/      # actual backed up files live here
      ~~/        # this is the only special / mutated directory name
    .git         # if you want to version control with git, make `valley` a repository
```

## Writing `meadows.mjs`

You can currently define two types of meadows: `path`s, which allow you to easily copy and manage files and folders, and `run`s, which allow you to run arbitrary commands.

### `path` meadows

You can copy in either files or folders. In the case of folders, you can filter out the contents using globs.

Example copying files:
```js
{ path: `~/Library/Preferences/at.obdev.LaunchBar.plist` },
{ path: `~/Library/Preferences/at.obdev.LaunchBar.ActionEditor.plist` },
```

Example copying folders:
```js
{
  path: `~/Library/Application Support/LaunchBar`,
  filter: [
    // required to work
    '**/**',

    // folders need !Folder (for the directory itself) and !Folder/** (for it's files)
    // if you're using git to store these, you can skip the directory ignore
    '!**/node_modules',
    '!**/node_modules/**',
    
    // note specific files
    `!Habits.plist`,
    `!Recent Documents.plist`
  ]
},
```

### `run` meadows

`run` meadows allow you to run arbitrary javascript (and therefore shell commands) to perform some task. `zsh`, `bash`, `shell`, and `run` functions are provided globally to allow for easy shell access.

```js
{
  name: "Basic run",
  run: () => {
    return zsh(`
      echo "Some basic run."
    `)
  }
}
```

## Todo:
- Add ability for wildflower to run commands 
  - Note that the `sow` step current runs commands, but the `gather` step does not.
- Add some kind of ordering/dependency mechanism (wait for 'x' before doing 'y'.) 
  - Note that the `sow` step runs in sequence, but the `gather` step runs in parallel.
- Improve runtime perf (parallelize async fs operations)
- Add runtime perf / debugging utilities
