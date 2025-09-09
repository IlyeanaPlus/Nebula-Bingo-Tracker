// scripts/ci-only.js
/**
 * Allow only `npm ci` on CI; allow everything locally.
 * CI includes GitHub Actions (CI=true, GITHUB_ACTIONS=true).
 */
const isCI =
  !!process.env.CI ||
  !!process.env.GITHUB_ACTIONS ||
  !!process.env.BUILD_BUILDID;

const lifecycle = process.env.npm_lifecycle_event || ""; // "ci", "install", etc.

let argvIsCi = false;
try {
  // npm_config_argv contains the original args; look for "ci"
  const cfg = JSON.parse(process.env.npm_config_argv || "{}");
  const cooked = Array.isArray(cfg.cooked) ? cfg.cooked.join(" ") : "";
  argvIsCi = /\bci\b/.test(cooked);
} catch {}

/** Pass if:
 * - not CI (local dev), OR
 * - CI and the lifecycle is "ci", OR
 * - CI and the original args included "ci"
 */
if (!isCI || lifecycle === "ci" || argvIsCi) {
  console.log(
    `[ci-only] ok (isCI=${isCI}, lifecycle='${lifecycle}', argvIsCi=${argvIsCi})`
  );
  process.exit(0);
}

console.error("Use `npm ci` to keep deps locked (prevents ORT drift).");
process.exit(1);
