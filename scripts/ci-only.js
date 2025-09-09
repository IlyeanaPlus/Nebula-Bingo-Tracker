// scripts/ci-only.js
/**
 * Enforce "npm ci" on CI only.
 * Locally, allow installs and lockfile refresh without failing the build.
 */
const isCI =
  !!process.env.CI ||
  !!process.env.GITHUB_ACTIONS ||
  !!process.env.BUILD_BUILDID; // azdo

// Optional: explicit override knobs
const allowLocal =
  !isCI || process.env.CI_ONLY_ALLOW_LOCAL === "1" || process.env.LOCAL_DEV === "1";

if (allowLocal) {
  console.log("[ci-only] Local environment detected. Allowing install/lockfile ops.");
  process.exit(0);
}

// On CI, only "npm ci" is acceptable.
const msg = "Use `npm ci` to keep deps locked (prevents ORT drift).";
console.error(msg);
process.exit(1);
