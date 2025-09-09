// scripts/ci-only.js
/**
 * Enforce "npm ci" on CI only; allow everything locally.
 * Works with npm >= 9 where npm_config_argv may be absent.
 */
const fs = require("fs");
const path = require("path");

const isCI =
  !!process.env.CI ||
  !!process.env.GITHUB_ACTIONS ||
  !!process.env.BUILD_BUILDID;

const lifecycle = process.env.npm_lifecycle_event || "";   // e.g. "preinstall"
const allowOverride =
  process.env.CI_ONLY_ALLOW_LOCAL === "1" ||
  process.env.ALLOW_INSTALL_ON_CI === "1"; // manual escape hatch if ever needed

// Strong signals that we're running `npm ci`
const signalsCi = [
  process.env.NPM_CONFIG_CI === "true",
  process.env.npm_config_ci === "true",
  process.env.npm_lifecycle_event === "ci",
];

// Heuristic: preinstall on CI with no node_modules yet is almost always "npm ci"
const nodeModulesMissing = !fs.existsSync(path.resolve(process.cwd(), "node_modules"));
const looksLikeCiHeuristic = isCI && lifecycle === "preinstall" && nodeModulesMissing;

const ok =
  !isCI ||                         // local → always allow
  allowOverride ||                 // explicit override
  signalsCi.some(Boolean) ||       // positive `ci` signals
  looksLikeCiHeuristic;            // heuristic fallback

if (ok) {
  console.log(`[ci-only] ok (isCI=${isCI}, lifecycle='${lifecycle}', ci=${signalsCi.some(Boolean)}, heuristic=${looksLikeCiHeuristic})`);
  process.exit(0);
}

// CI, but not `npm ci` → fail
console.error("Use `npm ci` to keep deps locked (prevents ORT drift).");
process.exit(1);
