// scripts/ci-only.js
if (!process.env.npm_config_ci) {
  if (process.env.ALLOW_LOCK_REGEN === "1") {
    console.warn("\n[warn] Allowing local lockfile regeneration.\n");
    process.exit(0);
  }
  console.error("\nUse `npm ci` (not `npm install`) to keep deps locked and prevent ORT drift.\n");
  process.exit(1);
}
