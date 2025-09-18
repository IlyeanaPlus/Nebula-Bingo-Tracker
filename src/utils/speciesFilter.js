// src/utils/speciesFilter.js
// Centralized exclusion set by slug (lowercase, no spaces)

const LEGENDARIES = [
  // Kanto
  "articuno","zapdos","moltres","mewtwo","mew",
  // Johto
  "raikou","entei","suicune","lugia","hooh","celebi",
  // Hoenn
  "regirock","regice","registeel","latias","latios","kyogre","groudon","rayquaza","jirachi","deoxys",
  // Sinnoh
  "uxie","mesprit","azelf","dialga","palkia","heatran","regigigas","giratina","cresselia","darkrai","shaymin","arceus","manaphy","phione",
  // Unova
  "victini","cobalion","terrakion","virizion","tornadus","thundurus","landorus","reshiram","zekrom","kyurem","keldeo","meloetta","genesect",
  // Kalos
  "xerneas","yveltal","zygarde","diancie","hoopa","volcanion",
  // Alola (guardians + cosmics + mythicals)
  "tapukoko","tapulele","tapubulu","tapufini",
  "cosmog","cosmoem","solgaleo","lunala","necrozma","magearna","marshadow","zeraora",
  // Galar
  "zacian","zamazenta","eternatus","kubfu","urshifu","zarude","regieleki","regidrago","glastrier","spectrier","calyrex",
  // Hisui / Paldea special
  "enamorus",
  // Paldea DLC
  "terapagos",        // ⬅️ added
];

// Ultra Beasts
const ULTRA_BEASTS = [
  "nihilego","buzzwole","pheromosa","xurkitree","celesteela","kartana","guzzlord","poipole","naganadel","stakataka","blacephalon",
];

// Scarlet/Violet Paradox
const PARADOX = [
  "greattusk","screamtail","brutebonnet","fluttermane","slitherwing","sandyshocks","roaringmoon",
  "irontreads","ironbundle","ironhands","ironjugulis","ironmoth","ironthorns","ironvaliant","ironleaves",
  "walkingwake","ragingbolt","gougingfire","ironboulder","ironcrown"
];

// Treasures of Ruin quartet (SV)
const RUIN = [
  "wochien","chienpao","tinglu","chiyu"  // ⬅️ added
];

const EXTRAS = [];

const EXCLUDE_SET = new Set([...LEGENDARIES, ...ULTRA_BEASTS, ...PARADOX, ...RUIN, ...EXTRAS]);

export function excludeRef(ref) {
  const slug = (ref?.slug || ref?.name || ref?.key || "").toString().toLowerCase().replace(/\s+/g, "");
  return EXCLUDE_SET.has(slug);
}

export function getExcludeSet() {
  return EXCLUDE_SET;
}
