const path = require('path')

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
    return path.join(__dirname, '/meadows', path.parse(filepath).base)
}

module.exports = {
  fixSrcPath,
  fixDestPath
}
