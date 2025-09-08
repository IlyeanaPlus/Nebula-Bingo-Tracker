import os, json, math, argparse, sys
from pathlib import Path
from tqdm import tqdm

import numpy as np
from PIL import Image
import onnxruntime as ort

# ---------- CLIP preprocessing (vision encoder) ----------
MEAN = np.array([0.48145466, 0.4578275, 0.40821073], dtype=np.float32)
STD  = np.array([0.26862954, 0.26130258, 0.27577711], dtype=np.float32)

def center_crop_resize(img: Image.Image, size: int = 224) -> Image.Image:
    """Resize shortest side and center-crop to a square of `size`."""
    w, h = img.size
    if w == 0 or h == 0:
        raise ValueError("Empty image")
    scale = max(size / w, size / h)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    img = img.resize((nw, nh), Image.BICUBIC)
    # center crop
    left = (nw - size) // 2
    top  = (nh - size) // 2
    return img.crop((left, top, left + size, top + size))

def to_chw_float_tensor(img: Image.Image) -> np.ndarray:
    """Return NCHW float32 normalized tensor for ONNX: [1,3,224,224]."""
    arr = np.asarray(img).astype(np.float32) / 255.0   # HWC, [0,1]
    if arr.ndim == 2:  # grayscale -> 3ch
        arr = np.stack([arr, arr, arr], axis=-1)
    if arr.shape[2] == 4:  # RGBA -> RGB
        arr = arr[:, :, :3]
    arr = (arr - MEAN) / STD
    chw = np.transpose(arr, (2, 0, 1))  # CHW
    chw = chw[np.newaxis, ...]          # NCHW
    return chw.astype(np.float32)

def l2_normalize(v: np.ndarray) -> np.ndarray:
    n = np.linalg.norm(v) + 1e-12
    return (v / n).astype(np.float32)

# ---------- Model runner ----------
class ClipVision:
    def __init__(self, model_path: str, provider="CPUExecutionProvider"):
        self.session = ort.InferenceSession(model_path, providers=[provider])

        # Try to detect input/output names generically
        self.input_name = self.session.get_inputs()[0].name
        outs = self.session.get_outputs()
        # Prefer pooled output if present, else first output
        name_by_pref = ["pooled_output", "output", "last_hidden_state"]
        out_name = None
        for pref in name_by_pref:
            for o in outs:
                if o.name == pref:
                    out_name = o.name
                    break
            if out_name:
                break
        if out_name is None:
            out_name = outs[0].name
        self.output_name = out_name

    def embed(self, img: Image.Image) -> np.ndarray:
        img = img.convert("RGB")
        img = center_crop_resize(img, 224)
        x = to_chw_float_tensor(img)
        ort_inputs = { self.input_name: x }
        out = self.session.run([self.output_name], ort_inputs)[0]
        # shape may be (1,512) or (1,577,512)
        if out.ndim == 2:
            vec = out[0]             # (512,)
        elif out.ndim == 3:
            vec = out[0, 0]          # CLS token (512,)
        else:
            raise RuntimeError(f"Unexpected output shape {out.shape}")
        return l2_normalize(vec)

# ---------- IO helpers ----------
def load_drive_cache(cache_path: Path):
    if not cache_path or not cache_path.exists():
        return {}
    with open(cache_path, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception as e:
            print(f"Warning: could not parse drive_cache.json: {e}")
            return {}

def guess_key_from_path(p: Path) -> str:
    # key = filename without extension
    return p.stem

def build_name_src_for_key(key: str, cache: dict):
    """
    Resolve display name and src for a given key from drive_cache.json if present,
    else fall back to the key and a placeholder src.
    """
    entry = cache.get(key)
    if not entry:
        # Sometimes keys in cache are not filename-based. Try a few heuristics:
        # 1) exact match on name
        for k, v in cache.items():
            if (v.get("name") or k) == key:
                entry = v; break
        # 2) match by file basename inside src/url
        if not entry:
            for k, v in cache.items():
                src = v.get("src") or v.get("url") or ""
                base = os.path.splitext(os.path.basename(src))[0]
                if base == key:
                    entry = v; break

    if entry:
        name = entry.get("name") or key
        src  = entry.get("src") or entry.get("url") or ""
    else:
        name = key
        src  = ""  # can be left blank; your app can still display via manifest later
    return name, src

def is_image_file(p: Path):
    return p.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}

# ---------- main ----------
def main():
    ap = argparse.ArgumentParser(description="Precompute CLIP embeddings for local sprite folder.")
    ap.add_argument("--sprites_dir", required=True, help="Path to local sprite root (recursively scanned).")
    ap.add_argument("--onnx", required=True, help="Path to CLIP ViT-B/32 vision ONNX (float32).")
    ap.add_argument("--out_json", required=True, help="Output JSON file (sprite_index_clip.json for your app).")
    ap.add_argument("--drive_cache", default="", help="Optional path to drive_cache.json to copy name/src.")
    ap.add_argument("--limit", type=int, default=0, help="Optional limit on number of files (debug).")
    args = ap.parse_args()

    sprites_dir = Path(args.sprites_dir)
    onnx_path   = Path(args.onnx)
    out_json    = Path(args.out_json)
    cache_path  = Path(args.drive_cache) if args.drive_cache else None

    if not sprites_dir.exists():
        print(f"Sprites dir not found: {sprites_dir}")
        sys.exit(1)
    if not onnx_path.exists():
        print(f"ONNX model not found: {onnx_path}")
        sys.exit(1)

    cache = load_drive_cache(cache_path) if cache_path else {}
    model = ClipVision(str(onnx_path))

    # Gather files
    files = [p for p in sprites_dir.rglob("*") if p.is_file() and is_image_file(p)]
    files.sort(key=lambda p: p.as_posix().lower())
    if args.limit > 0:
        files = files[:args.limit]

    rows = []
    errors = 0

    for p in tqdm(files, desc="Embedding sprites"):
        try:
            key = guess_key_from_path(p)
            name, src = build_name_src_for_key(key, cache)

            img = Image.open(p)
            vec = model.embed(img)  # np.ndarray (512,)
            rows.append({
                "key": key,
                "name": name,
                "src": src,     # may be empty; app can still display via manifest image
                "vec": vec.astype(float).tolist()
            })
        except Exception as e:
            errors += 1
            print(f"[skip] {p}: {e}")

    out_json.parent.mkdir(parents=True, exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(rows, f)
    print(f"\n✅ Wrote {len(rows)} embeddings → {out_json}")
    if errors:
        print(f"⚠️ Skipped {errors} files due to errors.")

if __name__ == "__main__":
    main()
