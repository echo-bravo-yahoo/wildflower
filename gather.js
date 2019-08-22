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
    promises.push(fse.copyFile(fixSrcPath(meadow.path), fixDestPath(meadow.path))) 
})    

Promise.all(promises).then(() => console.log('Done gathering.')).catch((err) => console.error('Error while gathering:', err))
