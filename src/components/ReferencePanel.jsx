import React from "react";

export default function ReferencePanel({
  refs,
  hashing,
  excludeShiny, setExcludeShiny,
  driveFolderId, setDriveFolderId,
  driveApiKey, setDriveApiKey,
  includeSharedDrives, setIncludeSharedDrives,
  rememberKey, setRememberKey,
  handleDriveFetch,
  exportCacheJSON,
  importCacheJSON,
  progress, // { phase, total, done } | null

  // Drive-backed cache
  oauthClientId, setOauthClientId,
  rememberCID, setRememberCID,
  loadCacheFromDrive,
  saveCacheToDrive,

  // NEW: autoload toggle
  autoLoadCache, setAutoLoadCache,
}) {
  const pct = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
    : (progress ? 0 : null);

  return (
    <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-2">1) Reference sprites</h2>
      <p className="text-sm text-slate-600 mb-3">
        Sources: <b>Google Drive (public)</b> and <b>Cache JSON</b>. Uploads/URL list are disabled.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* A) Google Drive */}
        <div>
          <h3 className="font-medium mb-1">A) Google Drive (public)</h3>
          <p className="text-xs text-slate-600 mb-2">Needs a Drive API key and a folder shared as “Anyone with link: Viewer”.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className="border rounded px-2 py-1 text-sm" placeholder="Drive Folder ID" value={driveFolderId} onChange={(e)=>setDriveFolderId(e.target.value)} />
            <input className="border rounded px-2 py-1 text-sm" placeholder="Google API Key" value={driveApiKey} onChange={(e)=>setDriveApiKey(e.target.value)} />
            <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={handleDriveFetch}>Fetch & Index</button>
          </div>

          <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={includeSharedDrives} onChange={(e)=>setIncludeSharedDrives(e.target.checked)} /> include Shared Drives
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={excludeShiny} onChange={(e)=>setExcludeShiny(e.target.checked)} /> exclude shiny variants
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={rememberKey} onChange={(e)=>setRememberKey(e.target.checked)} /> remember API key (this browser)
            </label>
            {hashing ? (
              <span className="text-xs px-2 py-1 rounded bg-amber-100 text-amber-700">Indexing…</span>
            ) : (
              <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-700">Indexed: {refs.length}</span>
            )}
          </div>

          {progress && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-slate-600 mb-1">
                <span>{progress.phase}</span>
                {progress.total > 0 && <span>{Math.min(progress.done, progress.total)} / {progress.total} ({pct}%)</span>}
              </div>
              <div className="h-2 bg-slate-200 rounded overflow-hidden">
                <div
                  className="h-2 bg-indigo-500 transition-all"
                  style={{ width: `${progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 10}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* B) Cache JSON */}
        <div>
          <h3 className="font-medium mb-1">B) Cache JSON</h3>
          <p className="text-xs text-slate-600 mb-2">Export after a successful Drive index to skip re-hashing next time, or store cache.json in Drive.</p>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <button className="text-xs px-2 py-1 rounded border" onClick={exportCacheJSON}>Export cache JSON</button>
            <label className="text-xs px-2 py-1 rounded border cursor-pointer">
              Import cache JSON
              <input type="file" accept="application/json" className="hidden" onChange={(e)=>importCacheJSON(e.target.files?.[0])} />
            </label>
          </div>

          <div className="mt-2 p-2 border rounded-lg">
            <div className="text-xs font-medium mb-1">Drive-backed cache.json</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input className="border rounded px-2 py-1 text-sm" placeholder="OAuth Client ID (for writing)" value={oauthClientId} onChange={(e)=>setOauthClientId(e.target.value)} />
              <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm" onClick={loadCacheFromDrive}>Load from Drive</button>
              <button className="px-3 py-1 rounded bg-indigo-100 hover:bg-indigo-200 text-sm" onClick={saveCacheToDrive}>Save/Update to Drive</button>
            </div>

            <div className="mt-2 flex flex-col gap-1 text-xs text-slate-600">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={rememberCID} onChange={(e)=>setRememberCID(e.target.checked)} /> remember OAuth Client ID (this browser)
              </label>
              {/* NEW: autoload toggle */}
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={autoLoadCache} onChange={(e)=>setAutoLoadCache(e.target.checked)} /> auto-load <code>sprite_ref_cache.json</code> on startup
              </label>
            </div>

            <div className="text-[11px] text-slate-500 mt-2">
              Reading only needs API key + public sharing. Writing requires OAuth (Google will prompt once).
            </div>
          </div>
        </div>
      </div>

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
