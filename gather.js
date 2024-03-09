import fse from 'npm:fs-extra@9.1.0'
import copy from 'npm:recursive-copy@2.0.10'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions } from './common.js'

export async function gather() {
  const meadows = eval((new TextDecoder("utf-8")).decode(Deno.readFileSync(`./meadows.js`)))

  const promises = []
  const copyOptions = {
    dot: true,
    overwrite: true,
    expand: false,
    debug: false,
    filter: function (e) {
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
    promises.push(
      copy(
        fixInstalledPath(meadow.path),
        fixSourceControlPath(meadow.path),
        buildCopyOptions(copyOptions, meadow)
      )
        .then((...args) => console.log(`Copied '${fixInstalledPath(meadow.path)}' to '${fixSourceControlPath(meadow.path)}'`))
        .catch(logNoSuchFile))
  })

  await Promise.all(promises)
    .then(() => console.log('Done gathering.'))
    .catch((err) => console.error('Error while gathering:', err))
}
