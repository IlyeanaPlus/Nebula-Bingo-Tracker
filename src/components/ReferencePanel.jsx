// components/ReferencePanel.jsx
import React from "react";

export default function ReferencePanel({
  hashing,
  refsCount,
  excludeShiny, setExcludeShiny,
  driveFolderId, setDriveFolderId,
  driveApiKey, setDriveApiKey,
  includeSharedDrives, setIncludeSharedDrives,
  rememberKey, setRememberKey,
  autoLoadDriveCache, setAutoLoadDriveCache,
  handleDriveFetch,
  exportCacheJSON,
  importCacheJSON,
  progress,
}) {
  return (
    <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-2">1) Reference sprites (Google Drive + Cache)</h2>
      <p className="text-sm text-slate-600 mb-3">
        Provide a Drive <em>Folder ID</em> and <em>API key</em>. The app will first look for
        <code className="mx-1 px-1 bg-slate-100 rounded">sprite_ref_cache.json</code> or
        <code className="mx-1 px-1 bg-slate-100 rounded">cache.json</code> in the folder (recursively), then index images.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input className="border rounded px-2 py-1 text-sm" placeholder="Drive Folder ID" value={driveFolderId} onChange={(e)=>setDriveFolderId(e.target.value)} />
        <input className="border rounded px-2 py-1 text-sm" placeholder="Google API Key" value={driveApiKey} onChange={(e)=>setDriveApiKey(e.target.value)} />
        <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={handleDriveFetch} disabled={hashing}>
          {hashing ? "Indexing…" : "Fetch & Index"}
        </button>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-600 flex-wrap">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={includeSharedDrives} onChange={(e)=>setIncludeSharedDrives(e.target.checked)} /> include Shared Drives
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={excludeShiny} onChange={(e)=>setExcludeShiny(e.target.checked)} /> exclude shiny variants
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={autoLoadDriveCache} onChange={(e)=>setAutoLoadDriveCache(e.target.checked)} /> auto-load cache.json from Drive
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={rememberKey} onChange={(e)=>setRememberKey(e.target.checked)} /> remember API key (this browser)
        </label>
        <span className="opacity-70">Paging handled automatically.</span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button className="text-xs px-2 py-1 rounded border" onClick={exportCacheJSON}>Export cache JSON</button>
        <label className="text-xs px-2 py-1 rounded border cursor-pointer">
          Import cache JSON
          <input type="file" accept="application/json" className="hidden" onChange={(e)=>importCacheJSON(e.target.files?.[0])} />
        </label>
        <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">Indexed: {refsCount}</span>
      </div>

      {progress && progress.total > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1 text-xs text-slate-600">
            <span>Indexing images…</span>
            <span>{progress.done}/{progress.total}</span>
          </div>
          <div className="h-2 rounded bg-slate-200 overflow-hidden">
            <div
              className="h-2 bg-emerald-500"
              style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </section>
  );
}
