import fse from 'npm:fs-extra@9.1.0'
import copy from 'npm:recursive-copy@2.0.10'
import { fixInstalledPath, fixSourceControlPath, logNoSuchFile, buildCopyOptions } from './common.js'
import { parseMeadows } from "./common.js";

export async function gather() {
  const { meadows, vars } = parseMeadows()

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

  const promises = meadows.map((meadow) => {
    if (meadow.if?.(vars) ?? true) {
      if (meadow.path) {
        fse.removeSync(fixSourceControlPath(meadow.path))

        return copy(
          fixInstalledPath(meadow.path),
          fixSourceControlPath(meadow.path),
          buildCopyOptions(copyOptions, meadow)
        )
          .then((...args) => console.log(`Copied '${fixInstalledPath(meadow.path)}' to '${fixSourceControlPath(meadow.path)}'`))
          .catch(logNoSuchFile)
      }
      // we're ignoring "run"s during gather for now.
    }
  })

  await Promise.all(promises)
    .then(() => console.log('Done gathering.'))
    .catch((err) => console.error('Error while gathering:', err))

  // At some point, we should probably clean up files that have been previously committed, but aren't referenced by the meadows.js anymore. That would require some thinking so we don't remove files we're skipping on this system, but are referenced in meadows.js.
}
