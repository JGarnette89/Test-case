import React, { useState, useEffect, useCallback } from "react";
import { Menu, X, PenTool, Route, Gauge, ChevronRight } from "lucide-react";

import DriveDraw from "./apps/DriveDraw.jsx";
import RightOfWay from "./apps/RightOfWay.jsx";
import RightOfWayTiming from "./apps/RightOfWayTiming.jsx";

/* Palette and font stacks are copied from the apps rather than imported,
   because the apps keep theirs module-private. Keep them in step by eye. */
const C = {
  bg: "#1A1C20",
  ink: "#191C22",
  panel: "rgba(32,35,40,0.94)",
  white: "#FAFAF2",
  dim: "#8b9199",
  text: "#c8cdd4",
  yellow: "#FFC93C",
  amber: "#F0A93C",
  green: "#3BAA51",
  blue: "#3B7BE8",
  hair: "rgba(255,255,255,0.10)",
};
const FONT_D = "'Rajdhani','Oswald','Arial Narrow',system-ui,sans-serif";
const FONT_U = "'Inter',system-ui,-apple-system,'Segoe UI',Roboto,sans-serif";

/* =====================================================================
   THE REGISTRY
   A fourth app is an entry here, not a change to the shell.

   `chrome` is the one field that is not cosmetic. The two game screens are
   ordinary flow content, so the shell can put a strip above them. DriveDraw
   is a fixed 100vh box with its own toolbars pinned to every edge — take
   height from it and its bottom toolbar goes off-screen — so it gets a
   floating control at top centre, the one band its own UI leaves clear.
   ===================================================================== */
const APPS = [
  {
    id: "drivedraw",
    name: "DriveDraw",
    kicker: "Diagram",
    blurb:
      "Draw an intersection, place vehicles and signs, and number the order of movement. For the tablet in the car and the projector in the classroom.",
    Icon: PenTool,
    accent: C.amber,
    Component: DriveDraw,
    chrome: "float",
  },
  {
    id: "right-of-way",
    name: "Right of Way",
    kicker: "Judgment",
    blurb:
      "Tap the road users in the order they may legally proceed. One intersection a day, graded on the order you gave.",
    Icon: Route,
    accent: C.green,
    Component: RightOfWay,
    chrome: "bar",
  },
  {
    id: "timing",
    name: "Right of Way — Timing",
    kicker: "Real time",
    blurb:
      "Traffic arrives on a schedule and you are one car in it. Press GO at the moment the road is legally yours. Too early is a failure to yield; too late is undue delay.",
    Icon: Gauge,
    accent: C.blue,
    Component: RightOfWayTiming,
    chrome: "bar",
  },
];

/* --- Routing --------------------------------------------------------
   The hash, not state, is the source of truth: a reload keeps you where
   you were and the browser Back button works, with no storage and no
   router dependency.                                                   */
const readHash = () => window.location.hash.replace(/^#\/?/, "");
const go = (id) => {
  window.location.hash = id ? `#/${id}` : "#/";
};

function useRoute() {
  const [id, setId] = useState(readHash);
  useEffect(() => {
    const sync = () => setId(readHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return id;
}

export default function App() {
  const id = useRoute();
  const app = APPS.find((a) => a.id === id) || null;
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEffect(closeMenu, [id, closeMenu]);

  // Bound only while the sheet is open, so the apps' own Escape handling
  // is left alone the rest of the time.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && closeMenu();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  const Active = app?.Component;

  return (
    <>
      <Style />

      {!app && <Launcher />}

      {app && (
        <>
          {app.chrome === "bar" && (
            <div style={st.bar}>
              <button
                className="shell-btn"
                style={st.barBtn}
                onClick={() => setMenuOpen(true)}
                aria-label="Switch app"
              >
                <Menu size={18} />
              </button>
              <div style={st.barName}>{app.name}</div>
            </div>
          )}

          {/* Keyed so switching unmounts the old app outright — that is what
              stops the timing game's animation loop when you leave it. */}
          <Active key={app.id} />

          {app.chrome === "float" && (
            <button
              className="shell-btn shell-float"
              onClick={() => setMenuOpen(true)}
              aria-label="Switch app"
            >
              <Menu size={18} />
            </button>
          )}
        </>
      )}

      {menuOpen && <Sheet current={app} onClose={closeMenu} />}
    </>
  );
}

/* --- Launcher ------------------------------------------------------- */
function Launcher() {
  return (
    <div style={st.launcher}>
      <div style={st.brand}>
        <div style={st.brandTitle}>
          DRIVE<span style={{ color: C.yellow }}>DRAW</span>
        </div>
        <div style={st.brandSub}>Ontario right-of-way teaching tools</div>
      </div>

      <div style={st.cards}>
        {APPS.map((a) => (
          <button
            key={a.id}
            className="shell-card"
            style={st.card}
            onClick={() => go(a.id)}
          >
            <div style={{ ...st.cardIcon, color: a.accent }}>
              <a.Icon size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...st.cardKicker, color: a.accent }}>{a.kicker}</div>
              <div style={st.cardName}>{a.name}</div>
              <div style={st.cardBlurb}>{a.blurb}</div>
            </div>
            <ChevronRight size={18} style={{ color: C.dim, flexShrink: 0 }} />
          </button>
        ))}
      </div>

      <div style={st.foot}>
        Runs entirely on this device. Nothing is sent anywhere.
      </div>
    </div>
  );
}

/* --- Switcher sheet -------------------------------------------------
   z-index sits above the apps' own modals (they top out at 40) so the way
   out is reachable from anywhere, including a dialog.                   */
function Sheet({ current, onClose }) {
  return (
    <div style={st.sheetWrap} onClick={onClose} role="dialog" aria-modal="true">
      <div style={st.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={st.sheetHead}>
          <div style={st.sheetTitle}>Switch app</div>
          <button
            className="shell-btn"
            style={st.barBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {APPS.map((a) => {
          const active = current?.id === a.id;
          return (
            <button
              key={a.id}
              className="shell-card"
              style={{
                ...st.row,
                borderColor: active ? a.accent : "rgba(255,255,255,0.10)",
              }}
              onClick={() => (active ? onClose() : go(a.id))}
            >
              <div style={{ ...st.rowIcon, color: a.accent }}>
                <a.Icon size={19} />
              </div>
              <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                <div style={st.rowName}>{a.name}</div>
                <div style={st.rowKicker}>{a.kicker}</div>
              </div>
              {active && <div style={{ ...st.dot, background: a.accent }} />}
            </button>
          );
        })}

        <button className="shell-card" style={st.row} onClick={() => go(null)}>
          <div style={{ ...st.rowIcon, color: C.dim }}>
            <Menu size={19} />
          </div>
          <div style={{ flex: 1, textAlign: "left" }}>
            <div style={st.rowName}>All apps</div>
            <div style={st.rowKicker}>Back to the launcher</div>
          </div>
        </button>
      </div>
    </div>
  );
}

/* Hover, focus and the resting state of the floating control — the only
   things that cannot be expressed as inline style objects. */
function Style() {
  return (
    <style>{`
      .shell-btn {
        display: flex; align-items: center; justify-content: center;
        min-width: 44px; min-height: 44px;
        border: 1px solid ${C.hair}; border-radius: 10px;
        background: rgba(20,22,26,0.72); color: ${C.white};
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        backdrop-filter: blur(8px);
      }
      .shell-btn:hover { background: rgba(48,52,60,0.92); }
      .shell-btn:focus-visible { outline: 2px solid ${C.yellow}; outline-offset: 2px; }

      /* DriveDraw fills the frame, so this has to go where its own chrome is
         not. It puts the tool palette across the bottom below 780px and down
         the left above it (its breakpoint, DriveDraw.jsx: narrow = w < 780),
         so the clear band flips sides with it. Measured, not guessed: at
         375x812 the left edge is clear, at 1024x768 the bottom centre is.
         z-index sits under every DriveDraw control, so if a layout ever does
         overlap, the app's button wins the tap and this one just hides. */
      .shell-float {
        position: fixed;
        z-index: 9;
        opacity: 0.45;
        transition: opacity 120ms ease;
      }
      .shell-float:hover, .shell-float:focus-visible { opacity: 1; }

      @media (max-width: 779px) {
        .shell-float {
          left: calc(8px + env(safe-area-inset-left, 0px));
          top: 50%;
          transform: translateY(-50%);
        }
      }
      @media (min-width: 780px) {
        .shell-float {
          left: 50%;
          bottom: calc(12px + env(safe-area-inset-bottom, 0px));
          transform: translateX(-50%);
        }
      }

      .shell-card {
        display: flex; align-items: center; gap: 12px; width: 100%;
        text-align: left; cursor: pointer; color: ${C.white};
        font-family: ${FONT_U};
        border: 1px solid ${C.hair}; border-radius: 14px;
        background: rgba(32,35,40,0.7); padding: 14px;
        -webkit-tap-highlight-color: transparent;
        transition: background 120ms ease, transform 120ms ease;
      }
      .shell-card:hover { background: rgba(46,50,58,0.85); }
      .shell-card:active { transform: scale(0.99); }
      .shell-card:focus-visible { outline: 2px solid ${C.yellow}; outline-offset: 2px; }
    `}</style>
  );
}

const SAFE_T = "env(safe-area-inset-top, 0px)";
const SAFE_B = "env(safe-area-inset-bottom, 0px)";
const SAFE_L = "env(safe-area-inset-left, 0px)";
const SAFE_R = "env(safe-area-inset-right, 0px)";

const st = {
  bar: {
    position: "sticky",
    top: 0,
    // Under the apps' modals (40) so a dialog still covers it, over their
    // page content so it is never buried.
    zIndex: 20,
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: `calc(6px + ${SAFE_T}) calc(10px + ${SAFE_R}) 6px calc(10px + ${SAFE_L})`,
    background: "rgba(20,22,26,0.92)",
    borderBottom: `1px solid ${C.hair}`,
    backdropFilter: "blur(10px)",
  },
  barBtn: { flexShrink: 0 },
  barName: {
    fontFamily: FONT_D,
    fontWeight: 700,
    fontSize: 17,
    letterSpacing: 0.8,
    color: C.white,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  launcher: {
    minHeight: "100dvh",
    background: C.bg,
    color: C.white,
    fontFamily: FONT_U,
    padding: `calc(28px + ${SAFE_T}) calc(16px + ${SAFE_R}) calc(28px + ${SAFE_B}) calc(16px + ${SAFE_L})`,
    maxWidth: 560,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 22,
  },
  brand: {},
  brandTitle: {
    fontFamily: FONT_D,
    fontWeight: 700,
    fontSize: 34,
    letterSpacing: 2,
    lineHeight: 1,
  },
  brandSub: { fontSize: 13, color: C.dim, marginTop: 6 },
  cards: { display: "flex", flexDirection: "column", gap: 10 },
  card: { alignItems: "flex-start" },
  cardIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
    borderRadius: 11,
    background: "rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  cardKicker: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  cardName: {
    fontFamily: FONT_D,
    fontWeight: 700,
    fontSize: 21,
    letterSpacing: 0.6,
    marginTop: 2,
  },
  cardBlurb: { fontSize: 12.5, lineHeight: 1.5, color: C.text, marginTop: 5 },
  foot: { fontSize: 11.5, color: "#6f757d", lineHeight: 1.5 },

  sheetWrap: {
    position: "fixed",
    inset: 0,
    zIndex: 9000,
    background: "rgba(0,0,0,0.62)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    backdropFilter: "blur(2px)",
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    background: C.panel,
    border: `1px solid ${C.hair}`,
    borderRadius: 16,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    fontFamily: FONT_U,
    color: C.white,
    boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
    maxHeight: "88dvh",
    overflowY: "auto",
  },
  sheetHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  sheetTitle: {
    fontFamily: FONT_D,
    fontWeight: 700,
    fontSize: 20,
    letterSpacing: 1,
  },
  row: { padding: 11, borderRadius: 12 },
  rowIcon: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "rgba(255,255,255,0.06)",
    flexShrink: 0,
  },
  rowName: { fontSize: 14.5, fontWeight: 600 },
  rowKicker: { fontSize: 11.5, color: C.dim, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
};
