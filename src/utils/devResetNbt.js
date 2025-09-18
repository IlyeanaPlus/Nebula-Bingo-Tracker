// src/utils/devResetNbt.js
(function resetNbtInDev() {
  const env =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.MODE) ||
    process.env.NODE_ENV;
  if (env !== "development") return;
  try {
    const toDelete = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith("nbt.")) toDelete.push(k);
    }
    toDelete.forEach((k) => localStorage.removeItem(k));
    // Optional: also clear the grid fractions to force re-tune each refresh
    // localStorage.removeItem("nbt.gridFractions");
  } catch {}
})();
