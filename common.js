import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import { spawn, execSync } from 'node:child_process'
import fs from 'fs'
import { cp, readdir, stat, statfs, lstat, readFile, readlink, mkdir, writeFile, unlink } from 'node:fs/promises';
import { isNotJunk } from 'junk'
import copy from 'recursive-copy'
import maximatch from 'maximatch'
import packageJson from './package.json' with { type: 'json' }

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

/**
 * Directory that owns the sync watermark. All worktrees of a valley share one
 * home directory, so they must share one watermark: `--git-common-dir` points
 * at the main checkout's `.git` from anywhere, and its parent is the main
 * checkout. For a plain (non-worktree) checkout this resolves to the valley
 * itself, so hosts see no change.
 */
export function getWatermarkDir() {
  const valley = getValleyDir()
  try {
    const common = execSync('git rev-parse --git-common-dir', { cwd: valley, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
    return path.dirname(path.resolve(valley, common))
  } catch {
    return valley // not a git repo; behave as before
  }
}

/**
 * Records the commit the live filesystem was synced to, written to the main
 * checkout's root after a wholesale sow. This watermark is the merge base for a
 * later 3-way merge when the live filesystem and the mirror diverge.
 * Self-contained try/catch: a non-git valley or git failure degrades gracefully
 * and never aborts a sow.
 */
export function writeSyncMetadata() {
  const dir = getWatermarkDir()
  let commit
  try {
    commit = execSync('git rev-parse HEAD', { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim()
  } catch {
    console.error('Warning: valley is not a git repo or HEAD unreadable; skipping sync metadata.')
    return
  }
  const meta = { commit, sownAt: new Date().toISOString(), wildflowerVersion: packageJson.version }
  fs.writeFileSync(path.join(dir, '.wildflower-state.json'), JSON.stringify(meta, null, 2) + '\n')
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

// Resolve the live filesystem locations for a meadow. The first location is
// the canonical path used by path mapping; all locations participate in sync.
export async function resolveInstallPaths(meadow) {
  if (meadow.installPath && typeof meadow.installPath !== 'function') {
    throw new Error(`meadow.installPath must be a function (got ${typeof meadow.installPath})`)
  }
  const configured = meadow.installPath
    ? await meadow.installPath(meadow.path)
    : [meadow.path]
  if (!Array.isArray(configured) || configured.length === 0 || configured.some(p => typeof p !== 'string' || !p)) {
    throw new Error(`meadow.installPath must return a non-empty array of paths`)
  }
  return [...new Set(configured.map(p => path.resolve(fixInstalledPath(p))))]
}

async function collectInstallFiles(root, filter, junk = false) {
  const files = new Map()
  async function visit(fullPath, rel = '') {
    let info
    try { info = await lstat(fullPath) } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    if (info.isDirectory()) {
      for (const entry of await readdir(fullPath, { withFileTypes: true })) {
        await visit(path.join(fullPath, entry.name), rel ? `${rel}/${entry.name}` : entry.name)
      }
      return
    }
    if (!junk && !isNotJunk(path.basename(rel))) return
    if (rel && !matchesFilter(filter, rel)) return
    if (info.isSymbolicLink()) {
      files.set(rel, { type: 'symlink', data: Buffer.from(await readlink(fullPath)) })
    } else if (info.isFile()) {
      const hash = createHash('sha256')
      for await (const chunk of fs.createReadStream(fullPath)) hash.update(chunk)
      files.set(rel, { type: 'file', data: hash.digest() })
    }
  }
  await visit(root)
  return files
}

function sameFileState(left, right) {
  if (!left || !right) return !left && !right
  return left?.type === right?.type && left?.data.equals(right?.data)
}

function conflictVersion(state) {
  if (!state) return '[file missing]'
  const text = state.data.toString('utf8')
  return Buffer.from(text, 'utf8').equals(state.data) ? text : `[${state.type} data, base64]\n${state.data.toString('base64')}`
}

/** Gather a meadow from every install location, writing conflict-marker files
 * into the mirror and returning them without copying divergent sources over
 * one another. `relTarget` narrows targeted gathers to one subtree. */
export async function gatherInstallPaths(meadow, branchKey, options, relTarget = '') {
  const installs = await resolveInstallPaths(meadow)
  const mirror = fixSourceControlPath(meadow.path, branchKey)
  const chosen = installs.find(p => fs.existsSync(p))
  if (!chosen) throw Object.assign(new Error(`Did not find file ${installs[0]}`), { code: 'ENOENT', errno: -2, path: installs[0] })

  if (installs.length === 1) {
    const operations = await (meadow.curable ? curableCopy : copy)(chosen, mirror, options)
    return { installs, mirror, operations, conflicts: [] }
  }

  const sourceMaps = await Promise.all(installs.map(p => collectInstallFiles(p, options.filter ?? meadow.filter, options.junk)))
  const relatives = new Set(sourceMaps.flatMap(map => [...map.keys()]))
  const conflicts = []
  for (const rel of relatives) {
    if (relTarget && rel !== relTarget && !rel.startsWith(relTarget + '/')) continue
    const versions = sourceMaps.map((map, index) => ({ path: installs[index], state: map.get(rel) }))
    if (versions.slice(1).some(version => !sameFileState(versions[0].state, version.state))) {
      conflicts.push({ rel, versions })
    }
  }

  const copyOptions = { ...options }
  if (relTarget) {
    copyOptions.filter = entry => {
      const norm = String(entry).split(path.sep).join('/')
      const inTarget = norm === relTarget || norm.startsWith(relTarget + '/') || relTarget.startsWith(norm + '/')
      if (!inTarget) return false
      if (norm !== relTarget && relTarget.startsWith(norm + '/')) return true
      return matchesFilter(meadow.filter, norm)
    }
  }
  const operations = conflicts.length
    ? []
    : await (meadow.curable ? curableCopy : copy)(chosen, mirror, copyOptions)

  for (const conflict of conflicts) {
    const versions = await Promise.all(conflict.versions.map(async version => ({
      ...version,
      state: version.state?.type === 'file'
        ? { type: 'file', data: await readFile(path.join(version.path, conflict.rel)) }
        : version.state,
    })))
    const first = versions[0]
    const output = versions.slice(1).map(({ path: sourcePath, state }) =>
      `<<<<<<< ${first.path}\n${conflictVersion(first.state)}\n=======\n${conflictVersion(state)}\n>>>>>>> ${sourcePath}\n`
    ).join('')
    const destination = path.join(mirror, conflict.rel)
    await mkdir(path.dirname(destination), { recursive: true })
    try {
      if ((await lstat(destination)).isSymbolicLink()) await unlink(destination)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    await writeFile(destination, output)
  }
  return { installs, mirror, operations, conflicts }
}

export function fixSourceControlPath(filepath, ...rest) {
  // transform ~/ into ~~/ for safety
  if (filepath.length && filepath.startsWith(process.env['HOME'])) filepath = "~" + filepath.slice(process.env['HOME'].length)
  if (filepath.length && filepath[0] == `~`) filepath = `~${filepath}`
  // branchKey omitted entirely, or explicitly null, means "not branching".
  // Explicitly undefined (distinct from omitted -- see rest.length below)
  // means "branching, no identity" and routes to ~default.
  const branchKey = rest[0]
  const effectiveKey = rest.length && branchKey === undefined ? '~default' : branchKey
  const branchPrefix = effectiveKey ? path.join('~by~', effectiveKey) : ''
  return path.join(getValleyDir(), "/meadows", branchPrefix, filepath)
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
  let foreignBranchKey = null
  if (abs === meadowsRoot || abs.startsWith(meadowsRoot + '/')) {
    let mirrorRel = abs.slice(meadowsRoot.length).replace(/^\/+/, '')
    // Strip a `~by~/<key>/` branch prefix, capturing the key so read-only
    // commands (path/diff) can inspect a foreign host's variant. gather/sow
    // (copyPath) must never read foreignBranchKey -- they always resolve
    // their own key via resolveBranchKey(meadow) instead.
    const byMatch = mirrorRel.match(/^~by~\/([^/]+)\//)
    if (byMatch) {
      foreignBranchKey = byMatch[1]
      mirrorRel = mirrorRel.slice(byMatch[0].length)
    }
    // mirrorRel looks like '~~/.zshrc' -- strip one `~` so we have `~/.zshrc`
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
  return { meadow: bestMeadow, installed: bestInstalled, absolute: abs, foreignBranchKey }
}

// Include alternate install locations and resolve mirror targets to the
// canonical (first) install location. Keep the synchronous lookup available.
export async function resolveMeadowForPath(targetPath, meadows) {
  let match = findMeadowForPath(targetPath, meadows)
  const meadowsRoot = path.join(getValleyDir(), 'meadows')
  const abs = path.resolve(fixInstalledPath(targetPath))
  const isMirror = abs === meadowsRoot || abs.startsWith(meadowsRoot + path.sep)
  if (match && isMirror) {
    const [installed] = await resolveInstallPaths(match.meadow)
    match = { ...match, installed, absolute: installed + match.absolute.slice(match.installed.length) }
  }
  // A broad meadow.path match must not hide a more specific install location.
  if (!isMirror) {
    for (const meadow of meadows) {
      if (!meadow.path) continue
      const installs = await resolveInstallPaths(meadow)
      const installed = installs.find(root => abs === root || abs.startsWith(root + path.sep))
      if (installed && (!match || installed.length > match.installed.length)) {
        match = { meadow, installed, absolute: abs, foreignBranchKey: null }
      }
    }
  }
  return match
}

/**
 * Bidirectional path mapping. Given any tracked path (live FS form or
 * meadows-mirror form), return the path in the other store.
 * Throws if the input isn't covered by any meadow.
 */
export async function mapPath(targetPath) {
  const { meadows } = await parseMeadows()
  const match = await resolveMeadowForPath(targetPath, meadows)
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
    // input is meadows-side -> return live FS path
    return match.absolute
  }
  // input is live FS -> return meadow mirror path, in this host's own key
  const rel = match.absolute.slice(match.installed.length)
  const branchKey = await resolveBranchKey(match.meadow)
  return fixSourceControlPath(match.meadow.path, branchKey) + rel
}

// Evaluate a meadow's filter against a path relative to the meadow root. The
// filter is recursive-copy's form: an array of globs (`!` negates) or a
// predicate. No filter means include everything.
export function matchesFilter(filter, relPath) {
  if (Array.isArray(filter)) return maximatch([relPath], filter).length > 0
  if (typeof filter === 'function') return filter(relPath)
  return true
}

// Path of `p` relative to `root` (posix), or null if not under root. Lives here
// rather than in diff.js so status.js can reach it without importing diff.js,
// whose module-level runDirectly() block would run a diff on the way past.
export function relUnder(p, root) {
  if (p === root) return ''
  if (p.startsWith(root + path.sep)) return p.slice(root.length + 1).split(path.sep).join('/')
  return null
}

// A resolved `by` key can never collide with the ~by~/~~ mirror-path
// syntax or the ~default fallback (see resolveBranchKey).
const RESERVED_BRANCH_SEGMENTS = new Set(['~by~', '~~', '~default'])

// Memoized by `by` function reference (not resolved value), so a resolver
// shared across meadows only ever runs once.
const branchKeyCache = new Map()

// Resolves and memoizes a meadow's `by`. Returns null if the meadow isn't
// branching, undefined if by() resolved to no identity for this host (sow
// falls back to ~default; gather refuses), or a validated key string.
export async function resolveBranchKey(meadow) {
  if (!meadow.by) return null

  if (!branchKeyCache.has(meadow.by)) {
    branchKeyCache.set(meadow.by, (async () => {
      if (typeof meadow.by !== 'function') {
        throw new Error(`meadow.by must be a function (got ${typeof meadow.by})`)
      }
      const raw = await meadow.by()
      if (raw === undefined || raw === null) return undefined

      const key = String(raw).trim()
      if (key === '') {
        throw new Error(`meadow.by() resolved to an empty key`)
      }
      if (key.includes('/')) {
        throw new Error(`meadow.by() resolved to an invalid key '${key}': must not contain '/'`)
      }
      if (key.includes('..')) {
        throw new Error(`meadow.by() resolved to an invalid key '${key}': must not contain '..'`)
      }
      if (RESERVED_BRANCH_SEGMENTS.has(key)) {
        throw new Error(`meadow.by() resolved to an invalid key '${key}': collides with a reserved wildflower path segment`)
      }
      return key
    })())
  }

  return branchKeyCache.get(meadow.by)
}

// What `sow` should read from for a meadow, and whether it's there.
export function resolveSowSource(meadow, branchKey) {
  const from = fixSourceControlPath(meadow.path, branchKey)
  return {
    from,
    usingDefault: branchKey === undefined,
    exists: fs.existsSync(from),
  }
}

// Copy a single tracked path (file or subtree) between the live filesystem and
// its mirror. `direction` is 'gather' (live -> mirror) or 'sow' (mirror -> live);
// `target` may be given in either live-FS or meadows-mirror form. Processes all
// matching meadows in config order, honoring each meadow's condition, filter,
// and hook. Copies only files under the target so unrelated edits don't bleed
// in. Valley targets match meadow.path; live targets also match install paths.
// Returns an exit status (0 ok / 1 problem) rather than exiting, so callers can
// aggregate across multiple targets.
export async function copyPath(target, meadows, direction) {
  const verb = direction === 'gather' ? 'gathered' : 'sown'
  let matched = false
  let code = 0
  for (const [index, meadow] of meadows.entries()) {
    const match = await resolveMeadowForPath(target, [meadow])
    if (!match) continue
    matched = true
    const { installed, absolute } = match

    const shouldRun = meadow.if ? await meadow.if() : true
    if (!shouldRun) {
      console.log(`Skipping '${absolute}' -- ${meadowLabel(meadow, index)} condition didn't pass on this host.`)
      continue
    }

    // Always resolve this host's own key, never match.foreignBranchKey --
    // that field exists only for read-side commands like diff.
    let branchKey
    try {
      branchKey = await resolveBranchKey(meadow)
    } catch (error) {
      console.error(`Skipping '${absolute}' -- ${meadowLabel(meadow, index)} by() failed: ${error.message}`)
      code = 1
      continue
    }

    if (direction === 'gather' && branchKey === undefined) {
      console.error(`Skipping '${absolute}' -- ${meadowLabel(meadow, index)}'s by() returned no identity for this host; there is nowhere safe to gather to. (Only 'sow' can read the shared '~default' variant.)`)
      code = 1
      continue
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
          // Ancestor dirs only need traversal -- skip the meadow filter for them.
          if (isAncestorDir && !isTarget) return true
        }
        // Honor the meadow's own include/exclude filter (e.g. !*-tokens.json).
        return matchesFilter(meadowFilter, norm)
      },
    }

    // Copy from the meadow root (not the named subtree) so meadow-root-relative
    // filter globs evaluate correctly; the filter narrows to the target.
    let from
    if (direction !== 'gather') {
      const source = resolveSowSource(meadow, branchKey)
      from = source.from
      if (!source.exists) {
        const reason = source.usingDefault ? `no '~default' variant exists yet` : `no '${branchKey}' branch has been gathered yet`
        const hint = source.usingDefault ? '' : ` Run 'wildflower gather' on this host first.`
        console.error(`Skipping '${absolute}' -- ${reason} for ${meadowLabel(meadow, index)}.${hint}`)
        code = 1
        continue
      }
      if (source.usingDefault) {
        console.log(`${meadowLabel(meadow, index)}: by() returned no identity for this host; using the shared '~default' variant.`)
      }
    }

    try {
      let operations
      if (direction === 'gather') {
        const result = await gatherInstallPaths(meadow, branchKey, options, relTarget)
        if (result.conflicts.length) {
          for (const conflict of result.conflicts) {
            console.error(`WARNING: '${conflict.rel}' differs across install paths. Wrote a merge conflict file to '${path.join(result.mirror, conflict.rel)}'. Resolve the installed copies and run gather again.`)
          }
          return 1
        }
        operations = result.operations
      } else {
        const installs = await resolveInstallPaths(meadow)
        operations = []
        for (const destination of installs) {
          operations.push(...await (meadow.curable ? curableCopy : copy)(from, destination, options))
        }
      }
      const files = operations.filter((op) => op.stats?.isFile?.() ?? true)
      if (files.length === 0) {
        console.error(`Nothing ${verb} for '${absolute}' -- excluded by the ${meadowLabel(meadow, index)} filter?`)
        code = 1
        continue
      }
      for (const op of files) {
        console.log(`Copied '${op.src}' to '${op.dest}'`)
      }

      // A targeted sow/gather is still a sow/gather -- the meadow's hook (if
      // any) must run here too, not just on the wholesale path, or a meadow
      // like a patched-line config can have its post-copy normalization
      // silently skipped depending on which command form the caller used.
      if (meadow[direction]) {
        try {
          await meadow[direction]({ copiedFiles: files.map((op) => op.dest) })
        } catch (error) {
          console.error(`ERROR: ${direction === 'gather' ? 'Gather' : 'Sow'} hook failed for ${meadowLabel(meadow, index)}!`)
          console.error(error)
        }
      }
    } catch (e) {
      logNoSuchFile(e)
      code = 1
    }
  }
  if (!matched) {
    console.error(`Skipping '${target}': not in meadows.mjs (add it to track)`)
    return 1
  }
  return code
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

export function stripLocalSuffix(name) {
  return name.endsWith('.local') ? name.slice(0, -'.local'.length) : name
}

// Convenience `by` global. Strips the trailing .local macOS/mDNS commonly
// appends (Linux/WSL typically don't), so the same host resolves to one key.
export function hostname() {
  return stripLocalSuffix(os.hostname())
}

export async function parseMeadows() {
  global.bash = bash
  global.zsh = zsh
  global.shell = shell
  global.run = run
  global.hostname = hostname

  const { meadows } = await import(path.join(getValleyDir(), './meadows.mjs'))
  return { meadows }
}

export function runDirectly() {
  const runLocally = process.argv[1].split('/').pop() === 'wildflower.js'
  const runGlobally = process.argv[1].split('/').pop() === 'wildflower'
  return !runLocally && !runGlobally
}
