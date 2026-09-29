import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, ".output");
const dist = resolve(root, "dist");

rmSync(dist, { recursive: true, force: true });
mkdirSync(resolve(dist, "server"), { recursive: true });
mkdirSync(resolve(dist, "client"), { recursive: true });
mkdirSync(resolve(dist, ".openai"), { recursive: true });

cpSync(resolve(output, "server"), resolve(dist, "server"), { recursive: true });
cpSync(resolve(output, "public"), resolve(dist, "client"), { recursive: true });
writeFileSync(resolve(dist, "server/index.js"), 'export { default } from "./index.mjs";\n');
writeFileSync(
  resolve(dist, ".openai/hosting.json"),
  readFileSync(resolve(root, ".openai/hosting.json")),
);

console.log("Staged the current Nitro build for Sites hosting.");
