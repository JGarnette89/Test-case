/* =====================================================================
   KEEP THE SCREEN AWAKE while testing (the maintainer, 14 October).

   Two ways, tried in order, and the person told which one is holding:

   1. THE SCREEN WAKE LOCK (`navigator.wakeLock`). The real API -- but only
      in a secure context: on the HTTPS deploy it works, on the LAN's plain
      http://192.168.x.x it is `undefined` (measured 19 Sep, CLAUDE.md
      Conventions). The browser drops the lock whenever the page is
      hidden, so it is taken again each time the page comes back.
   2. A PLAYING VIDEO, for plain HTTP: a muted, inline, looping video of a
      1-pixel canvas stream. Phones keep the screen on while a video
      plays; this is the old NoSleep trick without shipping a video file.
      Less certain than the lock -- browsers decide for themselves what
      counts as playing -- so the label says it is the fallback.

   DOM only, no React; safe to import under SSR (nothing runs at load).
   ===================================================================== */

let lock = null, video = null, timer = null, wanted = false, how = null;

const secureLock = () => typeof navigator !== "undefined" && navigator.wakeLock && typeof navigator.wakeLock.request === "function";

async function takeLock() {
  try {
    lock = await navigator.wakeLock.request("screen");
    lock.addEventListener?.("release", () => { lock = null; });
    return true;
  } catch { lock = null; return false; }
}

/* The page came back: the browser released the lock when it went hidden. */
function onVisible() {
  if (wanted && how === "wake lock" && document.visibilityState === "visible" && !lock) takeLock();
  if (wanted && how === "video" && document.visibilityState === "visible" && video?.paused) video.play().catch(() => {});
}

function startVideo() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 2;
  const ctx = canvas.getContext("2d");
  if (!canvas.captureStream) return false;
  /* The stream only has frames while the canvas changes: one pixel flipped once a second. */
  let on = false;
  const paint = () => { on = !on; ctx.fillStyle = on ? "#000" : "#010101"; ctx.fillRect(0, 0, 2, 2); };
  paint();
  timer = setInterval(paint, 1000);
  video = document.createElement("video");
  video.muted = true; video.loop = true; video.playsInline = true;
  video.setAttribute("muted", ""); video.setAttribute("playsinline", "");
  /* On the page and painted, but not seen: a video the browser thinks nobody can see may not count as playing. */
  Object.assign(video.style, { position: "fixed", left: "0", bottom: "0", width: "1px", height: "1px", opacity: "0.01", pointerEvents: "none", zIndex: "-1" });
  video.srcObject = canvas.captureStream(1);
  document.body.appendChild(video);
  video.play().catch(() => {});
  return true;
}

function stopVideo() {
  if (timer) clearInterval(timer);
  timer = null;
  if (video) { video.pause(); video.srcObject = null; video.remove(); }
  video = null;
}

/* Switch it on or off. Resolves to what is holding the screen, in words. */
export async function keepAwake(on) {
  if (typeof document === "undefined") return { on: false, how: null, note: "" };
  wanted = !!on;
  document.removeEventListener("visibilitychange", onVisible);
  if (!wanted) {
    if (lock) { try { await lock.release(); } catch { /* already gone */ } }
    lock = null; stopVideo(); how = null;
    return { on: false, how: null, note: "the screen sleeps as usual" };
  }
  document.addEventListener("visibilitychange", onVisible);
  if (secureLock() && (await takeLock())) {
    how = "wake lock";
    return { on: true, how, note: "held by the browser's wake lock" };
  }
  if (startVideo()) {
    how = "video";
    return { on: true, how, note: secureLock() ? "the wake lock was refused; holding with a playing video instead" : "no wake lock over plain http -- holding with a playing video (the https deploy uses the real lock)" };
  }
  wanted = false; how = null;
  return { on: false, how: null, note: "this browser offers no way to keep the screen on" };
}
