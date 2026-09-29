import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
for (const directory of [".output", ".vercel/output", "dist"]) {
  rmSync(resolve(root, directory), { recursive: true, force: true });
}
