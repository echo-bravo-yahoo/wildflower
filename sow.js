import copy from 'npm:recursive-copy@2.0.10'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions } from './common.js'

export async function sow() {
  const meadows = eval((new TextDecoder("utf-8")).decode(Deno.readFileSync(`./meadows.js`)))

  const promises = []
  const copyOptions = {
    dot: true,
    overwrite: true,
    expand: true
  }

  meadows.forEach((meadow) => {
    promises.push(
      copy(
        fixSourceControlPath(meadow.path),
        fixInstalledPath(meadow.path),
        buildCopyOptions(copyOptions, meadow)
      )
        .then(() => console.log(`Copied '${fixSourceControlPath(meadow.path)}' to '${fixInstalledPath(meadow.path)}'`))
        .catch(logNoSuchFile))
  })

  await Promise.all(promises)
    .then(() => console.log('Done sowing.'))
    .catch((err) => console.error('Error while sowing:', err))
}