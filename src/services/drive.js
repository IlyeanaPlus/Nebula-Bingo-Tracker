// src/services/drive.js
import { getJSON } from '../utils/net';
import { isShinyName } from '../utils/names';

/**
 * Recursively list all image files under a public Google Drive folder.
 * - Descends into subfolders
 * - Follows shortcuts to images
 * - Pages with pageSize=1000 until exhaustion
 * - Works for both My Drive and Shared Drives (auto-detects driveId)
 */
export async function listDriveImagesDeep(
  folderId,
  apiKey,
  {
    includeSharedDrives = true,
    excludeShiny = false,
    recurse = true,
    max = Infinity, // safety cap
  } = {},
) {
  const base = "https://www.googleapis.com/drive/v3/files";

  async function getMeta(id) {
    const params = new URLSearchParams({
      fields: "id,name,mimeType,driveId",
      supportsAllDrives: includeSharedDrives ? "true" : "false",
      key: apiKey,
    });
    const url = `${base}/${encodeURIComponent(id)}?${params.toString()}`;
    return await getJSON(url, "resolving folder metadata");
  }

  // Detect driveId for Shared Drive to make corpora=drive listings reliable.
  let driveId = null;
  try {
    const meta = await getMeta(folderId);
    if (meta && meta.driveId) driveId = meta.driveId;
  } catch {
    // Non-fatal; continue with generic listing.
  }

  async function listChildrenOnce(parentId, pageToken) {
    // We want images OR folders OR shortcuts
    const q =
      `'${parentId}' in parents and trashed=false and (` +
      `mimeType='application/vnd.google-apps.folder' or ` +
      `mimeType='application/vnd.google-apps.shortcut' or ` +
      `mimeType contains 'image/'` +
      `)`;

    const params = new URLSearchParams({
      q,
      fields:
        "nextPageToken,files(id,name,mimeType,shortcutDetails(targetId,targetMimeType))",
      pageSize: "1000",
      key: apiKey,
    });

    if (includeSharedDrives) {
      params.set("supportsAllDrives", "true");
      params.set("includeItemsFromAllDrives", "true");
      if (driveId) {
        params.set("corpora", "drive");
        params.set("driveId", driveId);
      }
    }

    if (pageToken) params.set("pageToken", pageToken);
    const url = `${base}?${params.toString()}`;
    return await getJSON(url, `listing Drive children of ${parentId}`);
  }

  const out = [];
  const queue = [folderId];

  while (queue.length) {
    const current = queue.shift();
    let pageToken = undefined;

    do {
      const json = await listChildrenOnce(current, pageToken);
      const files = json.files || [];

      for (const f of files) {
        // Recurse into subfolders
        if (recurse && f.mimeType === "application/vnd.google-apps.folder") {
          queue.push(f.id);
          continue;
        }

        // Follow shortcuts (if target is an image)
        if (f.mimeType === "application/vnd.google-apps.shortcut") {
          const tgt = f.shortcutDetails || {};
          if (tgt.targetMimeType && tgt.targetMimeType.startsWith("image/")) {
            if (!excludeShiny || !isShinyName(f.name)) {
              out.push({
                id: tgt.targetId,
                name: f.name,
                downloadUrl: `https://www.googleapis.com/drive/v3/files/${tgt.targetId}?alt=media&key=${apiKey}`,
              });
            }
          }
          continue;
        }

        // Plain image files
        if (f.mimeType && f.mimeType.startsWith("image/")) {
          if (!excludeShiny || !isShinyName(f.name)) {
            out.push({
              id: f.id,
              name: f.name,
              downloadUrl: `https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${apiKey}`,
            });
          }
        }

        if (out.length >= max) break;
      }

      if (out.length >= max) break;
      pageToken = json.nextPageToken;
    } while (pageToken);

    if (out.length >= max) break;
  }

  return out;
}

// Back-compat export name if older code imports listDriveImages
export const listDriveImages = listDriveImagesDeep;
