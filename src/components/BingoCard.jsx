// src/components/BingoCard.jsx
import React from "react";
import useBingoCard from "../hooks/useBingoCard";
import BingoCardView from "./BingoCardView";
import GridTunerModal from "./GridTunerModal";

export default function BingoCard({ card, manifest, onChange, onRemove }) {
  const h = useBingoCard({ card, manifest, onChange, onRemove });

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
            h.titleEditing.onTitleInputBlur({ currentTarget: { value: next } });
          } else {
            h.commitRenaming(next);
          }
        }}

        /* fill / analyze */
        analyzing={h.analyzing}
        progress={h.progress}
        onPickImage={h.pickImage}      // ⬅️ now uses hook’s pickImage()
        fileInput={
          <input
            ref={h.fileInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={h.onFileChange}  // ⬅️ hook handles file selection
          />
        }

        /* grid */
        cells={h.results}
        analyzedOnce={h.analyzedOnce}
        checked={h.checked}
        onToggleCell={h.toggleChecked}

        /* remove */
        onRemove={h.onRemove}
      />

      {/* Tuner modal */}
      {h.showTuner && (
        <GridTunerModal
          imageSrc={h.tunerImage?.src || null}
          initialFractions={h.tunerFractions}
          onConfirm={h.confirmTuner}
          onCancel={h.cancelTuner}
        />
      )}
    </>
  );
}
