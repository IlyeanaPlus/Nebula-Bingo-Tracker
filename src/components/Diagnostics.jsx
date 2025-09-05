import React from "react";

export default function Diagnostics({ diag, runDiagnostics, runHelperTests }) {
  return (
    <section className="mb-6 p-4 bg-white rounded-2xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold mb-2">3) Diagnostics</h2>
      <p className="text-sm text-slate-600 mb-3">If Drive fetch fails, run this. It checks your API key, lists a few files, and tries to download one image with detailed errors.</p>
      <div className="flex items-center gap-2 mb-2">
        <button disabled={diag.running} className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200 disabled:opacity-50" onClick={runDiagnostics}>{diag.running ? "Running…" : "Run diagnostics"}</button>
        <button className="px-3 py-1 rounded bg-slate-100 hover:bg-slate-200" onClick={runHelperTests}>Run helper tests</button>
        <span className="text-xs text-slate-500">Tip: if your API key has referrer restrictions, run from http://localhost or your allowed domain (not file://).</span>
      </div>
      <pre className="text-xs bg-slate-50 border rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap">{diag.logs.join("\n") || "(No logs yet)"}</pre>
    </section>
  );
}
