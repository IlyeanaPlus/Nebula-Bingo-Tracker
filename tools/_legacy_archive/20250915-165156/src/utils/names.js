// utils/names.js
export function isShinyName(stem) {
  if (!stem) return false;
  const s = String(stem).toLowerCase().replace(/[._-]+/g, " ");
  return /\bshiny\b/.test(s);
}

export function tidyName(raw) {
  if (!raw) return "";
  let s = String(raw)
    .replace(/\?.*$/, "")
    .replace(/[#?].*$/, "")
    .replace(/.*\//, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.(png|jpg|jpeg|webp)$/i, "")
    .trim();
  s = s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
  const fixes = {
    "Mr Mime": "Mr. Mime",
    "Mime Jr": "Mime Jr.",
    "Type Null": "Type: Null",
    "Ho Oh": "Ho-Oh",
    "Porygon Z": "Porygon-Z",
    "Jangmo O": "Jangmo-o",
    "Hakamo O": "Hakamo-o",
    "Kommo O": "Kommo-o",
    "Nidoran F": "Nidoran♀",
    "Nidoran M": "Nidoran♂",
  };
  return fixes[s] || s;
}

export function nameFromFilename(fileOrUrl) {
  const stem = typeof fileOrUrl === "string" ? fileOrUrl : fileOrUrl?.name || "";
  let m1 = stem.match(/pokemon[_-](\d+)[_-]([a-z0-9\-]+)/i);
  if (m1) return tidyName(m1[2]);
  let m2 = stem.match(/^(\d{1,4})[_-]([a-z0-9\-]+)\./i);
  if (m2) return tidyName(m2[2]);
  let m3 = stem.match(/^([a-z0-9\-]+).*\./i);
  if (m3) return tidyName(m3[1]);
  return tidyName(stem);
}
