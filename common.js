const path = require('path')

function buildCopyOptions(baseOptions, meadow) {
  const copyOptions = { ...baseOptions }

  // note: subtle bug: if meadow has a filter, it loses the default !node_modules filter
  if (meadow.filter) {
    copyOptions.filter = meadow.filter
  }

  return copyOptions
}

const logNoSuchFile = (error) => {
  if (error.errno === -2 && error.code === 'ENOENT') {
    console.error('Did not find file', error.path)
  } else {
    throw error
  }
}

function fixInstalledPath(filepath) {
  if (filepath[0] === '~') {
    filepath = path.join(process.env.HOME, filepath.slice(1))
  }
  return filepath
}

function fixSourceControlPath(filepath) {
  return path.join(__dirname, '/valley/meadows', filepath)
}

module.exports = {
  buildCopyOptions,
  fixInstalledPath,
  fixSourceControlPath,
  logNoSuchFile
}
