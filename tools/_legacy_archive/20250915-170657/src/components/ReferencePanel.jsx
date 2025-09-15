// src/components/ReferencePanel.jsx
import React from "react";

export default function ReferencePanel({
  refs,
  hashing,

  // Drive inputs
  driveFolderId, setDriveFolderId,
  driveApiKey, setDriveApiKey,
  includeSharedDrives, setIncludeSharedDrives,
  excludeShiny, setExcludeShiny,
  rememberKey, setRememberKey,

  // Speed/UX
  useThumbnails, setUseThumbnails,
  concurrency, setConcurrency,
  progress,

  // Actions
  handleDriveFetch,
  exportCacheJSON,
  importCacheJSON,
  onLoadDriveCache,   // new: check Drive for sprite_ref_cache.json
}) {
  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-2">1) Reference sprites</h2>
      <p className="text-sm text-slate-600 mb-3">
        Source: <b>Google Drive (top-level only)</b>. Hashes are cached locally (Export/Import below).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input className="border rounded px-2 py-1 text-sm" placeholder="Drive Folder ID"
               value={driveFolderId} onChange={(e)=>setDriveFolderId(e.target.value)} />
        <input className="border rounded px-2 py-1 text-sm" placeholder="Google API Key"
               value={driveApiKey} onChange={(e)=>setDriveApiKey(e.target.value)} />
        <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm"
                onClick={handleDriveFetch}>
          Fetch & Index
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={includeSharedDrives}
                 onChange={(e)=>setIncludeSharedDrives(e.target.checked)} />
          include Shared Drives
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={excludeShiny}
                 onChange={(e)=>setExcludeShiny(e.target.checked)} />
          exclude shiny variants
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={rememberKey}
                 onChange={(e)=>setRememberKey(e.target.checked)} />
          remember API key (this browser)
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={useThumbnails}
                 onChange={(e)=>setUseThumbnails(e.target.checked)} />
          use thumbnails first (faster)
        </label>
        <label className="inline-flex items-center gap-2">
          concurrency
          <input type="number" min={1} max={32} value={concurrency}
                 onChange={(e)=>setConcurrency(Math.max(1, Math.min(32, parseInt(e.target.value||"1"))))}
                 className="w-16 border rounded px-1" />
        </label>
        <button className="px-2 py-1 border rounded" onClick={onLoadDriveCache}>
          Check Drive for cache.json
        </button>
        <button className="px-2 py-1 border rounded" onClick={exportCacheJSON}>
          Export cache JSON
        </button>
        <label className="px-2 py-1 border rounded cursor-pointer">
          Import cache JSON
          <input type="file" accept="application/json" className="hidden"
                 onChange={(e)=>importCacheJSON(e.target.files?.[0])} />
        </label>
      </div>

      {(hashing || progress?.total > 0) && (
        <div className="mt-3 flex items-center gap-3">
          <div className="w-64 h-2 bg-slate-200 rounded overflow-hidden">
            <div className="h-2 bg-emerald-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="text-xs text-slate-600">
            {progress.done} / {progress.total} {hashing ? "…hashing" : "done"}
          </div>
        </div>
      )}

      {refs.length > 0 && (
        <div className="mt-4">
          <div className="text-sm text-slate-600 mb-2">Preview (first 24 of {refs.length} refs)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-48 overflow-y-auto">
            {refs.slice(0, 24).map((r, i) => (
              <div key={i} className="flex items-center gap-2 p-2 border rounded-lg">
                <img src={r.url} alt={r.name} className="w-10 h-10 object-contain" />
                <div className="text-xs truncate" title={r.name}>{r.name}</div>
              </div>
            ))}
            {refs.length > 24 && <div className="text-xs text-slate-500">+{refs.length - 24} more…</div>}
          </div>
        </div>
      )}
    </section>
  );
}
