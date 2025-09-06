// src/components/ReferencePanel.jsx
import React from "react";

export default function ReferencePanel({
  refs,
  hashing,
  progress,                 // {stage,total,done,msg}
  excludeShiny, setExcludeShiny,
  driveFolderId, setDriveFolderId,
  driveApiKey, setDriveApiKey,
  includeSharedDrives, setIncludeSharedDrives,
  rememberKey, setRememberKey,
  handleDriveFetch,
  handleDriveLoadCache,     // NEW: check & load cache.json from Drive
  exportCacheJSON,
  importCacheJSON
}) {
  const pct = progress?.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-2">1) Reference sprites</h2>
      <p className="text-sm text-slate-600 mb-3">
        Source: Google Drive (public). Optionally load a prebuilt cache JSON first to avoid re-hashing.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input
          className="border rounded px-2 py-1 text-sm"
          placeholder="Drive Folder ID"
          value={driveFolderId}
          onChange={(e)=>setDriveFolderId(e.target.value)}
        />
        <input
          className="border rounded px-2 py-1 text-sm"
          placeholder="Google API Key"
          value={driveApiKey}
          onChange={(e)=>setDriveApiKey(e.target.value)}
        />
        <div className="flex gap-2">
          <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={handleDriveLoadCache}>
            Check & Load Drive Cache
          </button>
          <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={handleDriveFetch}>
            Fetch & Index
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-3 text-xs text-slate-600 flex-wrap">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={includeSharedDrives} onChange={(e)=>setIncludeSharedDrives(e.target.checked)} /> include Shared Drives
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={excludeShiny} onChange={(e)=>setExcludeShiny(e.target.checked)} /> exclude shiny variants
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={rememberKey} onChange={(e)=>setRememberKey(e.target.checked)} /> remember API key (this browser)
        </label>

        <button className="ml-auto text-xs px-2 py-1 rounded border" onClick={exportCacheJSON}>Export cache JSON</button>
        <label className="text-xs px-2 py-1 rounded border cursor-pointer">
          Import cache JSON
          <input type="file" accept="application/json" className="hidden" onChange={(e)=>importCacheJSON(e.target.files?.[0])} />
        </label>
        <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">Indexed: {refs.length}</span>
      </div>

      {/* Progress */}
      {hashing && (
        <div className="mt-3">
          <div className="text-xs text-slate-600 mb-1">{progress?.msg || "Processing…"}</div>
          <div className="w-full h-2 bg-slate-100 rounded">
            <div
              className="h-2 rounded bg-slate-400"
              style={{ width: `${pct}%`, transition: "width .2s ease" }}
            />
          </div>
          {progress?.total > 0 && (
            <div className="text-[10px] text-slate-500 mt-1">
              {progress.done}/{progress.total} ({pct}%)
            </div>
          )}
        </div>
      )}

      {/* Preview */}
      {(refs?.length || 0) > 0 && (
        <div className="mt-4">
          <div className="text-sm text-slate-600 mb-2">Preview (first 24 of {refs.length} refs)</div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-48 overflow-y-auto">
            {refs.slice(0, 24).map((r, i) => (
              <div key={i} className="flex items-center gap-2 p-2 border rounded-lg">
                <img
                  src={r.thumbUrl || r.url}
                  alt=""                 // prevent fallback text
                  title={r.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 object-contain"
                  onError={(e) => {
                    if (r.url && e.currentTarget.src !== r.url) {
                      e.currentTarget.src = r.url;
                    } else {
                      e.currentTarget.style.display = "none";
                    }
                  }}
                />
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
