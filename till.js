const copy = require('recursive-copy')

copy(`./meadows-sample.js`, `./valley/meadows.js`)
  .catch((error) => {
    if (error.errno === 47 && error.code === 'EEXIST') {
      console.error('Valley already tilled! Please run sow or gather instead.')
    } else {
      throw error
    }
  })