const fse = require('fs-extra')
const meadows = require('./meadows')
const { fixSrcPath, fixDestPath, logNoSuchFile } = require('./common')

promises = []

meadows.forEach((meadow) => {
    promises.push(fse.copy(fixSrcPath(meadow.path), fixDestPath(meadow.path)).catch(logNoSuchFile))
})

Promise.all(promises).then(() => console.log('Done gathering.')).catch((err) => console.error('Error while gathering:', err))
