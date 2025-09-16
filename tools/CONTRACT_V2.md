# Nebula Bingo Tracker — CONTRACT_V2

> Purpose: freeze the **public surface** of modules so we can improve internals without breaking the app.

Updated: YYYY-MM-DD  
Status: Draft (active)

---

## Shared Types (JS doc typedefs; not TS)

- **Fractions**: `{ left:number, top:number, width:number, height:number }` (0..1)
- **SpriteMeta**: `{ key:string, name:string, slug:string, dex:number, path:string }`
- **IndexHead**: `{ dim:number, count:number, normalized:true, mapped:number, vectors:Float32Array|Float32ArrayLike, meta:Array<SpriteMeta> }`
- **MatchResult**: `{ idx:number, score:number, ref:SpriteMeta, vec?:Float32Array }`
- **TuningState** (persisted in `localStorage["nbt.tuner.v1"]`):
  ```js
  {
    scoreThreshold:number,    // 0..1
    bgAtten:boolean,          // dominant-bg attenuation
    bgSigma:number,           // e.g. 18
    cropInsetPct:number,      // 0..0.2
    jitterFrac:number,        // 0, 0.5, 1 -> maps to {1, 4, 9} iters
    useShape:boolean,         // future
    debugTopK:number          // 1..10
  }
