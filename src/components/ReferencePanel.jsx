// src/components/ReferencePanel.jsx
import React from "react";

export default function ReferencePanel({
  // data
  refs,
  hashing,
  progress = { stage: "idle", total: 0, done: 0, msg: "" },
  // drive controls
  driveFolderId, setDriveFolderId,
  driveApiKey, setDriveApiKey,
  includeSharedDrives, setIncludeSharedDrives,
  excludeShiny, setExcludeShiny,
  rememberKey, setRememberKey,
  // actions
  handleDriveFetch,
  // cache helpers
  exportCacheJSON,
  importCacheJSON,
}) {
  const { stage, total, done, msg } = progress || {};
  const pct = total > 0 ? Math.round((done / total) * 100) : (stage !== "idle" ? 0 : 100);
  const busy = hashing || (stage !== "idle");

  return (
    <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-2">1) Reference sprites</h2>
      <p className="text-sm text-slate-600 mb-3">
        Source: <strong>Google Drive (top-level only)</strong>. Hashes are cached locally (Export/Import below).
      </p>

      {/* Drive controls */}
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
        <button
          className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 text-sm disabled:opacity-60"
          disabled={!driveFolderId || !driveApiKey || busy}
          onClick={handleDriveFetch}
        >
          {busy ? "Indexing…" : "Fetch & Index"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-700">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={includeSharedDrives} onChange={(e)=>setIncludeSharedDrives(e.target.checked)} />
          include Shared Drives
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={excludeShiny} onChange={(e)=>setExcludeShiny(e.target.checked)} />
          exclude shiny variants
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={rememberKey} onChange={(e)=>setRememberKey(e.target.checked)} />
          remember API key (this browser)
        </label>
        <span className="opacity-70">Top-level only; thumbnails hashed first for speed.</span>
      </div>

      {/* Progress */}
      {stage !== "idle" && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <div className="text-slate-600">{msg || stage}</div>
            <div className="text-slate-500">{done}/{total} ({isFinite(pct) ? pct : 0}%)</div>
          </div>
          <div className="w-full h-2 rounded bg-slate-100 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
          </div>
        </div>
      )}

      {/* Cache tools */}
      <div className="mt-3 flex items-center flex-wrap gap-2">
        <button className="text-xs px-2 py-1 rounded border" onClick={exportCacheJSON}>
          Export cache JSON
        </button>
        <label className="text-xs px-2 py-1 rounded border cursor-pointer">
          Import cache JSON
          <input type="file" accept="application/json" className="hidden" onChange={(e)=>importCacheJSON(e.target.files?.[0])} />
        </label>
        <span className="text-xs text-slate-600">Indexed: {refs?.length || 0}</span>
      </div>

      {/* Preview */}
      {(refs?.length || 0) > 0 && (
        <div className="mt-4">
          <div className="text-sm text-slate-600 mb-2">
            Preview (first 24 of {refs.length} refs)
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 max-h-48 overflow-y-auto">
            {refs.slice(0, 24).map((r, i) => (
              <div key={i} className="flex items-center gap-2 p-2 border rounded-lg">
                <img
                  src={r.thumbUrl || r.url}
                  alt=""                           // ← prevent visible fallback text
                  title={r.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 object-contain"
                  onError={(e) => {               // fallback to full URL if thumb fails
                    if (r.url && e.currentTarget.src !== r.url) {
                      e.currentTarget.src = r.url;
                    } else {
                      e.currentTarget.style.display = "none"; // hide broken image box
                    }
                  }}
                />
                <div className="text-xs truncate" title={r.name}>{r.name}</div>
              </div>
            ))}
            {refs.length > 24 && (
              <div className="text-xs text-slate-500">+{refs.length - 24} more…</div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
