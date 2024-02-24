import * as path from "https://deno.land/std@0.217.0/path/mod.ts";

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
    filepath = path.join(Deno.env.get('HOME'), filepath.slice(1))
  }
  return filepath
}

export function fixSourceControlPath(filepath) {
  return path.join(Deno.cwd(), '/meadows', filepath)
}