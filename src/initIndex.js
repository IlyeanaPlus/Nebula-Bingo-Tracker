// src/initIndex.js
// Fire-and-forget eager load of the sprite index on app start.
import { prepareRefIndex } from "./utils/sprites";

export function initIndex(url = "/sprite_index_clip.json") {
  // no await; just warms the cache
  prepareRefIndex(url).catch(() => {
    // swallow — UI can still lazy-load via useRefIndex later
  });
}

export default initIndex;
