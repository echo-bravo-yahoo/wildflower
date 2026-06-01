#!/usr/bin/env node

import { sow } from "./sow.js";
import { gather } from "./gather.js";
import { till } from "./till.js";
import { pathCmd } from "./path.js";
import { diff } from "./diff.js";
import packageJson from './package.json' with { type: 'json' };

let command = process.argv[2]
let rest = process.argv.slice(3)

if (command === 'sow') {
  await sow(rest.length > 0 ? rest : null)
} else if (command === 'gather') {
  await gather(rest.length > 0 ? rest : null)
} else if (command === 'till') {
  await till()
} else if (command === 'path') {
  await pathCmd(rest)
} else if (command === 'diff') {
  await diff(rest.length > 0 ? rest : null)
} else if (command === 'version' || command === '--version' || command === '-v') {
  console.log(packageJson.version)
} else if (command === 'help' || command === '--help' || command === '-h') {
  console.log(`wildflower ${packageJson.version}

Commands:
  gather [<path>...]   Copy live FS → meadows. With no args, wholesale.
  sow    [<path>...]   Copy meadows → live FS. With no args, wholesale.
  diff   [<path>...]   Report live-vs-meadows divergence. Read-only.
  path   <path>        Map a tracked path between live FS and meadows form.
  till                 Initialize a sample meadows.mjs.
  version              Print version.
`)
} else {
  if (!command) {
    console.error(`Error: Must provide a command: gather, sow, diff, path, till. Use 'wildflower help' for details.`)
  } else {
    console.error(`Error: Unknown command '${command}'!`)
  }
  process.exit(2)
}
