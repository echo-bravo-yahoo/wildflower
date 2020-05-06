const path = require('path')

const logNoSuchFile = (error) => {
  if(error.errno === -2 && error.code === 'ENOENT') {
    console.error('Did not find file', error.path)
  } else {
    throw e
  }
}

function fixSrcPath(filepath) {
    if(filepath[0] === '~') {
        filepath = path.join(process.env.HOME, filepath.slice(1))
    }
    return filepath
}

function fixDestPath(filepath) {
    if(filepath[0] === '~') {
        filepath = path.join(process.env.HOME, filepath.slice(1))
    }
    return path.join(__dirname, '/meadows', filepath.split(process.env.HOME).slice(1).join(''))
}

module.exports = {
  fixSrcPath,
  fixDestPath,
  logNoSuchFile
}
