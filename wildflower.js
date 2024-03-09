import { parseArgs } from "https://deno.land/std@0.219.0/cli/parse_args.ts";
import { sow } from "./sow.js";
import { gather } from "./gather.js";
import { till } from "./till.js";

let args = parseArgs(Deno.args)
let command = args._[0]

if (command === 'sow') {
  await sow()
} else if (command === 'gather') {
  await gather()
} else if (command === 'till') {
  await till()
} else {
  if (!command) {
    console.error(`Error: Must provide a command: sow, gather, till`)
  } else {
    console.error(`Error: Unknown command '${command}'!`)
  }
}