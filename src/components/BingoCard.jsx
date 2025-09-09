// src/components/BingoCard.jsx
import React, { useMemo } from "react";
import useBingoCard from "../hooks/useBingoCard";
import BingoCardView from "./BingoCardView";
import GridTunerModal from "./GridTunerModal";

export default function BingoCard({ card, manifest, onChange, onRemove }) {
  const h = useBingoCard({ card, manifest, onChange, onRemove });

  // Build the hidden <input type="file"> and bind it to the hook.
  // This is required for browsers without showOpenFilePicker (e.g. GH Pages tests).
  const fileInputEl = useMemo(
    () => (
      <input
        ref={h.bindFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        data-nbt="file"
      />
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [] // create once; the ref callback stays valid
  );

  return (
    <>
      <BingoCardView
        /* title / rename */
        title={h.title}
        renaming={h.titleEditing?.renaming ?? h.renaming}
        onRenameStart={h.titleEditing?.onTitleClick ?? h.startRenaming}
        onTitleChange={h.titleEditing?.onTitleInputChange ?? ((e) => h.setTitle(e.target.value))}
        onRenameSubmit={(e) => {
          e?.preventDefault?.();
          const next = e?.currentTarget?.elements?.[0]?.value ?? h.title;
          if (h.titleEditing?.onTitleInputBlur) {
            // Use the hook’s preferred blur/commit path
            h.titleEditing.onTitleInputBlur({ currentTarget: { value: next } });
          } else {
            h.commitRenaming(next);
          }
        }}

        /* fill / analyze */
        analyzing={h.analyzing}
        progress={h.progress}
        onPickImage={h.fillCard}
        fileInput={fileInputEl}

        /* grid */
        cells={h.results}          // 25 results from CLIP matching
        analyzedOnce={h.analyzedOnce}
        checked={h.checked}
        onToggleCell={h.toggleChecked}

        /* remove */
        onRemove={h.onRemove}
      />

      {/* Tuner modal */}
      {h.showTuner && (
        <GridTunerModal
          imageSrc={h.tunerImage?.src || null}    // hook provides an <img>; modal wants src
          initialFractions={h.tunerFractions}     // live fractions edited in the tuner
          onConfirm={h.confirmTuner}
          onCancel={h.cancelTuner}
        />
      )}
    </>
  );
}
