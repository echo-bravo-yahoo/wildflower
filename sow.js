const fse = require('fs-extra')
const path = require('path')
const meadows = require('./meadows')
const { fixSrcPath, fixDestPath } = require('./common')

promises = []

meadows.forEach((meadow) => {
    promises.push(fse.copyFile(fixDestPath(meadow.path), fixSrcPath(meadow.path))) 
})    

Promise.all(promises).then(() => console.log('Done sowing.')).catch((err) => console.error('Error while sowing:', err))
