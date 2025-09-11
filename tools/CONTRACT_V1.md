# Nebula Bingo Tracker — Contract V1
_Frozen interfaces to stop name-drift across Adapter ↔ Views ↔ Pipeline._

**Date:** 2025‑09‑10  
**Scope:** BingoCard adapter & views, Sidebar entrypoints, pipeline shapes, and minimal style tokens.

---

## A) View Contracts (source of truth)

### `BingoCardView` (pure UI, read-only)
**Props (exact names + shape):**
- `title: string`
- `renaming: boolean`
- `onRenameStart(): void`
- `onTitleChange(e: React.ChangeEvent<HTMLInputElement>): void`
- `onRenameSubmit(nextTitle: string): void`
- `onRemove(): void`
- `analyzing: boolean`
- `progress: number` (0–100)
- `cells: Array<CellResult | null>` (length 25, row-major)
- `checked: boolean[]` (length 25)
- `onToggleCell(index: number): void`
- `onPickImage(): void`
- `fileInput: ReactElement<HTMLInputElement>` (hidden file input element)
- `analyzedOnce: boolean`

**`CellResult` (minimal read keys the view may use):**
```ts
type CellResult = {
  spriteUrl?: string;   // preferred image field
  matchUrl?: string;    // fallback
  url?: string;         // fallback
  ref?: { url?: string } // fallback
  label?: string;       // preferred caption field
  name?: string;        // fallback
  key?: string;         // fallback
  empty?: boolean;
  noMatch?: boolean;
}
```

> View is strictly read-only; no state mutations.

---

### `GridTunerModal` (pure UI, read-only)
**Props:**
- `image?: HTMLImageElement | null`
- `imageSrc?: string | null`
- `initialFractions?: Fractions`
- `fractions: Fractions`
- `onChange(next: Fractions): void`
- `onConfirm(final: Fractions): void`
- `onCancel(): void`

**`Fractions`**
```ts
type Fractions = {
  left: number;   // 0..1
  top: number;    // 0..1
  width: number;  // 0..1
  height: number; // 0..1
}
```

---

## B) Adapter Contract (`src/components/BingoCard.jsx`)

`BingoCard.jsx` is the single **adapter** that maps hook state/actions to the **View Contracts** above and shims legacy names.

**Freeze these mappings:**

- **Title / rename**
  - `title = h.title`
  - `renaming = h.titleEditing?.renaming ?? h.renaming ?? false`
  - `onRenameStart = h.titleEditing?.onTitleClick ?? h.startRenaming`
  - `onTitleChange = (e) => h.setTitle?.(e?.target?.value ?? "")`
  - `onRenameSubmit = (next) => (h.titleEditing?.onTitleInputBlur?.({ currentTarget: { value: next } }) ?? h.commitRenaming?.(next))`

- **Analyze / fill**
  - `onPickImage = h.pickImage`
  - `fileInput = <input type="file" ref={h.fileInputRef} accept="image/*" onChange={h.onFileChange} hidden />`
  - `analyzing = h.analyzing`
  - `progress = h.progress`
  - `analyzedOnce = h.analyzedOnce`

- **Grid data**
  - `cells = h.results` *(25 items)*
  - `checked = ensure25(h.checked)` *(adapter normalizes to boolean[25])*
  - `onToggleCell = h.toggleChecked`

- **Removal**
  - `onRemove = h.onRemove`

- **Tuner modal**
  - Visible when `h.showTuner` is true.
  - `image = h.tunerImage ?? null`
  - `imageSrc = h.tunerImage?.src ?? h.tunerImageSrc ?? null`
  - `fractions = h.tunerFractions ?? h.fractions`
  - `onChange = (f) => (h.setTunerFractions ?? h.setFractions)?.(f)`
  - `onConfirm = (f) => (h.confirmTuner ?? h.onTunerConfirm)?.(f)`
  - `onCancel = () => (h.cancelTuner ?? h.onTunerCancel)?.()`

**Legacy shims kept during migration:**
- `titleEditing.{renaming,onTitleClick,onTitleInputBlur}`
- `confirmTuner/cancelTuner` vs `onTunerConfirm/onTunerCancel`
- `tunerImageSrc` when `tunerImage` missing

---

## C) Pipeline Contracts (hook + utils)

### `src/hooks/useBingoCard.js` (surface used by adapter)
- **Read:** `title`, `analyzing`, `analyzedOnce`, `progress`, `results: CellResult[25]`, `checked: boolean[25]`, `showTuner`, `tunerImage`, `tunerImageSrc`, `fractions`, `tunerFractions`
- **Actions:** `startRenaming(title?)`, `setTitle(title)`, `commitRenaming(title)`, `pickImage()`, `onFileChange(e)`, `fillCard(source?)`, `onTunerConfirm(fractions)`, `onTunerCancel()`, `setFractions(f)`, `setTunerFractions(f)`, `toggleChecked(i)`, `setResults(arr)`, `onRemove()`

### `src/utils/clipSession.js`
- `getClipSession(opts?) => Promise<InferenceSession>`
- `embedImage(imgLike, session?) => Promise<Float32Array>` *(embedding dim **D**)*
- `setClipModelUrl(url: string): void`
- `l2norm(vec: Float32Array): Float32Array`

### `src/utils/matchers.js` (or `clipMatcher.js`)
- `findBestMatch(embed: Float32Array, index: EmbedIndex, threshold?: number) => Match | null`

```ts
type EmbedIndex =
  | { vectors: Float32Array[]; meta: any[]; normalized?: boolean }
  | { vectors: Float32Array;  meta: any[]; normalized?: boolean } // flat length N*D

type Match = {
  idx: number;
  score: number;          // cosine [0..1]
  ref: any;               // meta[idx]
  spriteUrl: string;      // resolved url the view can render
}
```

### `src/utils/image.js`
- `loadFractions(): Fractions | null`
- `saveFractions(f: Fractions): void`
- `fileToImage(file: File): Promise<HTMLImageElement>`
- `computeCrops25(img: HTMLImageElement|ImageBitmap, fractions?: Fractions): ImageData[]|HTMLCanvasElement[]`
  - Must return **25 square tiles**, row‑major, deterministic.

---

## D) Sidebar Entrypoints (`src/components/Sidebar.jsx`)
Adapter / app should expose:
- `onNewCard(): void`
- `onGetSprites(): Promise<void>` (warm/prepare sprite index)
- `onSelect(index: number): void`
- `cards: { title?: string }[]`
- `currentIndex: number`
- `spritesReady: boolean`

---

## E) Styling tokens & classnames

**Keep these CSS custom properties:**
`--bg, --fg, --panel, --panel-2, --border, --accent, --muted, --primary`

**Stable classnames referenced by views:**
`.app-header, .app-body, .sidebar, .main-content, .panel, .panel-title, .bingo-card, .card-header, .card-actions, .grid-5x5, .cell, .bingo-sprite, .caption, .no-match, .complete, .btn, .btn--primary, .fill-hud, .fill-box, .fill-title, .fill-bar, .fill-bar-inner, .fill-meta, .list, .list-item, .active`

**Add tokens (non‑destructive):**
```css
:root {
  --btn-w: 148px;   /* unify New Card + tuner controls */
  --header-h: 48px; /* card header height for alignment */
}
.btn { min-width: var(--btn-w); }
.card-header { min-height: var(--header-h); }
```

---

## Validator (dev-only)

Add `src/contracts/validateAdapter.js` and in `BingoCard.jsx` (DEV only):
```js
import { validateBingoCardViewProps, validateGridTunerModalProps } from "../contracts/validateAdapter";
if (import.meta.env.DEV) {
  validateBingoCardViewProps(viewProps);
  if (h.showTuner) validateGridTunerModalProps(modalProps);
}
```

Violations should warn via `console.warn` with prefix `[AdapterValidator]` and the offending path.
