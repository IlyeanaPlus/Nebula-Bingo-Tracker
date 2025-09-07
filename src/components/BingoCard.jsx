// src/components/BingoCard.jsx
import React from "react";
import BingoCardView from "./BingoCardView.jsx";
import GridTunerModal from "./GridTunerModal.jsx";
import useBingoCard from "../hooks/useBingoCard";

/** Container: wires logic (hook) to the presentational view. UI is protected in BingoCardView.jsx. */
export default function BingoCard({ card, onChange, onRemove, manifest }) {
  const bc = useBingoCard({ card, manifest, onChange, onRemove });
  return (<>
    <BingoCardView
      title={bc.title} renaming={bc.renaming}
      onRenameStart={bc.startRename} onRenameSubmit={bc.submitRename} onTitleChange={bc.onTitleChange}
      analyzing={bc.analyzing} progress={bc.progress} spritesReady={bc.spritesReady}
      cells={bc.cells} checked={bc.checked} onToggleCell={bc.toggleCell}
      onPickImage={bc.pickImage} onSave={bc.saveCard} onRemove={bc.onRemove}
      fileInput={<input {...bc.fileInputProps}/>}
    />
    {bc.showTuner && (<GridTunerModal imageSrc={bc.pendingImageSrc} initialFractions={bc.fractions} onConfirm={bc.confirmTuner} onCancel={bc.cancelTuner}/>)}
  </>);
}
