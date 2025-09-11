import React, { useEffect, useMemo, useRef } from "react";
import BingoCardView from "./BingoCardView";
import GridTunerModal from "./GridTunerModal";
import useBingoCard from "../hooks/useBingoCard";

// Normalize arrays to 25 items (checked booleans)
const as25Booleans = (arr, fill = false) => {
  const out = Array.isArray(arr) ? arr.slice(0, 25) : [];
  while (out.length < 25) out.push(fill);
  return out.map(Boolean);
};

// Normalize arrays to 25 items (cells)
const as25Any = (arr) => {
  const out = Array.isArray(arr) ? arr.slice(0, 25) : [];
  while (out.length < 25) out.push(null);
  return out;
};

export default function BingoCard({ card, manifest, onChange, onRemove }) {
  const h = useBingoCard({ card, manifest, onChange, onRemove });

  // File input: prefer hook ref if present, otherwise local
  const localFileRef = useRef(null);
  const fileInputRef = h.fileInputRef ?? localFileRef;

  const onPickImage = () => {
    if (typeof h.pickImage === "function") return h.pickImage();
    const el = fileInputRef.current;
    if (el && typeof el.click === "function") el.click();
  };

  // Title/rename adapter (freeze prop names)
  const renaming =
    (h.titleEditing && !!h.titleEditing.renaming) || !!h.renaming || false;

  const onRenameStart =
    (h.titleEditing && h.titleEditing.onTitleClick) ||
    h.startRenaming ||
    (() => {});

  const onTitleChange = (e) => {
    const v = e?.target?.value ?? "";
    if (typeof h.setTitle === "function") h.setTitle(v);
  };

  const onRenameSubmit = (nextTitle) => {
    if (h.titleEditing?.onTitleInputBlur) {
      h.titleEditing.onTitleInputBlur({ currentTarget: { value: nextTitle } });
      return;
    }
    if (typeof h.commitRenaming === "function") {
      h.commitRenaming(nextTitle);
    }
  };

  // Normalize data for the view
  const cells = as25Any(h.results);
  const checked = as25Booleans(h.checked, false);

  const fileInputEl = (
    <input
      type="file"
      accept="image/*"
      ref={fileInputRef}
      onChange={h.onFileChange || (() => {})}
      style={{ display: "none" }}
    />
  );

  // Tuner wiring (session-only fractions)
  const fractions = h.tunerFractions ?? h.fractions;
  const onTunerChange = (h.setTunerFractions ?? h.setFractions) || (() => {});
  const onTunerConfirm = (h.confirmTuner ?? h.onTunerConfirm) || (() => {});
  const onTunerCancel = (h.cancelTuner ?? h.onTunerCancel) || (() => {});

  const viewProps = useMemo(
    () => ({
      title: h.title || "New Card",
      renaming,
      onRenameStart,
      onTitleChange,
      onRenameSubmit,
      onRemove: h.onRemove || (() => {}),

      analyzing: !!h.analyzing,
      progress: Number.isFinite(h.progress) ? h.progress : 0,

      cells,
      checked,
      onToggleCell: h.toggleChecked || (() => {}),

      onPickImage,
      fileInput: fileInputEl,

      analyzedOnce: !!h.analyzedOnce,
    }),
    [
      h.title,
      renaming,
      h.onRemove,
      h.analyzing,
      h.progress,
      cells,
      checked,
      h.toggleChecked,
      onPickImage,
      fileInputEl,
      h.analyzedOnce,
    ]
  );

  const modalProps = useMemo(() => {
    if (!h.showTuner) return null;
    const base = {
      image: h.tunerImage ?? null,
      imageSrc: (h.tunerImage && h.tunerImage.src) || h.tunerImageSrc || null,
      fractions: fractions || { left: 0, top: 0, width: 1, height: 1 },
      onChange: onTunerChange,
      onConfirm: onTunerConfirm,
      onCancel: onTunerCancel,
    };
    if (h.initialFractions) base.initialFractions = h.initialFractions;
    return base;
  }, [
    h.showTuner,
    h.tunerImage,
    h.tunerImageSrc,
    fractions,
    onTunerChange,
    onTunerConfirm,
    onTunerCancel,
    h.initialFractions,
  ]);

  // DEV-only adapter validator (optional)
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (async () => {
      try {
        const {
          validateBingoCardViewProps,
          validateGridTunerModalProps,
        } = await import("../contracts/validateAdapter");
        validateBingoCardViewProps(viewProps);
        if (modalProps) validateGridTunerModalProps(modalProps);
      } catch {
        /* no-op */
      }
    })();
  }, [viewProps, modalProps]);

  return (
    <>
      <BingoCardView {...viewProps} />
      {modalProps ? <GridTunerModal {...modalProps} /> : null}
    </>
  );
}
