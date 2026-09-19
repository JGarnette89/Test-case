/* =====================================================================
   COPY TO THE CLIPBOARD, ON A PHONE, OVER PLAIN HTTP.

   Anything the maintainer opens from his phone is served over the LAN
   at http://192.168.x.x -- not HTTPS, not localhost -- and that is not
   a secure context, so `navigator.clipboard` does not exist there
   (measured: `typeof navigator.clipboard` is "undefined" on
   http://192.168.2.17:4173). A button that called it with `?.` did
   nothing, silently, and he copied a report by hand. The same class
   takes `navigator.userAgentData`, `deviceMemory`, `crypto.subtle`,
   `crypto.randomUUID`, `navigator.storage`, `share`, `wakeLock`,
   service workers and the Cache API with it; `localStorage`,
   `PerformanceObserver` and `WeakRef` survive.

   So: the modern API where it exists, the old `execCommand("copy")`
   through a hidden textarea where it does not or when it rejects, and
   when both fail the text is SELECTED in the node the caller names so
   the person's next action is just "copy". The result says which
   happened, so the button can say so too -- a button that silently
   does nothing is worse than no button. Must be called from a user
   gesture: both APIs require one.
   ===================================================================== */
export async function copyText(text, { selectIn = null } = {}) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(text); return "clipboard"; } catch { /* fall through to the old way */ }
  }
  if (typeof document !== "undefined" && typeof document.execCommand === "function") {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    /* Off screen, but not display:none -- a hidden element cannot be
       selected, and selection is what execCommand copies. */
    ta.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;";
    document.body.appendChild(ta);
    let ok = false;
    try {
      ta.focus({ preventScroll: true });
      ta.select();
      ta.setSelectionRange(0, text.length);   // iOS ignores select() on a readonly textarea without this
      ok = document.execCommand("copy");
    } catch { ok = false; }
    document.body.removeChild(ta);
    if (ok) return "execCommand";
  }
  if (selectIn) selectAll(selectIn);
  return false;
}

/* Select a node's whole text, so a long-press menu offers Copy at once. */
export function selectAll(node) {
  try {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    sel.removeAllRanges();
    sel.addRange(range);
    return true;
  } catch { return false; }
}
