// src/components/SidebarTuning.jsx
import { useState } from "react";
import TuningPanel from "./TuningPanel";

export default function SidebarTuning() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sidebar-tuning">
      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={() => setOpen(true)}
        aria-label="Show matching tuner"
      >
        Show Tuning
      </button>

      {open && <TuningPanel open={open} onClose={() => setOpen(false)} />}
    </div>
  );
}
