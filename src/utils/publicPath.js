// src/utils/publicPath.js
export function resolvePublic(relPath) {
  if (relPath.startsWith("/")) relPath = relPath.replace(/^\/+/, "");
  return new URL(relPath, document.baseURI).href;
}
