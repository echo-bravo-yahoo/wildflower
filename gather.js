const fse = require('fs-extra')
const meadows = require('./meadows')
const copy = require('recursive-copy')
const { fixSrcPath, fixDestPath, logNoSuchFile, buildCopyOptions } = require('./common')

const promises = []
const copyOptions = {
  dot: true,
  overwrite: true,
  expand: false,
  debug: false,
  filter: function(e) {
    return !(e.includes('node_modules'))
  }
}

fse.ensureDirSync('./meadows')
const paths = fse.readdirSync('./meadows')
// Make Async
paths
  .filter((path) => path !== '.git')
  .forEach((path) => fse.removeSync(`./meadows/${path}`))

meadows.forEach((meadow) => {
    promises.push(copy(
      fixSrcPath(meadow.path),
      fixDestPath(meadow.path),
      buildCopyOptions(copyOptions, meadow)
    ).catch(logNoSuchFile))
})

Promise.all(promises)
  .then(() => console.log('Done gathering.'))
  .catch((err) => console.error('Error while gathering:', err))
