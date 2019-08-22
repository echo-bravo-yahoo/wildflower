const fse = require('fs-extra')
const path = require('path')
const meadows = require('./meadows')

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

promises = []

meadows.forEach((meadow) => {
    promises.push(fse.copyFile(fixDestPath(meadow.path), fixSrcPath(meadow.path))) 
})    

Promise.all(promises).then(() => console.log('Done sowing.')).catch((err) => console.error('Error while sowing:', err))
