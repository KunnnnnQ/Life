import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { configureToolEnvironment } from "./scripts/tool-environment.mjs";
import { sites } from "./scripts/vite/sites-vite-plugin";
import { connectorPreview } from "./scripts/vite/connector-preview-plugin.mjs";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

const { d1, r2 } = hostingConfig;

// Production deploys (scripts/deploy.mjs) pass the real resource names and non-secret settings through
// the environment. Secrets (API keys) are never baked in; they are set with `wrangler secret put`.
const env = process.env;
const DEPLOY_VARS = ["CONTENT_MODE", "LLM_PROVIDER", "LLM_BASE_URL", "LLM_MODEL", "LLM_MODEL_PLANNER", "LLM_MODEL_WRITER",
  "LLM_MODEL_REVIEWER", "LLM_MODEL_INTAKE", "STUDY_MODE", "IMAGE_MODEL", "TTS_MODEL", "TTS_VOICE", "IMAGES_PER_SESSION", "DASHSCOPE_BASE_URL"];
const deployVars = Object.fromEntries(DEPLOY_VARS.filter((k) => env[k]).map((k) => [k, env[k] as string]));

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  ...(Object.keys(deployVars).length ? { vars: deployVars } : {}),
  // Attach a custom domain on deploy, e.g. CUSTOM_DOMAIN=app.kunkun24.com. The zone must already be on Cloudflare.
  ...(env.CUSTOM_DOMAIN ? { routes: [{ pattern: env.CUSTOM_DOMAIN, custom_domain: true }] } : {}),
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: env.D1_DATABASE_NAME || "site-creator-d1",
          database_id: env.D1_DATABASE_ID || SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  // R2 is optional in production: set R2_BUCKET_NAME to keep generated media beyond the provider's 24 hours.
  r2_buckets: r2 && (env.R2_BUCKET_NAME || !env.D1_DATABASE_ID)
    ? [
        {
          binding: r2,
          bucket_name: env.R2_BUCKET_NAME || "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async ({ command }) => {
  configureToolEnvironment(process.cwd());

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      ...(managedLinux
        ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] }
        : {}),
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites({ mockAuth: !managedLinux }),
      connectorPreview(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: {
          ...localBindingConfig,
          ...(command === "serve"
            ? {
                services: [
                  {
                    binding: "CONNECTORS",
                    service: "sites-connector-preview",
                    entrypoint: "ConnectorPreview",
                  },
                ],
              }
            : {}),
        },
        ...(command === "serve"
          ? {
              auxiliaryWorkers: [
                {
                  config: {
                    name: "sites-connector-preview",
                    main: "./scripts/connector-preview/worker.mjs",
                    compatibility_date: "2026-05-15",
                  },
                },
              ],
            }
          : {}),
      }),
    ],
  };
});
