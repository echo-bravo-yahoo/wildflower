import path from 'node:path'
import { spawn } from 'node:child_process'
import fs from 'fs'
import { cp, readdir, stat, statfs } from 'node:fs/promises';
import { isNotJunk } from 'junk'
import copy from 'recursive-copy'
import maximatch from 'maximatch'

const __dirname = import.meta.dirname;

let valleyDir = ''
/**
 * A function that attempts to figure out the valley directory. It first searches VALLEY_PATH, then nearby directories, then when all that fails, it checks cwd. We store the result in a variable so we only have to do it once per run.
 * @returns 
 */
export function getValleyDir() {

  let searchIn = [
    process.env.VALLEY_PATH ?? '', // defined like VALLEY_PATH=/path/to/valley
    path.join(__dirname, "valley"), // inside wildflower
    path.join(path.dirname(__dirname), "valley"), // next to wildflower
  ]

  // cache so we're only stat'ing once
  if (valleyDir) {
    return valleyDir
  } else {

    let maybeValleyDir = searchIn.find(possibleDir => {
      return fs.statSync(possibleDir, { throwIfNoEntry: false })
    })

    // otherwise, check cwd
    if (!maybeValleyDir) {
      maybeValleyDir = process.cwd()
      while (!fs.statSync(path.join(maybeValleyDir, 'meadows.mjs'), { throwIfNoEntry: false })) {
        let nextDir = path.dirname(maybeValleyDir)
        if (maybeValleyDir !== nextDir) {
          maybeValleyDir = nextDir
        } else {
          maybeValleyDir = null
          break;
        }
      }
    }

    valleyDir = maybeValleyDir

    if (!valleyDir) {
      console.error("Error: No valley found. Make sure the valley is on your current working path or configure the VALLEY_PATH environment variable.")
      process.exit(1)
    }

    return valleyDir
  }
}

export function buildCopyOptions(baseOptions, meadow) {
  const copyOptions = { ...baseOptions }

  // note: subtle bug: if meadow has a filter, it loses the default !node_modules filter
  if (meadow.filter) {
    copyOptions.filter = meadow.filter
  }

  return copyOptions
}

export const logNoSuchFile = (error) => {
  if (error.errno === -2 && error.code === 'ENOENT') {
    console.error('Did not find file', error.path)
  } else {
    throw error
  }
}

export function meadowLabel(meadow, index) {
  if (meadow.path) {
    return `"${meadow.path}" (step #${index})`
  } else if (meadow.name) {
    return `"${meadow.name}" (step #${index})`
  } else {
    return `# ${index}`
  }
}

export function fixInstalledPath(filepath) {
  if (filepath[0] === '~') {
    filepath = path.join(process.env['HOME'], filepath.slice(1))
  }
  return filepath
}

export function fixSourceControlPath(filepath) {
  // transform ~/ into ~~/ for safety
  if (filepath.length && filepath.startsWith(process.env['HOME'])) filepath = "~" + filepath.slice(process.env['HOME'].length)
  if (filepath.length && filepath[0] == `~`) filepath = `~${filepath}`
  return path.join(getValleyDir(), "/meadows", filepath)
}

/**
 * Given a path on disk (live FS or under meadows/), find the meadow
 * declaration that covers it. Matches by longest prefix so a more specific
 * meadow wins over a broader parent. Returns { meadow, installed, absolute }
 * (installed = absolute live-FS root for the meadow; absolute = caller's
 * path normalized to its live-FS form). Returns null if no meadow covers.
 */
export function findMeadowForPath(targetPath, meadows) {
  const meadowsRoot = path.join(getValleyDir(), 'meadows')
  let abs = targetPath
  if (abs.startsWith('~')) abs = fixInstalledPath(abs)
  abs = path.resolve(abs)

  // If the path is under the meadows/ mirror, map it back to the live FS
  // equivalent first so the lookup logic is single-pass.
  if (abs === meadowsRoot || abs.startsWith(meadowsRoot + '/')) {
    let mirrorRel = abs.slice(meadowsRoot.length).replace(/^\/+/, '')
    // mirrorRel looks like '~~/.zshrc' — strip one `~` so we have `~/.zshrc`
    if (mirrorRel.startsWith('~~')) mirrorRel = mirrorRel.slice(1)
    abs = fixInstalledPath(mirrorRel)
  }

  let bestMeadow = null
  let bestInstalled = null
  let bestLen = -1
  for (const meadow of meadows) {
    if (!meadow.path) continue
    const installed = path.resolve(fixInstalledPath(meadow.path))
    if (abs === installed || abs.startsWith(installed + '/')) {
      if (installed.length > bestLen) {
        bestMeadow = meadow
        bestInstalled = installed
        bestLen = installed.length
      }
    }
  }
  if (!bestMeadow) return null
  return { meadow: bestMeadow, installed: bestInstalled, absolute: abs }
}

/**
 * Bidirectional path mapping. Given any tracked path (live FS form or
 * meadows-mirror form), return the path in the other store.
 * Throws if the input isn't covered by any meadow.
 */
export async function mapPath(targetPath) {
  const { meadows } = await parseMeadows()
  const match = findMeadowForPath(targetPath, meadows)
  if (!match) {
    const err = new Error(`path not in meadows.mjs; add it to track: ${targetPath}`)
    err.code = 'ENOMEADOW'
    throw err
  }
  const meadowsRoot = path.join(getValleyDir(), 'meadows')
  let abs = targetPath
  if (abs.startsWith('~')) abs = fixInstalledPath(abs)
  abs = path.resolve(abs)

  if (abs === meadowsRoot || abs.startsWith(meadowsRoot + '/')) {
    // input is meadows-side → return live FS path
    return match.absolute
  }
  // input is live FS → return meadow mirror path
  const rel = match.absolute.slice(match.installed.length)
  return fixSourceControlPath(match.meadow.path) + rel
}

// Evaluate a meadow's filter against a path relative to the meadow root. The
// filter is recursive-copy's form: an array of globs (`!` negates) or a
// predicate. No filter means include everything.
export function matchesFilter(filter, relPath) {
  if (Array.isArray(filter)) return maximatch([relPath], filter).length > 0
  if (typeof filter === 'function') return filter(relPath)
  return true
}

// Copy a single tracked path (file or subtree) between the live filesystem and
// its mirror. `direction` is 'gather' (live → mirror) or 'sow' (mirror → live);
// `target` may be given in either live-FS or meadows-mirror form. Resolves the
// owning meadow, honors that meadow's `if` condition and filter, then copies
// only files under the target — leaving every other tracked file untouched, so
// concurrent edits to other files don't bleed in. The per-meadow gather()/sow()
// callbacks are intentionally skipped (whole-meadow semantics). Returns an exit
// status (0 ok / 1 problem) rather than exiting, so callers can aggregate across
// multiple targets.
export async function copyPath(target, meadows, direction) {
  const verb = direction === 'gather' ? 'gathered' : 'sown'
  const match = findMeadowForPath(target, meadows)
  if (!match) {
    console.error(`Skipping '${target}': not in meadows.mjs (add it to track)`)
    return 1
  }
  const { meadow, installed, absolute } = match
  const index = meadows.indexOf(meadow)

  const shouldRun = meadow.if ? await meadow.if() : true
  if (!shouldRun) {
    console.log(`Skipping '${absolute}' — ${meadowLabel(meadow, index)} condition didn't pass on this host.`)
    return 0
  }

  // Path of the target relative to the meadow root (posix-style, as the meadow
  // glob filters expect). Empty when the target IS the meadow root. The mirror
  // preserves the live tree's layout, so this aligns for both directions.
  const relTarget = absolute.slice(installed.length).replace(/^[\\/]/, '').split(path.sep).join('/')
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
      return matchesFilter(meadowFilter, norm)
    },
  }

  // Copy from the meadow root (not the named subtree) so meadow-root-relative
  // filter globs evaluate correctly; the filter narrows to the target.
  const from = direction === 'gather' ? fixInstalledPath(meadow.path) : fixSourceControlPath(meadow.path)
  const to = direction === 'gather' ? fixSourceControlPath(meadow.path) : fixInstalledPath(meadow.path)

  try {
    const operations = await (meadow.curable ? curableCopy : copy)(from, to, options)
    const files = operations.filter((op) => op.stats?.isFile?.() ?? true)
    if (files.length === 0) {
      console.error(`Nothing ${verb} for '${absolute}' — excluded by the ${meadowLabel(meadow, index)} filter?`)
      return 1
    }
    for (const op of files) {
      console.log(`Copied '${op.src}' to '${op.dest}'`)
    }
    return 0
  } catch (e) {
    logNoSuchFile(e)
    return 1
  }
}

export async function curableCopy(
  fromPath,
  toPath,
  {
    junk = false,
    // Mirrors recursive-copy's `filter`: an array of globs (with `!` negation)
    // or a predicate, both keyed on the path relative to `fromPath`. Honored so
    // curable meadows respect their include/exclude rules, like non-curable ones.
    filter
  } = {}
) {
  let files
  let statFromPath = await stat(fromPath)
  if (statFromPath.isDirectory()) {
    files = await readdir(fromPath, {
      recursive: true,
      withFileTypes: true
    })
  } else {
    files = [{
      isFile() { return statFromPath.isFile() },
      parentPath: path.dirname(fromPath),
      name: path.basename(fromPath)
    }]
  }

  let operations = []

  for (let file of files) {
    if (file.isFile()) {
      if (junk === false && isNotJunk(file.name)) {
        let realFromPath = `${file.parentPath}/${file.name}`
        // Path relative to fromPath (posix, no leading separator), as the filter expects.
        let rel = realFromPath.slice(fromPath.length).replace(/^[\\/]/, '').split(path.sep).join('/')
        if (!matchesFilter(filter, rel)) continue
        let realToPath = toPath + realFromPath.slice(fromPath.length)
        let operation = { src: realFromPath, dest: realToPath }
        try {
          await cp(realFromPath, realToPath)
          operation.stats = await stat(realToPath)
        } catch (cpError) {
          // at this point, we can bail out to the user to cure, or we can attempt some basic cures:
          // not portable, but apparently neither is node, so this is better than nothing for now
          try {
            await bash(`sudo mkdir -p $(dirname '${realToPath}'); sudo cp '${realFromPath}' '${realToPath}'`)
            operation.stats = await stat(realToPath)
          } catch (cureError) {
            console.error('Node copy failed, and attempting to fix it also failed.')
            console.error(cpError)
            console.error(cureError)
          }
        }
        operations.push(operation)
      }
    }
  }

  return operations
}

export async function bash(cmd, {
  // https://www.gnu.org/software/bash/manual/html_node/Bash-Startup-Files.html
  sources = [`~/.bashrc`],
  ...options
} = {}) {
  return shell(cmd, { shell: 'bash', sources, ...options })
}

export async function zsh(cmd, {
  // https://zsh.sourceforge.io/Intro/intro_3.html
  sources = [`~/.zshenv`, `~/.zshrc`],
  ...options
} = {}) {
  return shell(cmd, { shell: 'zsh', sources, ...options })
}

export async function shell(cmd, {
  sources = [],
  sourceSuffix = ' >/dev/null',
  shell = 'sh',
  flags = ['-c'],
  ...options
} = {}) {
  let sourcedFiles = sources.map(file => `. ${file}${sourceSuffix}`).join('\n')
  return run([shell, ...flags, `${sourcedFiles}\n${cmd}`], options)
}

/**
 * 
 * @param {string[]} commandFlags An array of commands and arguments provided to spawn. The first is the cmd, the rest are provided as flags.
 * @param {*} options Any option you want to provide to spawn.
 * @returns 
 */
export async function run(
  [cmd, ...flags] = [],
  options
) {

  return new Promise((resolve) => {
    const command = spawn(
      cmd,
      flags,
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        ...options
      }
    );

    process.stdin.pipe(command.stdin)

    command.stdout.pipe(process.stdout)
    command.stderr.pipe(process.stderr)

    let out = ''
    let stdout = ''
    let stderr = ''

    command.stdout.on('data', (data) => {
      out += data
      stdout += data
    });

    command.stderr.on('data', (data) => {
      out += data
      stderr += data
    });

    command.on('close', (code) => {
      resolve({ out, stdout, stderr, code })
    });
  })
}

export async function parseMeadows() {
  global.bash = bash
  global.zsh = zsh
  global.shell = shell
  global.run = run

  const { meadows } = await import(path.join(getValleyDir(), './meadows.mjs'))
  return { meadows }
}

export function runDirectly() {
  const runLocally = process.argv[1].split('/').pop() === 'wildflower.js'
  const runGlobally = process.argv[1].split('/').pop() === 'wildflower'
  return !runLocally && !runGlobally
}
