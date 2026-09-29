import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const viteBin = resolve(process.cwd(), "node_modules/vite/bin/vite.js");
const result = spawnSync(process.execPath, [viteBin, "build"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NITRO_PRESET: "vercel",
  },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
