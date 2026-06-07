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

## Valleys
The filesystem you should have after tilling will look something like:
```
.../
  valley/        # choose where you want to root this directory by running till from ...
    meadow.mjs   # config for backup and restore lives here
    meadow/      # actual backed up files live here
      ~~/        # this is the only special / mutated directory name
    .git         # if you want to version control with git, make `valley` a repository
```

A valley (the folder where your meadows are) can be located in one of three places: in or next to the wildflower source repo (if you cloned it from github), defined by the VALLEY_PATH variable (e.g. `VALLEY_PATH=~/valley`), or in the current working path of the terminal you're running wildflower commands from.

## Recovering from divergence (3-way merge)

After every `sow`, wildflower writes `.wildflower-state.json` at the valley root, recording the commit the live filesystem was synced to. It is per-machine state: if you version your valley with git, ignore this file.

If your valley is a git repo, that recorded commit is the **merge base** when the live filesystem and the mirror diverge. The base turns an ambiguous live-vs-`HEAD` diff into a well-defined 3-way merge (base = last-sown commit, *ours* = live FS, *theirs* = current `HEAD`):

| live vs base | HEAD vs base | meaning | action |
| --- | --- | --- | --- |
| same | changed | machine behind valley, no local edit | `sow` (overwrite live) |
| changed | same | genuine local edit | `gather` |
| changed | changed | real conflict | 3-way merge |
| same | same | in sync | nothing to do |

For the conflict cell, merge a single path against the recorded base. `git merge-file` needs real files (it seeks within them), so extract the base and `HEAD` blobs to temp files rather than piping them in:

```bash
base_commit=$(jq -r .commit .wildflower-state.json)
p=~~/.someconfig   # a path under meadows/
git show "$base_commit:meadows/$p" > /tmp/wf-base
git show "HEAD:meadows/$p" > /tmp/wf-theirs
git merge-file ~/.someconfig /tmp/wf-base /tmp/wf-theirs   # edits ~/.someconfig in place
```

## Writing `meadows.mjs`

You can currently define two types of meadows: `path`s, which allow you to easily copy and manage files and folders, and `run`s, which allow you to run arbitrary commands.

### Copying files 

You can copy either files or folders by setting a `path` property that defines where on disk to find the files to copy. In the case of folders, you can filter out the contents using globs.

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

### Running functions

You can run arbitrary javascript (and therefore shell commands) to perform some task using the `gather` and `sow` properties, which run on their respective wildflower commands. 

`zsh`, `bash`, `shell`, and `run` functions are provided globally to allow for easy shell access.

```js
{
  name: "Basic run",
  sow: () => {
    return zsh(`
      echo "This echo gets run on 'wildflower sow'."
    `)
  },
  gather: () => {
    console.log("This log gets run on 'wildflower gather'.")
  }
}
```

When combined with paths, both `gather` and `sow` recieve the paths of the final copied files.

```js
{
  path: '/path/to/folder'
  gather: (arrayOfFilesWeCopied) => {
    console.log(arrayOfFilesWeCopied)
  }
}
```

## Targeted (per-file) operations

`gather`, `sow`, and the new `diff` accept zero or more path arguments. With no args, they operate on every meadow (wholesale, the original behavior). With one or more args, they operate only on the named paths:

```sh
# Wholesale (unchanged):
wildflower gather
wildflower sow

# Per-file:
wildflower gather ~/.zshrc
wildflower gather ~/.config/ghostty
wildflower sow    ~/.claude/CLAUDE.md
wildflower diff   ~/.zshrc                 # reports divergence; no mutation
wildflower diff                            # all meadows
```

Targeted operations:
- Skip meadow-level `if` conditions and `meadow.gather()` / `meadow.sow()` callbacks (those are whole-meadow semantics; the user named the file explicitly).
- Ignore meadow filters when an explicit path is given. Filters exist to restrict wholesale recursion; when a path is named on the CLI, it's gathered/sowed as-is.
- Preserve symlinks (`expand: false` in both directions).

## `wildflower path`

A pure path-mapping primitive. Given a tracked path in either form, emits the path in the other store:

```sh
wildflower path ~/.zshrc
# → /path/to/valley/meadows/~~/.zshrc

wildflower path /path/to/valley/meadows/~~/.zshrc
# → /Users/you/.zshrc
```

No I/O beyond reading `meadows.mjs`. Useful as a composable building block: `diff $(wildflower path ~/.zshrc) ~/.zshrc`, or `cp ~/.zshrc "$(wildflower path ~/.zshrc)"`.

Exits non-zero if the path isn't covered by any meadow.

## `wildflower diff`

Reports divergence between live FS and the meadows mirror. Read-only; never mutates. Exit codes:
- `0` — all checked paths identical
- `1` — at least one divergence
- `2` — at least one path not tracked, or other error

Implementation delegates to `diff -rq` per pair.

## Todo:
- Add ability for wildflower to run commands 
  - Note that the `sow` step current runs commands, but the `gather` step does not.
- Add some kind of ordering/dependency mechanism (wait for 'x' before doing 'y'.) 
  - Note that the `sow` step runs in sequence, but the `gather` step runs in parallel.
- Improve runtime perf (parallelize async fs operations)
- Add runtime perf / debugging utilities
