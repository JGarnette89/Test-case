import React, { useState, useEffect, useCallback } from "react";
import {
  Menu, X, Gauge, Milestone, ChevronRight, Lock, Check, ClipboardList,
  CalendarDays, Shuffle, BookOpen, FlaskConical, Dices, Eye } from "lucide-react";

/* DriveDraw is no longer part of this app. Its source is still in
   src/apps/DriveDraw.jsx and still in git history — it is simply not wired
   in. This project is the game now. */
import RightOfWayTiming from "./apps/RightOfWayTiming.jsx";
import ExaminerLab from "./apps/ExaminerLab.jsx";
import ExaminerDrive from "./apps/ExaminerDrive.jsx";
/* A between-stages minigame prototype — not on the home screen or in the
   mode switcher yet, deliberately. Reachable directly at #/merge-rush
   while it is still a standalone thing to look at, not a decision to
   wire into the roguelike run. */
import MergeRush from "./apps/MergeRush.jsx";
/* STAGE 0 OF THE REBUILD. One road, six cars, following distance --
   nothing else, deliberately. See REBUILD.md. It is on the home screen
   because the whole deliverable of that stage is somebody looking at
   it. */
import SimRoad from "./apps/SimRoad.jsx";
import IsoRoad from "./apps/IsoRoad.jsx";
import Wheel from "./apps/Wheel.jsx";
import ErrorBoundary from "./apps/ErrorBoundary.jsx";
import SimCrossing from "./apps/SimCrossing.jsx";
import SimCandidates from "./apps/SimCandidates.jsx";
import SimCourse from "./apps/SimCourse.jsx";
import { ROUTES } from "./engine/routes.js";
import { SCENARIOS } from "./engine/scenarios.js";
import {
  useProgress, isPassed, passedCount, bestScore, reset, isPersistent,
  dailyResult, dailyStreak,
} from "./progress.js";
import { dayIndex } from "./engine/generate.js";
import { simulate, safeAtFor } from "./engine/index.js";
import { sequenceFor } from "./engine/actions.js";

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

   THE EXAMINER GAME IS THE ONLY ONE. Maintainer's ruling: "from now on
   the examiner game is the only priority, other game modes don't need to
   be accessible at all."

   So the driver-game entries below carry `legacy: true` and are NOT
   LISTED anywhere - not on the home screen, not in the switcher. They
   stay in this array because their hash routes still resolve, which is
   the same arrangement MergeRush already lives under: kept, reachable if
   you type it, presented nowhere. The modules behind them stay too, and
   not out of sentiment - `RightOfWayTiming` holds the only renderer in
   the project, and the examiner screens import `Road` and `Environment`
   straight out of it.

   Not accessible is not the same as deletable. Nothing here is removed
   without proving it unused first.
   ===================================================================== */
const MODES = [
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
    name: "Stage 0 — isometric",
    kicker: "The simulator — a curve, a hill, an overpass",
    blurb:
      "The traffic that already works, drawn isometrically on a road that bends and climbs, with a second road crossing over it on a bridge. Nothing else: no intersection, no player, no map, no sprites — the cars are code-drawn boxes at 32 headings. It exists to answer two questions by eye: does an isometric world with free-drawn curves and real height look right, and does the draw order survive an overpass. If either answer is no, everything after it changes.",
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
  {
    id: "drive",
    name: "The drive",
    kicker: "You are the examiner — the game",
    blurb:
      "A course of six intersections and one candidate driving it. Watch them, give the directions in time to be followed, and mark what you saw — on a sheet at the end of each section rather than the instant you see it, so the job is memory as well as attention. Directions given early buy back your attention and cost the candidate their concentration; that trade is the game. No intervention yet.",
    Icon: ClipboardList,
    accent: C.green,
    Component: ExaminerDrive,
  },
  {
    id: "examiner",
    name: "Examiner lab",
    kicker: "You are the examiner — the live direction",
    blurb:
      "The game this project is now. A candidate drives themselves, drawn with five skill ratings and weak on one or two of them; they register the traffic they happen to notice, decide when to go on that, and the world yields when they take a gap that was not theirs. The chase camera rides with them, occlusion decides what could have been seen, and every fault is derived rather than scripted. A bench rather than a finished game: it scores your marking, but there is no course, no directions to give and no debrief.",
    Icon: Eye,
    accent: C.blue,
    Component: ExaminerLab,
  },

  {
    id: "timing",
    legacy: true,
    name: "Timing",
    kicker: "Real time",
    blurb:
      "Traffic arrives on a schedule and you are one car in it. Press GO at the moment the road is legally yours. Too early is a failure to yield; too late is undue delay.",
    Icon: Gauge,
    accent: C.blue,
    Component: RightOfWayTiming,
  },
  {
    id: "daily",
    legacy: true,
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
    legacy: true,
    name: "Endless",
    kicker: "Generated",
    blurb:
      "Fresh situations, drawn and checked by the engine. Any draw whose window is trivial, impossible or unsafe is thrown away before you see it.",
    Icon: Shuffle,
    accent: C.green,
    Component: RightOfWayTiming,
    props: { source: "endless" },
  },
  {
    id: "roguelike",
    legacy: true,
    name: "Roguelike",
    kicker: "A driving test, roguelike",
    blurb:
      "Named stages, each capped by a hand-authored boss, building to a four-intersection Checkride. Fit an upgrade to your car every few clean clears, pick your own order at the roundabout between stages, and one critical fault anywhere ends the run.",
    Icon: Dices,
    accent: C.amber,
    Component: RightOfWayTiming,
    props: { source: "roguelike" },
  },

  /* Routes are the same renderer with a drive plan handed to it, so adding
     one is an entry in engine/routes.js and nothing here. */
  ...ROUTES.map((r) => ({
    id: `drive-${r.id}`,
    legacy: true,
    name: r.title,
    kicker: "Drive",
    blurb: r.blurb,
    Icon: Milestone,
    accent: C.yellow,
    Component: RightOfWayTiming,
    props: { routeId: r.id },
  })),
];

/* What the menus actually offer. Everything else is reachable only by
   typing its hash. */
const LIVE = MODES.filter((m) => !m.legacy);

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
  const isTest = id === "test";
  const isPrototype = id === "merge-rush";
  const submenu = isTest || isPrototype ? null : SUBMENUS.find((s) => s.id === id) || null;
  const mode = isTest || isPrototype || submenu ? null : MODES.find((m) => m.id === id) || null;
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

      {!mode && !submenu && !isTest && !isPrototype && <ErrorBoundary name="home"><Home /></ErrorBoundary>}
      {isTest && <ErrorBoundary name="test menu"><TestMenu /></ErrorBoundary>}
      {isPrototype && <ErrorBoundary name="merge rush"><MergeRush /></ErrorBoundary>}
      {submenu && <ErrorBoundary name="submenu"><SubMenu id={submenu.id} /></ErrorBoundary>}

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

/* Two things the player does most get a direct card. Everything else is a
   folder — a home screen that lists every route and every mode is a menu
   you have to read rather than one you can use. */
const SUBMENUS = [
  {
    id: "drives",
    name: "Take a drive",
    kicker: "Routes",
    accent: C.amber,
    Icon: Milestone,
    blurb: "Several intersections in one go. A collision ends the drive.",
  },
  {
    id: "tutorial",
    name: "Tutorial",
    kicker: "Learn",
    accent: C.green,
    Icon: BookOpen,
    blurb: "The set situations, one at a time, with the rule explained afterwards.",
  },
];

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
  const progress = useProgress();
  const done = passedCount(progress);   // the footer's Reset progress offer
  return (
    <div style={st.launcher}>
      <div style={st.brand}>
        <div style={st.brandTitle}>
          RIGHT OF <span style={{ color: C.yellow }}>WAY</span>
        </div>
        <div style={st.brandSub}>{partOfDay()}. You are the examiner.</div>
      </div>

      <div style={st.premise}>
        You sit in the passenger seat while a candidate drives a set course. You
        give the directions, in time for them to be{" "}
        <strong style={{ color: C.green }}>followed</strong>, and you mark what
        they got wrong — on a sheet at the end of each section, not the instant
        you see it. Nothing hidden can be marked, and you pay for the faults you
        invent as well as the ones you miss.
      </div>

      <div style={st.cards}>
        {LIVE.map((m) => (
          <LinkCard key={m.id} item={m} onClick={() => go(m.id)} />
        ))}
      </div>

      {/* Dev server only, so it cannot reach a tester's phone by accident.
          The #/test route still works in a build if you type it. */}
      {import.meta.env.DEV && (
        <button className="shell-card" style={{ ...st.thinRow, borderStyle: "dashed" }} onClick={() => go("test")}>
          <FlaskConical size={16} style={{ color: C.dim, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
            <div style={st.thinName}>Test menu</div>
            <div style={st.thinBrief}>Every situation, ungated. Not in a production build.</div>
          </div>
          <ChevronRight size={16} style={{ color: C.dim, flexShrink: 0 }} />
        </button>
      )}

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

/* --- Test menu ------------------------------------------------------
   Every situation, ungated, with the facts you need to tell whether a
   feature is working. Not the replay list: that one is the player's and
   is deliberately locked and deliberately unnamed. This one is a tool.

   Linked from home only while running the dev server, so it cannot leak
   into a build a tester holds — but the route works anywhere, so it can
   still be reached on purpose by typing it.                             */
function featuresOf(scn) {
  const tags = [];
  if (scn.layout === "roundabout") tags.push("roundabout");
  if (scn.control === "signal") tags.push("signals");
  if (scn.actors.some((a) => a.kind === "ped")) tags.push("pedestrian");
  if (scn.sightBlockers?.length) tags.push("blind corner");
  const seq = sequenceFor(scn.manoeuvre ?? "straight");
  if (seq.length > 1) tags.push(seq.join("+"));
  const traits = [...new Set(scn.actors.flatMap((a) => a.traits || []))];
  return { tags, traits };
}

function TestMenu() {
  const rows = React.useMemo(
    () =>
      SCENARIOS.map((s) => {
        let legalAt = null, safeAt = null, think = null;
        try {
          const sim = simulate(s);
          legalAt = sim.legalAt;
          safeAt = safeAtFor(sim);
          think = Math.round((safeAt - s.ego.arriveAt) * 100) / 100;
        } catch {
          /* A scenario that will not simulate is exactly what this menu is
             for finding, so it is listed rather than swallowed. */
        }
        return { s, legalAt, safeAt, think, ...featuresOf(s) };
      }),
    []
  );

  return (
    <div style={st.launcher}>
      <button className="shell-link" style={{ alignSelf: "flex-start" }} onClick={() => go(null)}>
        ← Home
      </button>

      <div style={st.brand}>
        <div style={{ ...st.brandTitle, fontSize: 28 }}>TEST MENU</div>
        <div style={st.brandSub}>
          Every situation, ungated. Shows the derived window so you can tell at a glance
          whether a change moved something.
        </div>
      </div>

      <Section title={`Situations (${SCENARIOS.length})`} note="Window and wait are derived live, not stored.">
        {rows.map(({ s, legalAt, safeAt, think, tags, traits }) => (
          <button key={s.id} className="shell-card" style={st.thinRow} onClick={() => go("timing", s.id)}>
            <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
              <div style={st.thinName}>{s.title}</div>
              <div style={st.testMeta}>
                <code style={st.thinId}>{s.id}</code>
                {safeAt == null
                  ? <span style={{ color: C.red }}>will not simulate</span>
                  : <span>
                      window {safeAt}s · waits {think}s
                      {safeAt > legalAt + 0.01 && <span style={{ color: C.amber }}> (legal at {legalAt}s)</span>}
                    </span>}
              </div>
              {(tags.length > 0 || traits.length > 0) && (
                <div style={st.tagRow}>
                  {tags.map((t) => <span key={t} style={st.tag}>{t}</span>)}
                  {traits.map((t) => <span key={t} style={{ ...st.tag, color: C.amber, borderColor: "rgba(240,169,60,0.4)" }}>{t}</span>)}
                </div>
              )}
            </div>
            <ChevronRight size={16} style={{ color: C.dim, flexShrink: 0 }} />
          </button>
        ))}
      </Section>

      <Section title="Generated" note="Fresh each time — for checking the generator rather than a fixed case.">
        <LinkCard item={MODES.find((m) => m.id === "daily")} onClick={() => go("daily")} />
        <LinkCard item={MODES.find((m) => m.id === "endless")} onClick={() => go("endless")} />
      </Section>

      <Section title="Routes" note="Continuity, rotation and the run loop across several intersections.">
        {MODES.filter((m) => m.kicker === "Drive").map((m) => <ModeCard key={m.id} mode={m} />)}
      </Section>
    </div>
  );
}

/* --- Submenus -------------------------------------------------------
   A folder from the home screen. Same shell, one level down, with a way
   back that is always in the same place.                                */
function SubMenu({ id }) {
  const progress = useProgress();
  const meta = SUBMENUS.find((s) => s.id === id);
  const drives = MODES.filter((m) => m.kicker === "Drive");
  const singles = MODES.filter((m) => m.kicker === "Real time");

  const cleared = SCENARIOS.filter((s) => isPassed(progress, s.id));
  const locked = SCENARIOS.length - cleared.length;

  return (
    <div style={st.launcher}>
      <button className="shell-link" style={{ alignSelf: "flex-start" }} onClick={() => go(null)}>
        ← Home
      </button>

      <div style={st.brand}>
        <div style={{ ...st.brandTitle, fontSize: 28 }}>{meta.name.toUpperCase()}</div>
        <div style={st.brandSub}>{meta.blurb}</div>
      </div>

      {id === "drives" && (
        <div style={st.cards}>
          {drives.map((m) => <ModeCard key={m.id} mode={m} />)}
        </div>
      )}

      {id === "tutorial" && (
        <>
          <Section title="Work through them" note="Start here if you have not played before.">
            {singles.map((m) => <ModeCard key={m.id} mode={m} />)}
          </Section>

          <Section
            title="Replay a situation"
            note={
              cleared.length === 0
                ? "Nothing yet. Clear a situation and it appears here to replay."
                : "Situations you have driven cleanly. Go back for a better time."
            }
          >
            {cleared.map((s) => (
              <button key={s.id} className="shell-card" style={st.thinRow}
                onClick={() => go("timing", s.id)}>
                <Check size={15} style={{ color: C.green, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                  <div style={st.thinName}>{s.title}</div>
                  <div style={st.thinBrief}>{s.brief}</div>
                </div>
                <code style={st.thinId}>best {bestScore(progress, s.id)}</code>
                <ChevronRight size={16} style={{ color: C.dim, flexShrink: 0 }} />
              </button>
            ))}

            {/* Locked situations are counted, never named. Half of these turn
                on not knowing what is coming — listing the titles would hand
                the answer over before the player ever meets them. */}
            {locked > 0 && (
              <div style={st.lockedRow}>
                <Lock size={15} style={{ color: C.dim, flexShrink: 0 }} />
                <span>
                  {locked} more {locked === 1 ? "situation" : "situations"} to find. They unlock as you clear them.
                </span>
              </div>
            )}
          </Section>
        </>
      )}
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
