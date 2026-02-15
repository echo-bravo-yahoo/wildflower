import path from 'node:path'
import { spawn } from 'node:child_process'
import fs from 'fs'
import { cp, readdir, stat, statfs } from 'node:fs/promises';
import { isNotJunk } from 'junk'

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

export async function curableCopy(
  fromPath,
  toPath,
  {
    junk = false
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
