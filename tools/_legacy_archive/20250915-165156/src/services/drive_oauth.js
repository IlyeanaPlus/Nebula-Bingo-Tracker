// src/services/drive_oauth.js
let gisLoaded = false;
let accessToken = null;
let tokenClient = null;

export function loadGIS() {
  return new Promise((resolve, reject) => {
    if (gisLoaded) return resolve();
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.onload = () => { gisLoaded = true; resolve(); };
    s.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(s);
  });
}

export async function ensureOAuthToken(clientId, scope = "https://www.googleapis.com/auth/drive.file") {
  await loadGIS();
  return new Promise((resolve, reject) => {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (resp) => {
        if (resp.error) { reject(new Error(resp.error)); return; }
        accessToken = resp.access_token;
        resolve(accessToken);
      },
    });
    tokenClient.requestAccessToken({ prompt: "" }); // silent if already granted
  });
}

export function getAccessToken() { return accessToken; }

// Create or update a JSON file (by name) in a specific folder.
export async function uploadOrUpdateJSON(folderId, name, jsonText) {
  if (!accessToken) throw new Error("No OAuth access token. Call ensureOAuthToken() first.");

  // Find existing
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`);
  const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!searchRes.ok) throw new Error(`Search failed: ${searchRes.status} ${searchRes.statusText}`);
  const searchJson = await searchRes.json();
  const fileId = searchJson.files?.[0]?.id || null;

  // Multipart upload (metadata + content)
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;
  const metadata = { name, parents: [folderId], mimeType: "application/json" };

  const body =
    delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter + "Content-Type: application/json\r\n\r\n" +
    jsonText +
    closeDelim;

  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const method = fileId ? "PATCH" : "POST";
  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!resp.ok) throw new Error(`${fileId ? "Update" : "Create"} failed: ${resp.status} ${resp.statusText}`);
  return resp.json();
}
