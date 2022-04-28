const copy = require('recursive-copy')
const meadows = require('./valley/meadows.js')
const { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions } = require('./common')

const promises = []
const copyOptions = {
  dot: true,
  overwrite: true,
  expand: true
}

meadows.forEach((meadow) => {
  promises.push(copy(
    fixSourceControlPath(meadow.path),
    fixInstalledPath(meadow.path),
    buildCopyOptions(copyOptions, meadow)
  )
    .then(() => console.log(`Copied '${fixSourceControlPath(meadow.path)}' to '${fixDestPath(meadow.path)}'`))
    .catch(logNoSuchFile))
})

Promise.all(promises)
  .then(() => console.log('Done sowing.'))
  .catch((err) => console.error('Error while sowing:', err))
