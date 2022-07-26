const fse = require('fs-extra')
const meadows = require('./valley/meadows.js')
const copy = require('recursive-copy')
const { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions } = require('./common')

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

fse.ensureDirSync('./valley/meadows')
const paths = fse.readdirSync('./valley/meadows')
// Make Async
paths
  .filter((path) => path !== '.git')
  .forEach((path) => fse.removeSync(`./valley/meadows/${path}`))

meadows.forEach((meadow) => {
    promises.push(copy(
      fixInstalledPath(meadow.path),
      fixSourceControlPath(meadow.path),
      buildCopyOptions(copyOptions, meadow)
    )
      .then((...args) => console.log(args, `Copied '${fixInstalledPath(meadow.path)}' to '${fixSourceControlPath(meadow.path)}'`))
      .catch(logNoSuchFile))
})

Promise.all(promises)
  .then(() => console.log('Done gathering.'))
  .catch((err) => console.error('Error while gathering:', err))
