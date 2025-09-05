function withTimeout(ms) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(id) };
}

export async function getJSON(url, label, { timeoutMs = 15000 } = {}) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store", signal: t.signal });
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch {}
      throw new Error(`HTTP ${res.status} ${res.statusText} while ${label}.\nURL: ${url}\nBody: ${body?.slice(0, 500)}`);
    }
    return await res.json();
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`Timeout while ${label}`);
    throw new Error(`Network/CORS error while ${label}: ${err.message}`);
  } finally { t.cancel(); }
}

export async function getBlob(url, label, { timeoutMs = 20000 } = {}) {
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(url, { mode: "cors", cache: "no-store", signal: t.signal });
    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch {}
      throw new Error(`HTTP ${res.status} ${res.statusText} while ${label}.\nURL: ${url}\nBody: ${body?.slice(0, 500)}`);
    }
    return await res.blob();
  } catch (err) {
    if (err?.name === "AbortError") throw new Error(`Timeout while ${label}`);
    throw new Error(`Network/CORS error while ${label}: ${err.message}`);
  } finally { t.cancel(); }
}
