const fse = require('fs-extra')
const meadows = require('./meadows')
const { fixSrcPath, fixDestPath } = require('./common')

promises = []

const logNoSuchFile = (error) => {
  if(error.errno === -2 && error.code === 'ENOENT') {
    console.error('Did not find file', error.path)
  } else {
    throw e
  }
}

meadows.forEach((meadow) => {
    promises.push(fse.copy(fixSrcPath(meadow.path), fixDestPath(meadow.path)).catch(logNoSuchFile))
})

Promise.all(promises).then(() => console.log('Done gathering.')).catch((err) => console.error('Error while gathering:', err))
