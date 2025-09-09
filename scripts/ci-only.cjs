// scripts/ci-only.cjs
const fs = require("node:fs");
const path = require("node:path");

const isCI =
  !!process.env.CI ||
  !!process.env.GITHUB_ACTIONS ||
  !!process.env.BUILD_BUILDID;

const lifecycle = process.env.npm_lifecycle_event || "";   // e.g. "preinstall"
const allowOverride =
  process.env.CI_ONLY_ALLOW_LOCAL === "1" ||
  process.env.ALLOW_INSTALL_ON_CI === "1";

// Strong signals that we're running `npm ci`
const signalsCi = [
  process.env.NPM_CONFIG_CI === "true",
  process.env.npm_config_ci === "true",
  process.env.npm_lifecycle_event === "ci",
];

// Heuristic: on CI, preinstall with no node_modules is almost always `npm ci`
const nodeModulesMissing = !fs.existsSync(path.resolve(process.cwd(), "node_modules"));
const looksLikeCiHeuristic = isCI && lifecycle === "preinstall" && nodeModulesMissing;

const ok =
  !isCI ||                         // local → allow
  allowOverride ||                 // manual override
  signalsCi.some(Boolean) ||       // explicit ci signals
  looksLikeCiHeuristic;            // heuristic

if (ok) {
  console.log(`[ci-only] ok (isCI=${isCI}, lifecycle='${lifecycle}', ci=${signalsCi.some(Boolean)}, heuristic=${looksLikeCiHeuristic})`);
  process.exit(0);
}

console.error("Use `npm ci` to keep deps locked (prevents ORT drift).");
process.exit(1);
