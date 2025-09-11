// src/components/TuningPanel.jsx
import { useMemo, useState, useSyncExternalStore } from "react";
import { tuning } from "../tuning/tuningStore";
import CropPreviewModal from "./CropPreviewModal"; // ensure this file exists

const DEFAULTS = Object.freeze({
  scoreThreshold: 0.30, // cosine cutoff for accepting a match
  unboardPct: 0.12,     // trim uniform border before embedding
  jitterFrac: 0.04,     // +/- jitter as fraction of crop side
  multiCrop: 5,         // center + 4 jitters
});

function useTuningSnapshot() {
  return useSyncExternalStore(tuning.subscribe, tuning.get, tuning.get);
}

function Row({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="text-sm opacity-80">{label}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export default function TuningPanel({ open = true, onClose }) {
  const snap = useTuningSnapshot();
  const values = useMemo(() => ({ ...DEFAULTS, ...(snap || {}) }), [snap]);
  const [showPreview, setShowPreview] = useState(false);

  const setVal = (patch) => tuning.set(patch);

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-40 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      {/* Card */}
      <div className="relative z-10 w-[420px] max-w-[95vw] rounded-xl border border-white/10 bg-[#121212] p-4 shadow-2xl">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-semibold">Matching Tuner</h2>
          <div className="flex items-center gap-2">
            <button type="button" className="btn btn-sm" onClick={() => tuning.set({ ...DEFAULTS })}>
              Reset
            </button>
            <button type="button" className="btn btn-sm" onClick={() => setShowPreview(true)}>
              Preview crops
            </button>
            <button type="button" className="btn btn-sm" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {/* Score threshold */}
          <Row label={`Score Threshold: ${values.scoreThreshold.toFixed(2)}`}>
            <input
              type="range" min="0.20" max="0.50" step="0.01"
              value={values.scoreThreshold}
              onChange={(e) => setVal({ scoreThreshold: parseFloat(e.target.value) })}
            />
            <input
              type="number" step="0.01" min="0.20" max="0.50"
              value={values.scoreThreshold}
              onChange={(e) => setVal({ scoreThreshold: Number(e.target.value || 0) })}
              className="w-20 text-right"
            />
          </Row>

          {/* Unboard */}
          <Row label={`Unboard %: ${(values.unboardPct * 100).toFixed(0)}%`}>
            <input
              type="range" min="0" max="0.40" step="0.01"
              value={values.unboardPct}
              onChange={(e) => setVal({ unboardPct: parseFloat(e.target.value) })}
            />
            <input
              type="number" step="0.01" min="0" max="0.4"
              value={values.unboardPct}
              onChange={(e) => setVal({ unboardPct: Number(e.target.value || 0) })}
              className="w-20 text-right"
            />
          </Row>

          {/* Jitter */}
          <Row label={`Jitter: ${(values.jitterFrac * 100).toFixed(1)}%`}>
            <input
              type="range" min="0" max="0.15" step="0.005"
              value={values.jitterFrac}
              onChange={(e) => setVal({ jitterFrac: parseFloat(e.target.value) })}
            />
            <input
              type="number" step="0.005" min="0" max="0.15"
              value={values.jitterFrac}
              onChange={(e) => setVal({ jitterFrac: Number(e.target.value || 0) })}
              className="w-20 text-right"
            />
          </Row>

          {/* Multi-crop */}
          <Row label={`Multi-crop: ${values.multiCrop}×`}>
            <input
              type="range" min="1" max="9" step="1"
              value={values.multiCrop}
              onChange={(e) => setVal({ multiCrop: parseInt(e.target.value, 10) })}
            />
            <input
              type="number" step="1" min="1" max="9"
              value={values.multiCrop}
              onChange={(e) => setVal({ multiCrop: parseInt(e.target.value || "1", 10) })}
              className="w-16 text-right"
            />
          </Row>
        </div>

        <p className="mt-4 text-xs opacity-70">
          Tip: start with Unboard 10–14%, Jitter 2–6%, Multi-crop 5, Threshold 0.30–0.34.
        </p>
      </div>

      {showPreview && <CropPreviewModal onClose={() => setShowPreview(false)} />}
    </div>
  );
}
