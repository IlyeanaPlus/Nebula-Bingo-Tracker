// src/utils/sprites.js
// v4/v3 loader + legendary filtering at runtime.

let _indexPromise;
let _index;

function decodeBase64F32(b64) {
  const bin = atob(b64 || "");
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

// ---------------- legendary/ultra blocklist ----------------
let _legendary = new Set([
  // Kanto
  "articuno","zapdos","moltres","mewtwo","mew",
  // Johto
  "raikou","entei","suicune","lugia","ho-oh","celebi",
  // Hoenn
  "regirock","regice","registeel","latias","latios","kyogre","groudon","rayquaza","jirachi","deoxys",
  // Sinnoh
  "uxie","mesprit","azelf","dialga","palkia","giratina","heatran","regigigas","cresselia","darkrai","shaymin","arceus",
  // Unova
  "cobalion","terrakion","virizion","tornadus","thundurus","landorus","kyurem","keldeo","meloetta","genesect",
  // Kalos
  "xerneas","yveltal","zygarde","diancie","hoopa","volcanion",
  // Alola
  "tapu-koko","tapu-lele","tapu-bulu","tapu-fini","cosmog","cosmoem","solgaleo","lunala","nihilego","buzzwole","pheromosa","xurkitree","celesteela","kartana","guzzlord","necrozma","magearna","marshadow","poipole","naganadel","stakataka","blacephalon","zeraora",
  // Galar
  "zacian","zamazenta","eternatus","kubfu","urshifu","zarude","regieleki","regidrago","glastrier","spectrier","calyrex",
  // Hisui/Paldea + DLC
  "enamorus","koraidon","miraidon","walking-wake","iron-leaves","ogerpon","okidogi","munkidori","fezandipiti","gouging-fire","raging-bolt","iron-boulder","iron-crown","terapagos","pecharunt",
]);
export function setLegendaryBlocklist(names = []) {
  _legendary = new Set(names.map((s) => String(s).toLowerCase()));
}

function _tokenizeName(item) {
  const tok = (item.slug || item.name || item.key || "")
    .toString()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return tok;
}

function _applyLegendaryFilter(idx) {
  const keepItems = [];
  const keptRowIdx = [];
  for (let i = 0; i < idx.items.length; i++) {
    const it = idx.items[i];
    const tok = _tokenizeName(it);
    if (!_legendary.has(tok)) {
      keptRowIdx.push(i);
      keepItems.push(it);
    }
  }
  if (keepItems.length === idx.items.length) return idx; // nothing filtered

  const dim = idx.dim;
  const src = idx.vectors; // Float32Array (packed)
  const dst = new Float32Array(keepItems.length * dim);
  for (let j = 0; j < keepItems.length; j++) {
    const i = keptRowIdx[j];
    dst.set(src.subarray(i * dim, i * dim + dim), j * dim);
  }

  return {
    ...idx,
    items: keepItems,
    count: keepItems.length,
    vectors: dst,
    getVector: (k) => dst.subarray(k * dim, k * dim + dim),
  };
}
// -----------------------------------------------------------

export async function loadSpriteIndex() {
  if (_index) return _index;
  if (_indexPromise) return _indexPromise;

  _indexPromise = (async () => {
    const res = await fetch("/sprite_index_clip.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    // v4 preferred
    if (json.version === 4 && Array.isArray(json.items) && json.vectors_b64) {
      const vectors = decodeBase64F32(json.vectors_b64);
      const idx = {
        version: 4,
        dim: json.dim,
        count: json.count,
        normalized: !!json.normalized,
        items: json.items.map((it, i) => ({
          idx: i,
          key: it.key,
          dex: it.dex,
          slug: it.slug,
          name: it.name,
          path: it.path,
          url: it.url || `/${it.path || ""}`,
        })),
        vectors,
        getVector: (i) => vectors.subarray(i * json.dim, i * json.dim + json.dim),
      };
      _index = _applyLegendaryFilter(idx);
      return _index;
    }

    // v3 fallback (lift to v4-like)
    if ((json.version === 3 || json.version == null) && Array.isArray(json.items || json.meta)) {
      const items = json.items || json.meta;
      const vectors = json.vectors
        ? new Float32Array(json.vectors) // already decoded
        : decodeBase64F32(json.vectors_b64);
      const dim = json.dim || json.vector_dim || 512;
      const lifted = {
        version: 4,
        dim,
        count: items.length,
        normalized: !!json.normalized,
        items: items.map((m, i) => ({
          idx: i,
          key: m.key,
          dex: m.dex,
          slug: m.slug,
          name: m.name,
          path: m.path || m.sprite,
          url: m.url || `/${m.path || m.sprite || ""}`,
        })),
        vectors,
        getVector: (i) => vectors.subarray(i * dim, i * dim + dim),
      };
      _index = _applyLegendaryFilter(lifted);
      return _index;
    }

    throw new Error(`Unsupported index schema at /sprite_index_clip.json`);
  })();

  return _indexPromise;
}

export function getSpriteIndex() {
  if (!_index) throw new Error("Index not loaded yet");
  return _index;
}
