// /scripts/build-manifest.mjs
// Node 18+ required (built-in fetch). Run: node scripts/build-manifest.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_KEY =
  process.env.GOOGLE_API_KEY ||
  'AIzaSyCTsyJ6Q5fogdMdLTUVnsKOuDdkCnigIE8'; // <-- your key (override via env if you like)

const FOLDER_ID =
  process.env.DRIVE_FOLDER_ID ||
  '1lAICMrSGj0b1TTC2yTPiuQlLB15gJ4tB'; // <-- your folder (override via env if you like)

// Exclude shinies (same rule as the app)
const EXCLUDE_NAME_CONTAINS = ['shiny'];

function upsizeThumb(url) {
  try {
    let out = url;
    out = out.replace(/=s\d+(-c)?$/i, '=s2048');
    out = out.replace(/=w\d+(-h\d+)?(-p)?$/i, '=w2048');
    const u = new URL(out);
    if (u.searchParams.has('sz')) u.searchParams.set('sz', 'w2048');
    return u.toString();
  } catch {
    return url;
  }
}

function corsImageURL(file) {
  if (file.thumbnailLink) return upsizeThumb(file.thumbnailLink);
  return `https://lh3.googleusercontent.com/d/${encodeURIComponent(file.id)}=w2048`;
}

function matchesExclusion(name = '') {
  const n = String(name).toLowerCase();
  return EXCLUDE_NAME_CONTAINS.some((term) => n.includes(term.toLowerCase()));
}

async function listAll() {
  const files = [];
  let pageToken = '';

  for (let guard = 0; guard < 100; guard++) {
    const q =
      `'${FOLDER_ID}' in parents and trashed=false and ` +
      `mimeType contains 'image/' and not name contains 'shiny'`;

    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,webContentLink)',
      pageSize: '1000',
      key: API_KEY,
      // Uncomment if needed for Shared Drives:
      // includeItemsFromAllDrives: 'true',
      // supportsAllDrives: 'true',
      // corpora: 'allDrives',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()); } catch {}
      throw new Error(`Drive list error ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    const data = await res.json();
    const got = Array.isArray(data.files) ? data.files : [];
    for (const f of got) {
      if (matchesExclusion(f.name)) continue;
      files.push({
        id: f.id,
        name: f.name,
        url: corsImageURL(f),
      });
    }
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }
  return files;
}

async function main() {
  const files = await listAll();
  const out = { files };
  const outPath = resolve(__dirname, '..', 'public', 'drive_cache.json');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${out.files.length} entries → ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
