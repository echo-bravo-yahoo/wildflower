import path from 'node:path'
import * as fs from 'node:fs'
import { spawn } from 'node:child_process'

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

export function fixInstalledPath(filepath) {
  if (filepath[0] === '~') {
    filepath = path.join(process.env['HOME'], filepath.slice(1))
  }
  return filepath
}

export function fixSourceControlPath(filepath) {
  return path.join(process.cwd(), '/meadows', filepath)
}

export async function bash(cmd, options = {}) {
  return run(cmd, { ...options, shell: 'bash' })
}

export async function zsh(cmd, options = {}) {
  return run(cmd, { ...options, shell: 'zsh' })
}

export async function run(
  cmd,
  {
    // maybe do some smarts to determine which shell to use?
    // also, this breaks hard on windows if you're not in WSL
    shell = 'bash',
    // the -i flag causes most of the profiles to be loaded, but causes a hit in performance
    // We probably don't care?
    // flags = ['-i'],
    flags = [],
    ...options
  } = {}) {

  return new Promise((resolve) => {
    const command = spawn(
      shell,
      [...flags, '-c', `${cmd}`],
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

function computeVars(vars = {}) {
  const computedVars = {}
  Object.entries(vars).forEach(([key, fn]) => {
    computedVars[key] = fn()
  })
  return computedVars
}

export function parseMeadows(filePath = `./meadows.js`) {
  let valley = eval(`if (true) (${fs.readFileSync(filePath, "utf8")})`)

  return { meadows: valley.meadows, vars: computeVars(valley?.vars) }
}
