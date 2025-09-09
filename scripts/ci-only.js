// scripts/ci-only.js
// Goal: block local `npm install` drift, but allow CI (npm ci) and the one-time lock regen.

const argvRaw = process.env.npm_config_argv;
let isNpmCI = false;
try {
  if (argvRaw) {
    const argv = JSON.parse(argvRaw);
    const orig = Array.isArray(argv?.original) ? argv.original : [];
    // Detect `npm ci`
    isNpmCI = orig.includes("ci");
  }
} catch (_) {}

const isGH = process.env.GITHUB_ACTIONS === "true";
const allowRegen = process.env.ALLOW_LOCK_REGEN === "1";
// Also allow if NPM_CONFIG_CI is set explicitly (we set it in CI step above)
const envSaysCI = process.env.NPM_CONFIG_CI === "true";

if (isNpmCI || isGH || envSaysCI || allowRegen) {
  if (allowRegen) {
    console.warn("\n[warn] Allowing local lockfile regeneration.\n");
  }
  process.exit(0);
}

console.error(
  "\nUse `npm ci` (not `npm install`) to keep deps locked and prevent ORT drift.\n"
);
process.exit(1);
