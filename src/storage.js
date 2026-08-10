/* =====================================================================
   STORAGE
   One adapter, chosen once at load, most capable first:

     window.storage  the chat-artifact host, when running as an artifact
     localStorage    the web build
     memory          anything else — a sandbox with storage disabled, or
                     a private window that refuses to persist

   Every path is guarded. Storage that throws must degrade to forgetting,
   never to a crash in the middle of a drive. Nothing here goes near a
   network: this runs offline in a car.

   For the native build, register the Capacitor Preferences adapter here
   and it wins over the rest.
   ===================================================================== */

const memory = new Map();

const memoryAdapter = {
  name: "memory",
  async get(k) { return memory.has(k) ? memory.get(k) : null; },
  async set(k, v) { memory.set(k, v); },
  async remove(k) { memory.delete(k); },
};

function hostAdapter(api) {
  return {
    name: "host",
    async get(k) { try { const r = await api.get(k, false); return r?.value ?? null; } catch { return null; } },
    async set(k, v) { try { await api.set(k, v, false); } catch { memory.set(k, v); } },
    async remove(k) { try { await api.remove?.(k, false); } catch { memory.delete(k); } },
  };
}

function localAdapter(ls) {
  return {
    name: "localStorage",
    async get(k) { try { return ls.getItem(k); } catch { return null; } },
    async set(k, v) { try { ls.setItem(k, v); } catch { memory.set(k, v); } },
    async remove(k) { try { ls.removeItem(k); } catch { memory.delete(k); } },
  };
}

/* Feature-detect by writing, not by sniffing. Safari in a private window
   exposes localStorage and then throws on the first setItem. */
function usableLocalStorage() {
  try {
    const ls = window.localStorage;
    const probe = "__row_probe__";
    ls.setItem(probe, "1");
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

export const Storage = (() => {
  const g = typeof window !== "undefined" ? window : {};
  if (g.storage?.get) return hostAdapter(g.storage);
  const ls = typeof window !== "undefined" ? usableLocalStorage() : null;
  if (ls) return localAdapter(ls);
  return memoryAdapter;
})();

/* Whether anything written will still be there after a reload. The UI can
   say so rather than quietly losing someone's progress. */
export const isPersistent = Storage.name !== "memory";

export async function readJSON(key, fallback) {
  const raw = await Storage.get(key);
  if (raw == null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    // Corrupt or from an older shape — start over rather than crash.
    return fallback;
  }
}

export async function writeJSON(key, value) {
  await Storage.set(key, JSON.stringify(value));
}
