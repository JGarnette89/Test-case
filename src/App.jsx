import React, { useState, useEffect, useCallback } from "react";
import { Menu, X, Milestone, ChevronRight } from "lucide-react";

/* The driver game and the examiner game screens were removed on 24
   September (cut B, the maintainer's call); they are in git history. The
   exam-mode ENGINE they drove is kept for the exam mode's return
   (SIMULATOR.md 2.2). */
/* A between-stages minigame prototype — not on the home screen or in the
   mode switcher yet, deliberately. Reachable directly at #/merge-rush
   while it is still a standalone thing to look at, not a decision to
   wire into anything. */
import MergeRush from "./apps/MergeRush.jsx";
/* STAGE 0 OF THE REBUILD. One road, six cars, following distance --
   nothing else, deliberately. See REBUILD.md. It is on the home screen
   because the whole deliverable of that stage is somebody looking at
   it. */
import SimRoad from "./apps/SimRoad.jsx";
import IsoRoad from "./apps/IsoRoad.jsx";
import Wheel from "./apps/Wheel.jsx";
import MapRoad from "./apps/MapRoad.jsx";
import ErrorBoundary from "./apps/ErrorBoundary.jsx";
import SimCrossing from "./apps/SimCrossing.jsx";
import SimCandidates from "./apps/SimCandidates.jsx";
import SimCourse from "./apps/SimCourse.jsx";
import { isPersistent } from "./storage.js";

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
   SCREENS

   Every screen the app can show, one entry each, and every entry's hash
   route resolves whether or not the menu lists it. The project is a
   traffic simulator first (SIMULATOR.md). The rebuild's earlier stages
   stay here so they open by address for comparison; the driver game and
   the examiner game screens are gone (cut B, 24 September).

   AND THE MENU SHOWS WHAT IS BEING TESTED LIVE, NOTHING ELSE. The
   maintainer, 24 September: "there are many options in the submenu but
   basically none are needed except whatever is being tested live." So
   an entry is on the menu only if it carries `live: true` -- today the
   map, which is the simulator as it stands, and the performance ramp,
   which he runs on the phone. Every other entry stays in this array so
   its hash still resolves: an earlier stage can be opened by address to
   compare against, and verify-screens renders every route from its own
   list whatever the menu shows, so an unlisted screen does not rot
   unnoticed. A new screen goes live by earning the flag, and the one it
   replaces loses it.
   ===================================================================== */
const MODES = [
  {
    id: "map",
    live: true,
    name: "The map",
    kicker: "Live — the simulator, drive it or watch it",
    blurb:
      "The test map in traffic: signals, stop signs, a five-way, an overpass, multi-lane roads. Drive it yourself or watch; the Cars dial sets how many are on it. The traffic changes lane, keeps right and slows for corners by each driver's ratings.",
    Icon: Milestone,
    accent: C.amber,
    Component: MapRoad,
  },
  {
    id: "wheel",
    name: "Stage 1 — at the wheel",
    kicker: "The simulator — you drive",
    blurb:
      "The two controls: steer by dragging on the left, and one slider on the right from throttle at the top through coasting to the brakes at the bottom. On the stage-0 roads, in the stage-0 traffic, with the car behind you following you the way it follows everybody. The one question: does it feel right to drive? No intersections yet, so nothing to turn into; the road wraps; a contact stops you.",
    Icon: Milestone,
    accent: C.green,
    Component: Wheel,
  },
  {
    id: "iso",
    live: true,
    name: "Performance",
    kicker: "Live — the budget ramp, run on the phone",
    blurb:
      "The performance instrument: a ramp of loads on stage 0's isometric roads, held until the frame budget breaks, and a report to copy. Run it on the device being measured, from the production build.",
    Icon: Milestone,
    accent: C.amber,
    Component: IsoRoad,
  },
  {
    id: "sim",
    name: "Stage 0 — following",
    kicker: "The rebuild — one road, six cars",
    blurb:
      "The first stage of the new foundation. Six cars on one road, each wanting a different speed, deciding what to do every twentieth of a second from what they can see of the car in front. Nothing else: no intersection, no candidate, no marking, no score. The question it exists to answer is whether traffic that queues, closes up and spreads out reads as alive — and that is a question for your eyes, not for a test.",
    Icon: Milestone,
    accent: C.amber,
    Component: SimRoad,
  },
  {
    id: "crossing",
    name: "Stage 1 — taking turns",
    kicker: "The rebuild — an all-way stop",
    blurb:
      "Four legs and nobody directing. Each driver looks at the others twenty times a second, works out whether their paths cross and who stopped first, and waits or goes. Whoever stopped first goes first; arriving together, the car on the right goes; a left turn yields to the oncoming. Nothing else yet — no candidate, no marking, no score. The question is whether traffic that has to negotiate with itself reads as people making decisions.",
    Icon: Milestone,
    accent: C.green,
    Component: SimCrossing,
  },
  {
    id: "candidates",
    name: "Stage 2 — telling them apart",
    kicker: "The rebuild — two drivers, one course",
    blurb:
      "Two candidates, the same seeded traffic, the same legs in the same order. One of them is a different person, and the whole question of this stage is whether you can say which by watching rather than by reading a label. Each is drawn from the same five ratings the traffic around them is drawn from — there is no separate candidate model — so a weak axis shows as behaviour: gaps refused, gaps taken, a line not held, braking left late, a stop sign treated as a suggestion.",
    Icon: Milestone,
    accent: C.blue,
    Component: SimCandidates,
  },
  {
    id: "course",
    name: "Stage 3 — a course, and a route",
    kicker: "The rebuild — a candidate with somewhere to be",
    blurb:
      "Until now every car was created at the far end of an approach and destroyed at the far end of its exit, so the traffic at one intersection had nothing to do with the traffic at the next. Here the car that leaves one is the car that arrives at the other — same speed, same place in the queue, same person — and the candidate is driving a route through a grid of them, a sequence of intersections and what to do at each. Nothing about it is new geometry: the exit of one intersection and the approach of the next are the same piece of road, so placing them a reach apart makes the two paths meet exactly. When the instructions run out they carry straight on.",
    Icon: Milestone,
    accent: C.amber,
    Component: SimCourse,
  },
];

/* What the menus actually offer: what is being tested live. Everything
   else is reachable only by typing its hash. */
const LIVE = MODES.filter((m) => m.live);

/* --- Routing --------------------------------------------------------
   The hash, not state, is the source of truth: a reload keeps you where
   you were and the browser Back button works, with no storage and no
   router dependency.                                                   */
/* Two segments: the screen, and an optional thing to start it on, handed
   to the screen as `scenarioId`. */
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
  const isPrototype = id === "merge-rush";
  const mode = isPrototype ? null : MODES.find((m) => m.id === id) || null;
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

      {!mode && !isPrototype && <ErrorBoundary name="home"><Home /></ErrorBoundary>}
      {isPrototype && <ErrorBoundary name="merge rush"><MergeRush /></ErrorBoundary>}

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
          <ErrorBoundary key={`${mode.id}/${param || ""}`} name={mode.name}>
            <Active {...(mode.props || {})} scenarioId={param} />
          </ErrorBoundary>
        </>
      )}

      {menuOpen && <Sheet current={mode} onClose={closeMenu} />}
    </>
  );
}

/* --- Home -----------------------------------------------------------
   Nothing starts until the player chooses it.                           */
const partOfDay = () => {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
};

function LinkCard({ item, onClick, note }) {
  return (
    <button className="shell-card" style={st.card} onClick={onClick}>
      <div style={{ ...st.cardIcon, color: item.accent }}>
        <item.Icon size={22} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...st.cardKicker, color: item.accent }}>{item.kicker}</div>
        <div style={st.cardName}>{item.name}</div>
        <div style={st.cardBlurb}>{note || item.blurb}</div>
      </div>
      <ChevronRight size={18} style={{ color: C.dim, flexShrink: 0 }} />
    </button>
  );
}

function Home() {
  return (
    <div style={st.launcher}>
      <div style={st.brand}>
        <div style={st.brandTitle}>
          RIGHT OF <span style={{ color: C.yellow }}>WAY</span>
        </div>
        <div style={st.brandSub}>{partOfDay()}. The traffic simulator.</div>
      </div>

      <div style={st.premise}>
        What is being tested now. Earlier stages of the simulator open by
        address for comparison.
      </div>

      <div style={st.cards}>
        {LIVE.map((m) => (
          <LinkCard key={m.id} item={m} onClick={() => go(m.id)} />
        ))}
      </div>

      <div style={st.foot}>
        Runs entirely on this device. Nothing is sent anywhere.
        {!isPersistent && (
          <> <strong style={{ color: C.amber }}>Settings will not survive a reload here</strong> — this
          browser is refusing to store anything.</>
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

        {LIVE.map((a) => {
          const active = current?.id === a.id;
          return (
            <React.Fragment key={a.id}>
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
            </React.Fragment>
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
      /* Stays visually quiet — it throws work away — but the tap area is a
         full 44px, because a control that is hard to hit deliberately is
         also a control that gets hit accidentally. */
      .shell-link {
        display: inline-flex; align-items: center; min-height: 44px;
        background: none; border: none; padding: 0 6px; cursor: pointer;
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
  testMeta: {
    display: "flex", alignItems: "center", gap: 8, marginTop: 4,
    fontSize: 11.5, color: C.dim, flexWrap: "wrap",
  },
  tagRow: { display: "flex", gap: 5, marginTop: 6, flexWrap: "wrap" },
  tag: {
    fontSize: 10.5, color: C.dim, border: `1px solid ${C.hair}`,
    borderRadius: 6, padding: "2px 6px", whiteSpace: "nowrap",
  },
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
  divider: {
    display: "flex", alignItems: "center", gap: 10,
    margin: "14px 2px 6px", opacity: 0.75,
  },
  dividerText: {
    fontFamily: FONT_U, fontSize: 11, letterSpacing: "0.08em",
    textTransform: "uppercase", color: C.dim, whiteSpace: "nowrap",
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
