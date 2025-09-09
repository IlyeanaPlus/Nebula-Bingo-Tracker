// scripts/ci-only.js
/**
 * Allow only `npm ci` on CI; allow everything locally.
 * Detects the command via npm environment.
 */
const isCI =
  !!process.env.CI ||
  !!process.env.GITHUB_ACTIONS ||
  !!process.env.BUILD_BUILDID;

const lifecycle = process.env.npm_lifecycle_event || ""; // e.g. "ci", "install"
let argvIsCi = false;
try {
  // npm passes JSON in npm_config_argv with original user args
  const cfg = JSON.parse(process.env.npm_config_argv || "{}");
  const cooked = Array.isArray(cfg.cooked) ? cfg.cooked.join(" ") : "";
  argvIsCi = /\bci\b/.test(cooked);
} catch {}

/**
 * PASS conditions:
 * - Not CI (local dev)  -> allow
 * - CI AND (lifecycle === "ci" OR args contain "ci") -> allow
 * Otherwise fail with a clear message.
 */
if (!isCI || lifecycle === "ci" || argvIsCi) {
  console.log(`[ci-only] ok (isCI=${isCI}, lifecycle='${lifecycle}', argvIsCi=${argvIsCi})`);
  process.exit(0);
}

console.error("Use `npm ci` to keep deps locked (prevents ORT drift).");
process.exit(1);
