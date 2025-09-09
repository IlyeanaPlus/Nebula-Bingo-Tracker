// scripts/ci-only.js
if (!process.env.npm_config_ci) {
  console.error("\nUse `npm ci` to keep deps locked (prevents ORT drift).\n");
  process.exit(1);
}
