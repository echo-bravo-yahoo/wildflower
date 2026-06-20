#!/usr/bin/env node

import updateNotifier from 'update-notifier'
import { sow } from "./sow.js";
import { gather } from "./gather.js";
import { till } from "./till.js";
import { pathCmd } from "./path.js";
import { diff } from "./diff.js";
import packageJson from './package.json' with { type: 'json' };

updateNotifier({ pkg: packageJson }).notify()

const VERSION = packageJson.version

const TOP_HELP = `wildflower ${VERSION}

Commands:
  gather [<path>...]   Copy live FS → meadows. With no args, wholesale.
  sow    [<path>...]   Copy meadows → live FS. With no args, wholesale.
  diff   [<path>...]   Report live-vs-meadows divergence. Read-only.
  path   <path>...     Map a tracked path between live FS and meadows form.
  till                 Initialize a sample meadows.mjs.
  version              Print version.

Run 'wildflower <command> --help' for details on a command.`

// Per-command help, shown for `wildflower <command> --help` / `-h`.
const COMMAND_HELP = {
  gather: `wildflower gather [<path>...]

Copy files from the live filesystem into the meadows mirror. With no <path>,
gathers every meadow wholesale. With one or more <path> (live-FS or mirror
form), gathers only those, honoring each meadow's \`if\` condition and filter
(excluded paths like *-tokens.json are refused, not mirrored).`,
  sow: `wildflower sow [<path>...]

Copy files from the meadows mirror back to the live filesystem. With no <path>,
sows every meadow wholesale. With one or more <path>, sows only those, honoring
each meadow's \`if\` condition and filter.`,
  diff: `wildflower diff [<path>...] [--verbose]

Report divergence between the live filesystem and the meadows mirror. Read-only;
never mutates. Honors each meadow's filter, so excluded paths (e.g.
*-tokens.json) are not reported. With no <path>, diffs every meadow.

  --verbose   Print the unified patch for each differing file (default: just
              report which files differ).

Exit codes: 0 = identical, 1 = differ, 2 = path not tracked / error.`,
  path: `wildflower path <path>...

Map tracked path(s) between live-FS form and meadows-mirror form. Pure: reads
meadows.mjs only, no copying. Direction is inferred from each input.`,
  till: `wildflower till

Initialize a sample meadows.mjs and meadows/ directory in the current valley.`,
  version: `wildflower version

Print the installed wildflower version.`,
}

let command = process.argv[2]
let rest = process.argv.slice(3)

const wantsHelp = (args) => args.includes('--help') || args.includes('-h')

if (command && COMMAND_HELP[command] && wantsHelp(rest)) {
  // `wildflower <command> --help`
  console.log(COMMAND_HELP[command])
} else if (command === 'sow') {
  await sow(rest.length > 0 ? rest : null)
} else if (command === 'gather') {
  await gather(rest.length > 0 ? rest : null)
} else if (command === 'till') {
  await till()
} else if (command === 'path') {
  await pathCmd(rest)
} else if (command === 'diff') {
  const verbose = rest.includes('--verbose')
  const paths = rest.filter((a) => a !== '--verbose')
  await diff(paths.length > 0 ? paths : null, { verbose })
} else if (command === 'version' || command === '--version' || command === '-v') {
  console.log(VERSION)
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log(TOP_HELP)
} else {
  if (!command) {
    console.error(`Error: Must provide a command: gather, sow, diff, path, till. Use 'wildflower help' for details.`)
  } else {
    console.error(`Error: Unknown command '${command}'!`)
  }
  process.exit(2)
}
