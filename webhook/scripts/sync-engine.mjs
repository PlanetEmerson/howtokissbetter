// Copies the scoring engine to the site so the browser and the functions run
// the same bytes. Run after every edit to webhook/src/kiss-score.cjs:
//   node webhook/scripts/sync-engine.mjs
import { copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = resolve(root, "webhook/src/kiss-score.cjs");
const target = resolve(root, "assets/kiss-score.js");

copyFileSync(source, target);
console.log(`synced ${source} -> ${target}`);
