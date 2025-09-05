// src/services/drive.js
import { getJSON } from '../utils/net';
import { isShinyName } from '../utils/names';

/**
 * Recursively list all image files under a Google Drive folder (public or shared drive).
 * - Descends into subfolders
 * - Follows shortcuts (to images)
 * - Paginates with pageSize=1000
 * - Works with Shared Drives (auto-detect driveId)
 */
export async function listDriveImagesDeep(
  folderId,
  apiKey,
  {
    includeSharedDrives = true,
    excludeShiny = false,
    recurse = true,
    max = Infinity, // optional cap for safety
  } = {},
) {
  const base = 'https://www.googleapis.com/drive/v3/files';

  async function getMeta(id) {
    const params = new URLSearchParams({
      fields: 'id,name,mimeType,driveId',
      supportsAllDrives: includeSharedDrives ? 'true' : 'false',
      key: apiKey,
    });
    const url = `${base}/${encodeURIComponent(id)}?${params.toString()}`;
    return await getJSON(url, 'resolving folder metadata');
  }

  // Detect driveId (if folder is in a Shared Drive) for more reliable listings
  let driveId = null;
  try {
    const meta = await getMeta(folderId);
    if (meta?.driveId) driveId = meta.driveId;
  } catch {
    // non-fatal
  }

  async function listChildrenOnce(parentId, pageToken) {
    // Need images OR folders OR shortcuts
    const q = `'${parentId}' in parents and trashed=false and (` +
              `mimeType='application/vnd.google-apps.folder' or ` +
              `mimeType='application/vnd.google-apps.shortcut' or ` +
              `mimeType contains 'image/'` +
              `)`;

    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,mimeType,shortcutDetails(targetId,targetMimeType))',
      pageSize: '1000',
      key: apiKey,
    });

    if (includeSharedDrives) {
      params.set('supportsAllDrives', 'true');
      params.set('includeItemsFromAllDrives', 'true');
      if (driveId) {
        params.set('corpora', 'drive');
        params.set('driveId', driveId);
      }
    }

    if (pageToken) params.set('pageToken', pageToken);
    const url = `${base}?${params.toString()}`;
    return await getJSON(url, `listing Drive children of ${parentId}`);
  }

  const out = [];
  const queue = [folderId];

  while (queue.length && out.length < max) {
    const current = queue.shift();
    let pageToken;

    do {
      const json = await listChildrenOnce(current, pageToken);
      const files = json.files || [];

      for (const f of files) {
        // Recurse into folders
        if (recurse && f.mimeType === 'application/vnd.google-apps.folder') {
          queue.push(f.id);
          continue;
        }

        // Follow shortcuts to images
        if (f.mimeType === 'application/vnd.google-apps.shortcut') {
          const sd = f.shortcutDetails || {};
          if (sd.targetMimeType?.startsWith('image/')) {
            if (!excludeShiny || !isShinyName(f.name)) {
              out.push({
                id: sd.targetId,
                name: f.name,
                downloadUrl: `${base}/${sd.targetId}?alt=media&key=${apiKey}`,
              });
            }
          }
          continue;
        }

        // Plain image file
        if (f.mimeType?.startsWith('image/')) {
          if (!excludeShiny || !isShinyName(f.name)) {
            out.push({
              id: f.id,
              name: f.name,
              downloadUrl: `${base}/${f.id}?alt=media&key=${apiKey}`,
            });
          }
        }

        if (out.length >= max) break;
      }

      if (out.length >= max) break;
      pageToken = json.nextPageToken;
    } while (pageToken);
  }

  return out;
}

// Back-compat alias if other code imports listDriveImages
export const listDriveImages = listDriveImagesDeep;
