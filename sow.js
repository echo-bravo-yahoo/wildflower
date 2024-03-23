import copy from 'npm:recursive-copy@2.0.10'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions, parseMeadows } from './common.js'

export async function sow() {
  const { meadows, vars } = parseMeadows()

  if (!meadows) {
    throw new Error("No meadows found! Make sure you're defining it in your meadows.js. (e.g. `const meadows = [...]`)")
  }

  const copyOptions = {
    dot: true,
    overwrite: true,
    expand: true
  }

  const promises = meadows.map((meadow) => {
    if (meadow?.if() ?? true) {
      if (meadow.path) {
        return copy(
          fixSourceControlPath(meadow.path),
          fixInstalledPath(meadow.path),
          buildCopyOptions(copyOptions, meadow)
        )
          .then(() => console.log(`Copied '${fixSourceControlPath(meadow.path)}' to '${fixInstalledPath(meadow.path)}'`))
          .catch(logNoSuchFile)
      } else if (meadow.run) {
        return meadow.run(vars)
      }
    } else {
      if (meadow.path) {
        console.log(`Skipping '${meadow.path}' on this system.`)
      } else if (meadow.run) {
        console.log(`Skipping run on this system:\n${meadow.run}`)
      }
    }
  })

  await Promise.all(promises)
    .then(() => console.log('Done sowing.'))
    .catch((err) => console.error('Error while sowing:', err))
}