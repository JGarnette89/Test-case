import React, { useState, useEffect, useCallback } from "react";
import {
  Menu, X, Route, Gauge, Milestone, ChevronRight, Lock, Check,
  CalendarDays, Shuffle,
} from "lucide-react";

/* DriveDraw is no longer part of this app. Its source is still in
   src/apps/DriveDraw.jsx and still in git history — it is simply not wired
   in. This project is the game now. */
import RightOfWay from "./apps/RightOfWay.jsx";
import RightOfWayTiming from "./apps/RightOfWayTiming.jsx";
import { ROUTES } from "./engine/routes.js";
import { SCENARIOS } from "./engine/scenarios.js";
import { useProgress, isPassed, passedCount, bestScore, reset, isPersistent } from "./progress.js";

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
  {
    id: "daily",
    name: "Today's intersection",
    kicker: "Daily",
    blurb:
      "One generated situation a day, the same one for everyone. The date is the seed, so nothing has to be fetched or coordinated.",
    Icon: CalendarDays,
    accent: C.yellow,
    Component: RightOfWayTiming,
    props: { source: "daily" },
  },
  {
    id: "endless",
    name: "Endless",
    kicker: "Generated",
    blurb:
      "Fresh situations, drawn and checked by the engine. Any draw whose window is trivial, impossible or unsafe is thrown away before you see it.",
    Icon: Shuffle,
    accent: C.green,
    Component: RightOfWayTiming,
    props: { source: "endless" },
  },

  /* Routes are the same renderer with a drive plan handed to it, so adding
     one is an entry in engine/routes.js and nothing here. */
  ...ROUTES.map((r) => ({
    id: `drive-${r.id}`,
    name: r.title,
    kicker: "Drive",
    blurb: r.blurb,
    Icon: Milestone,
    accent: C.yellow,
    Component: RightOfWayTiming,
    props: { routeId: r.id },
  })),
];

/* --- Routing --------------------------------------------------------
   The hash, not state, is the source of truth: a reload keeps you where
   you were and the browser Back button works, with no storage and no
   router dependency.                                                   */
/* Two segments: the mode, and an optional thing to start it on —
   #/timing/liar opens the timing mode already sitting at that situation,
   which is how you get at one scenario directly. */
const readHash = () => {
  const [id = "", param = ""] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { id, param: param || null };
};
const go = (id, param) => {
  window.location.hash = id ? `#/${id}${param ? `/${param}` : ""}` : "#/";
};

function useRoute() {
  const [route, setRoute] = useState(readHash);
  useEffect(() => {
    const sync = () => setRoute(readHash());
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);
  return route;
}

export default function App() {
  const { id, param } = useRoute();
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

      {!mode && <Home />}

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

          {/* Keyed on the parameter too, so picking a different situation from
              home restarts the mode rather than leaving the old one running. */}
          <Active key={`${mode.id}/${param || ""}`} {...(mode.props || {})} scenarioId={param} />
        </>
      )}

      {menuOpen && <Sheet current={mode} onClose={closeMenu} />}
    </>
  );
}

/* --- Home -----------------------------------------------------------
   Nothing starts until the player chooses it. Landing straight in the
   middle of a timed situation gives them no chance to read it, which is
   the one thing this game is about.                                     */
const partOfDay = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

function Section({ title, note, children }) {
  return (
    <div style={st.section}>
      <div style={st.sectionHead}>{title}</div>
      {note && <div style={st.sectionNote}>{note}</div>}
      <div style={st.cards}>{children}</div>
    </div>
  );
}

function ModeCard({ mode }) {
  return (
    <button className="shell-card" style={st.card} onClick={() => go(mode.id)}>
      <div style={{ ...st.cardIcon, color: mode.accent }}>
        <mode.Icon size={22} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...st.cardKicker, color: mode.accent }}>{mode.kicker}</div>
        <div style={st.cardName}>{mode.name}</div>
        <div style={st.cardBlurb}>{mode.blurb}</div>
      </div>
      <ChevronRight size={18} style={{ color: C.dim, flexShrink: 0 }} />
    </button>
  );
}

function Home() {
  const progress = useProgress();
  const byKicker = (...ks) => MODES.filter((m) => ks.includes(m.kicker));
  const daily = byKicker("Daily");
  const drives = byKicker("Drive");
  const generated = byKicker("Generated");
  const singles = byKicker("Real time", "Judgment");

  const cleared = SCENARIOS.filter((s) => isPassed(progress, s.id));
  const locked = SCENARIOS.length - cleared.length;
  const done = passedCount(progress);

  return (
    <div style={st.launcher}>
      <div style={st.brand}>
        <div style={st.brandTitle}>
          RIGHT OF <span style={{ color: C.yellow }}>WAY</span>
        </div>
        <div style={st.brandSub}>{partOfDay()}. Ontario road rules, under a clock.</div>
      </div>

      <div style={st.premise}>
        You are one car at an intersection, and the traffic does not wait for you to
        be sure. Press <strong style={{ color: C.green }}>GO</strong> the moment the
        road is legally yours — the sooner you read it, the better you score.
        Going early is a failure to yield. Going late is undue delay, and it is the
        more common fault.
      </div>

      <Section title="Today" note="A new one every day, the same for everyone.">
        {daily.map((m) => <ModeCard key={m.id} mode={m} />)}
      </Section>

      <Section title="Keep going" note="Generated situations, as many as you want.">
        {generated.map((m) => <ModeCard key={m.id} mode={m} />)}
      </Section>

      <Section title="Take a drive" note="Several intersections in one go. A collision ends the drive.">
        {drives.map((m) => <ModeCard key={m.id} mode={m} />)}
      </Section>

      <Section
        title="Tutorial"
        note={`The set situations, worked through in order — ${done} of ${SCENARIOS.length} cleared.`}
      >
        {singles.map((m) => <ModeCard key={m.id} mode={m} />)}
      </Section>

      <Section
        title="Replay a situation"
        note={
          cleared.length === 0
            ? "Nothing yet. Clear a situation in the tutorial and it appears here to replay."
            : "Situations you have driven cleanly. Go back for a better time."
        }
      >
        {cleared.map((s) => (
          <button
            key={s.id}
            className="shell-card"
            style={st.thinRow}
            onClick={() => go("timing", s.id)}
          >
            <Check size={15} style={{ color: C.green, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={st.thinName}>{s.title}</div>
              <div style={st.thinBrief}>{s.brief}</div>
            </div>
            <code style={st.thinId}>best {bestScore(progress, s.id)}</code>
            <ChevronRight size={16} style={{ color: C.dim, flexShrink: 0 }} />
          </button>
        ))}

        {/* Locked situations are counted, never named. Half of these turn on
            not knowing what is coming — listing the titles would hand the
            answer over before the player ever meets them. */}
        {locked > 0 && (
          <div style={st.lockedRow}>
            <Lock size={15} style={{ color: C.dim, flexShrink: 0 }} />
            <span>
              {locked} more {locked === 1 ? "situation" : "situations"} to find. They unlock as you clear them.
            </span>
          </div>
        )}
      </Section>

      <div style={st.foot}>
        Runs entirely on this device. Nothing is sent anywhere.
        {!isPersistent && (
          <> <strong style={{ color: C.amber }}>Progress will not survive a reload here</strong> — this
          browser is refusing to store anything.</>
        )}
        {done > 0 && (
          <>
            {" "}
            <button className="shell-link" onClick={() => reset()}>Reset progress</button>
          </>
        )}
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
      .shell-link {
        background: none; border: none; padding: 0; cursor: pointer;
        color: ${C.dim}; font-family: ${FONT_U}; font-size: inherit;
        text-decoration: underline; text-underline-offset: 2px;
      }
      .shell-link:hover { color: ${C.white}; }

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
  premise: {
    fontSize: 13.5, lineHeight: 1.6, color: C.text,
    borderLeft: `3px solid ${C.yellow}`, paddingLeft: 12,
  },
  section: { display: "flex", flexDirection: "column", gap: 8 },
  sectionHead: {
    fontFamily: FONT_D, fontSize: 15, fontWeight: 700, letterSpacing: 1.4,
    textTransform: "uppercase", color: C.white,
  },
  sectionNote: { fontSize: 12, color: C.dim, lineHeight: 1.45, marginTop: -4, marginBottom: 2 },
  thinRow: { padding: "11px 13px", borderRadius: 11, gap: 10 },
  lockedRow: {
    display: "flex", alignItems: "center", gap: 10, padding: "12px 13px",
    borderRadius: 11, border: `1px dashed ${C.hair}`, background: "rgba(255,255,255,0.02)",
    fontSize: 12.5, color: C.dim, lineHeight: 1.45,
  },
  thinName: { fontSize: 14, fontWeight: 600 },
  thinBrief: {
    fontSize: 12, color: C.dim, marginTop: 2, lineHeight: 1.4,
    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
  },
  thinId: {
    fontSize: 11, color: C.dim, background: "rgba(255,255,255,0.06)",
    padding: "3px 6px", borderRadius: 6, flexShrink: 0,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  },
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
