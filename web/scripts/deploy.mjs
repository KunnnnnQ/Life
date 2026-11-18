// One-command deploy to Cloudflare Workers + D1 (+ optional R2).
//   node scripts/deploy.mjs            create missing resources, build, deploy
//   node scripts/deploy.mjs --dry-run  show what would happen, change nothing
// Prerequisite: `npx wrangler login` once (opens a browser to authorise your own Cloudflare account).
// Settings come from deploy.env (copy deploy.env.example). API keys are NOT read from here:
// set them afterwards with `npx wrangler secret put <NAME> --config dist/server/wrangler.json`.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dryRun = process.argv.includes("--dry-run");
const wrangler = path.join(web, "node_modules", "wrangler", "bin", "wrangler.js");

function loadEnvFile(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith("#")) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}
const settings = { D1_DATABASE_NAME: "mood-capsule", ...loadEnvFile(path.join(web, "deploy.env")) };
for (const key of Object.keys(settings)) if (/KEY|SECRET|TOKEN/.test(key)) {
  console.error(`deploy.env 里不要放密钥（${key}）。部署后用 wrangler secret put 设置。`);
  process.exit(1);
}

function run(args, { capture = false, allowFail = false } = {}) {
  const r = spawnSync(process.execPath, [wrangler, ...args], { cwd: web, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (r.status !== 0 && !allowFail) {
    if (capture) console.error(r.stderr || r.stdout);
    console.error(`命令失败：wrangler ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
  return r;
}
const step = (msg) => console.log(`\n▶ ${msg}`);

step("检查 Cloudflare 登录状态");
const who = run(["whoami"], { capture: true, allowFail: true });
if (/not authenticated/i.test(`${who.stdout}${who.stderr}`)) {
  console.error("还没有登录。请先运行：npx wrangler login");
  process.exit(1);
}

step(`准备 D1 数据库 ${settings.D1_DATABASE_NAME}`);
const list = JSON.parse(run(["d1", "list", "--json"], { capture: true }).stdout || "[]");
let db = list.find((d) => d.name === settings.D1_DATABASE_NAME);
if (!db) {
  if (dryRun) console.log(`[dry-run] 将创建 D1 数据库 ${settings.D1_DATABASE_NAME}`);
  else {
    run(["d1", "create", settings.D1_DATABASE_NAME]);
    db = JSON.parse(run(["d1", "list", "--json"], { capture: true }).stdout).find((d) => d.name === settings.D1_DATABASE_NAME);
  }
}
const databaseId = db?.uuid ?? db?.id ?? "dry-run";
console.log(`数据库 ID：${databaseId}（表会在第一次访问接口时自动创建）`);

if (settings.R2_BUCKET_NAME) {
  step(`准备 R2 存储桶 ${settings.R2_BUCKET_NAME}（存放生成的插画和语音）`);
  const buckets = run(["r2", "bucket", "list"], { capture: true, allowFail: true });
  if (buckets.status !== 0) {
    console.error("R2 不可用。通常需要先在 Cloudflare 控制台开通 R2。也可以在 deploy.env 里删掉 R2_BUCKET_NAME，先不用 R2。");
    process.exit(1);
  }
  if (!buckets.stdout.includes(`name:           ${settings.R2_BUCKET_NAME}`) && !buckets.stdout.includes(settings.R2_BUCKET_NAME)) {
    if (dryRun) console.log(`[dry-run] 将创建 R2 存储桶 ${settings.R2_BUCKET_NAME}`);
    else run(["r2", "bucket", "create", settings.R2_BUCKET_NAME]);
  }
}

step("同步知识库并构建");
const buildEnv = { ...process.env, ...settings, D1_DATABASE_ID: databaseId };
for (const [cmd, args] of [["kb:sync", []], ["build", []]]) {
  const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", cmd, ...args],
    { cwd: web, env: buildEnv, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

step(dryRun ? "[dry-run] 跳过部署" : "部署到 Cloudflare Workers");
if (!dryRun) run(["deploy", "--config", "dist/server/wrangler.json"]);

console.log(`
完成。接下来设置密钥（每条命令会提示你粘贴，不会显示在屏幕上）：
  npx wrangler secret put LLM_API_KEY --config dist/server/wrangler.json
  npx wrangler secret put DASHSCOPE_API_KEY --config dist/server/wrangler.json   （用插画/语音时）
国内访问请绑定自己的域名，workers.dev 域名在大陆通常打不开。详见 docs/deploy.md。`);
