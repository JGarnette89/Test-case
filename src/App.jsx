import React, { useState, useEffect, useCallback } from "react";
import { Menu, X, Route, Gauge, ChevronRight } from "lucide-react";

/* DriveDraw is no longer part of this app. Its source is still in
   src/apps/DriveDraw.jsx and still in git history — it is simply not wired
   in. This project is the game now. */
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
   GAME MODES
   One game, two ways to be asked the same question. A third mode is an
   entry here, not a change to the shell.
   ===================================================================== */
const MODES = [
  {
    id: "timing",
    name: "Timing",
    kicker: "Real time",
    blurb:
      "Traffic arrives on a schedule and you are one car in it. Press GO at the moment the road is legally yours. Too early is a failure to yield; too late is undue delay.",
    Icon: Gauge,
    accent: C.blue,
    Component: RightOfWayTiming,
  },
  {
    id: "order",
    name: "Order",
    kicker: "Judgment",
    blurb:
      "No clock. Tap the road users in the order they may legally proceed, and find out which rule you missed.",
    Icon: Route,
    accent: C.green,
    Component: RightOfWay,
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
  const mode = MODES.find((m) => m.id === id) || null;
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useEffect(closeMenu, [id, closeMenu]);

  // Bound only while the sheet is open, so the modes' own Escape handling
  // is left alone the rest of the time.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e) => e.key === "Escape" && closeMenu();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen, closeMenu]);

  const Active = mode?.Component;

  return (
    <>
      <Style />

      {!mode && <Launcher />}

      {mode && (
        <>
          <div style={st.bar}>
            <button
              className="shell-btn"
              style={st.barBtn}
              onClick={() => setMenuOpen(true)}
              aria-label="Switch mode"
            >
              <Menu size={18} />
            </button>
            <div style={st.barName}>{mode.name}</div>
          </div>

          {/* Keyed so switching unmounts the old mode outright — that is what
              stops the timing game's animation loop when you leave it. */}
          <Active key={mode.id} />
        </>
      )}

      {menuOpen && <Sheet current={mode} onClose={closeMenu} />}
    </>
  );
}

/* --- Launcher ------------------------------------------------------- */
function Launcher() {
  return (
    <div style={st.launcher}>
      <div style={st.brand}>
        <div style={st.brandTitle}>
          RIGHT OF <span style={{ color: C.yellow }}>WAY</span>
        </div>
        <div style={st.brandSub}>Ontario road rules, under a clock</div>
      </div>

      <div style={st.cards}>
        {MODES.map((a) => (
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
   z-index sits above the modes' own modals (they top out at 40) so the way
   out is reachable from anywhere, including a dialog.                   */
function Sheet({ current, onClose }) {
  return (
    <div style={st.sheetWrap} onClick={onClose} role="dialog" aria-modal="true">
      <div style={st.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={st.sheetHead}>
          <div style={st.sheetTitle}>Switch mode</div>
          <button
            className="shell-btn"
            style={st.barBtn}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {MODES.map((a) => {
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
            <div style={st.rowName}>Home</div>
            <div style={st.rowKicker}>Back to the mode list</div>
          </div>
        </button>
      </div>
    </div>
  );
}

/* Hover and focus states — the only things that cannot be expressed as
   inline style objects. */
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
