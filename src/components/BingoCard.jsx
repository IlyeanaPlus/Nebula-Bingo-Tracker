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
        title={h.title}
        renaming={h.renaming}
        onRenameStart={h.startRename}
        onRenameSubmit={h.submitRename}
        onTitleChange={h.onTitleChange}
        analyzing={h.analyzing}
        progress={h.progress}
        cells={h.cells}
        checked={h.checked}
        onToggleCell={h.toggleCell}
        onPickImage={h.pickImage}
        onRemove={h.onRemove}
        // keep your view unchanged: it expects `fileInput`
        fileInput={h.fileInput}
      />

      {console.log("[BingoCard] showTuner state =", h.showTuner)}
      {h.showTuner && (
        <GridTunerModal
          imageSrc={h.pendingImageSrc}
          initialFractions={h.fractions}
          onConfirm={h.confirmTuner}
          onCancel={h.cancelTuner}
        />
      )}
    </>
  );
}
