import path from 'node:path'
import * as fs from 'node:fs'

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
    flags = ['-i'],
    ...options
  } = {}) {

  const command = new Deno.Command(shell, {
    args: [...flags, '-c', `${cmd}`],
    ...options,

    stdin: "inherit",
    stdout: "piped",
    stderr: "piped",

    // more options here: https://deno.land/api@v1.41.3?s=Deno.CommandOptions
  });

  const process = command.spawn();

  const decoder = new TextDecoder("utf-8")

  let out = ''
  let stdout = ''
  let stderr = ''

  // https://developer.mozilla.org/en-US/docs/Web/API/WritableStream/WritableStream#examples
  process.stdout.pipeTo(new WritableStream({
    write(chunk) {
      return new Promise((resolve) => {
        const decodedChunk = decoder.decode(chunk)
        out += decodedChunk
        stdout += decodedChunk
        Deno.stdout.write(chunk)
        resolve();
      });
    },
  }))

  process.stderr.pipeTo(new WritableStream({
    write(chunk) {
      return new Promise((resolve) => {
        const decodedChunk = decoder.decode(chunk)
        out += decodedChunk
        stderr += decodedChunk
        Deno.stderr.write(chunk)
        resolve();
      });
    },
  }))

  const status = await process.status
  const code = status.code

  // console.log({ out, stdout, stderr, code: status .code})

  return { out, stdout, stderr, code }
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
