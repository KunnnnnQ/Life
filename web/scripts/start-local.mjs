// Runs the built worker locally. Loads web/.dev.vars (real provider keys) when it exists; otherwise demo mode.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vars = path.join(web, ".dev.vars");
const args = ["--import", "./scripts/sites-env.mjs", "./node_modules/wrangler/bin/wrangler.js", "dev",
  "--config", "dist/server/wrangler.json", "--local", "--persist-to", ".wrangler/state", "--ip", "127.0.0.1", "--inspector-port", "0",
  ...(existsSync(vars) ? ["--env-file", vars] : []), ...process.argv.slice(2)];
const r = spawnSync(process.execPath, args, { cwd: web, stdio: "inherit" });
process.exit(r.status ?? 0);
