// src/hooks/useRefIndex.js
import { useEffect, useState } from "react";
import { prepareRefIndex, getRefIndex } from "../utils/sprites.js";

export default function useRefIndex(url = "/sprite_index_clip.json") {
  const [state, set] = useState(() => ({ index: getRefIndex(), loading: !getRefIndex(), error: null }));
  useEffect(() => {
    let dead = false;
    if (!state.index) {
      prepareRefIndex(url).then(
        idx => !dead && set({ index: idx, loading: false, error: null }),
        err => !dead && set({ index: null, loading: false, error: err })
      );
    }
    return () => { dead = true; };
  }, [url]);
  return state; // { index, loading, error }
}
