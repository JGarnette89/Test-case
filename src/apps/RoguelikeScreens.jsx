/* =====================================================================
   ROGUELIKE SCREENS
   The four things a run shows that an ordinary situation does not: the
   between-stages roundabout, the trait draft, and the two endings.

   Split out of RightOfWayTiming.jsx, which is the one component every
   mode renders through and was getting long enough that adding a mode
   meant reading all of it first. These four are the natural seam: each
   takes a run and a callback and renders, with no access to the timing
   loop, the press, or anything the engine grades. Moved verbatim — this
   is a relocation, not a rewrite.

   None of them decide anything. Every state transition they can cause
   goes through roguelike.js (chooseBranch, applyDraft, spendConsumable),
   which is where the rules about what a run may do actually live.
   ===================================================================== */
import React from "react";
import { Skull, Check, Sparkles, Zap, Shuffle } from "lucide-react";

import { C, RARITY_C, FONT_D } from "../theme.js";
import { W, H } from "../engine/index.js";
import {
  summary as roguelikeSummary, stageById, bossById, CONSUMABLES, INSIGHT_CACHE,
} from "../engine/roguelike.js";
import { traitById, rarityOf } from "../engine/traits.js";
import { Roundabout } from "./roadArt.jsx";
import { st } from "./timingStyles.js";

/* Shared by both endings and the draft: a full-width card that reads as a
   choice rather than a paragraph. */
const cardButton = {
  width: "100%", textAlign: "left", display: "flex", flexDirection: "column",
  alignItems: "flex-start", justifyContent: "center", gap: 3, padding: "10px 12px",
};
const cardTitle = { fontFamily: FONT_D, fontWeight: 700, fontSize: 14.5, letterSpacing: 0.5 };
const cardBody = { fontSize: 12.5, color: "#a8aeb6", lineHeight: 1.4, fontWeight: 400 };

/* The tier badge. Colour comes from theme.js keyed by the engine's own
   rarity id, so adding a tier is a data entry there and a palette entry
   here — never a new component. */
export function RarityTag({ rarity, style }) {
  const col = RARITY_C[rarity] || RARITY_C.common;
  return (
    <span style={{
      fontFamily: FONT_D, fontWeight: 700, fontSize: 10, letterSpacing: 1.1,
      textTransform: "uppercase", color: col, border: `1px solid ${col}66`,
      background: `${col}1A`, borderRadius: 3, padding: "1px 5px", lineHeight: 1.5,
      whiteSpace: "nowrap", ...style,
    }}>
      {rarityOf(rarity).label}
    </span>
  );
}

function draftedLine(s) {
  if (!s.traits.length) return "Nothing fitted this run.";
  const names = s.traits.map((id) => traitById(id)?.name).join(", ");
  return `You fitted ${s.traits.length} upgrade${s.traits.length === 1 ? "" : "s"}: ${names}.`;
}

/* A roguelike run ended — a critical fault, same as a road test, no
   partial credit for the situations that never happened. */
export function RoguelikeRunSummary({ run }) {
  const s = roguelikeSummary(run);
  return (
    <div style={{ ...st.tells, background: "rgba(224,82,82,0.10)", borderColor: "rgba(224,82,82,0.30)" }}>
      <div style={{ ...st.tellsHead, color: C.red, display: "flex", alignItems: "center", gap: 6 }}>
        <Skull size={14} />Run over — {s.situationsCleared} cleared
      </div>
      <div style={{ fontSize: 13, color: "#c8cdd4", lineHeight: 1.55 }}>
        {draftedLine(s)}{" "}Average {s.average} out of 100, {s.points} points, best {s.best}.
      </div>
    </div>
  );
}

/* The one win state: every stage cleared, every boss cleared, and all
   four Checkride legs clean of a critical fault. */
export function RoguelikeWinSummary({ run }) {
  const s = roguelikeSummary(run);
  return (
    <div style={{ ...st.tells, background: "rgba(59,170,81,0.10)", borderColor: "rgba(59,170,81,0.30)" }}>
      <div style={{ ...st.tellsHead, color: C.green, display: "flex", alignItems: "center", gap: 6 }}>
        <Check size={14} />Passed — the Checkride is clear
      </div>
      <div style={{ fontSize: 13, color: "#c8cdd4", lineHeight: 1.55 }}>
        {draftedLine(s)}{" "}{s.situationsCleared} situations cleared across all {s.stagesCleared} stages
        and the full Checkride. Average {s.average} out of 100, {s.points} points, best {s.best}.
      </div>
    </div>
  );
}

/* The roundabout: a stage's boss is down, and the run stops here to pick
   what comes next. Decorative circle up top — the same Roundabout the
   roundabout scenarios are driven on, which is why it lives in
   roadArt.jsx now — and the actual choice is plain buttons below, same
   pattern as a trait draft: pick one, and that picks the next stage's
   shape as well as its difficulty. The cache is not a stage — id "cache"
   never resolves through stageById — so it gets its own card rather than
   being folded into the stage map below. */
export function RoundaboutBody({ run, onPick, onRerollBranch }) {
  const options = run.pendingBranch?.options ?? [];
  const stageOptions = options.filter((id) => id !== INSIGHT_CACHE.id);
  const hasCache = options.includes(INSIGHT_CACHE.id);
  const rerollCost = CONSUMABLES.find((c) => c.id === "reroll-branch").cost;
  return (
    <>
      <div style={st.brief}>
        {run.clearedStages.length === 0
          ? "Pick where the run starts."
          : `${run.clearedStages.length} of ${run.clearedStages.length + stageOptions.length} stages cleared. Pick what's next.`}
      </div>
      <div style={st.board}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block" }}>
          <rect width={W} height={H} fill={C.grass} />
          <Roundabout island={C.grass} />
        </svg>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
        {stageOptions.map((id) => {
          const stage = stageById(id);
          const boss = bossById(stage.bossId);
          return (
            <button key={id} className="btn" style={{ ...cardButton, minHeight: 64 }} onClick={() => onPick(id)}>
              <span style={cardTitle}>{stage.name}</span>
              <span style={cardBody}>{stage.theme}</span>
              <span style={{ fontSize: 11.5, color: C.amber, fontWeight: 600, letterSpacing: 0.3 }}>
                BOSS: {boss.title}
              </span>
            </button>
          );
        })}
        {hasCache && (
          <button
            className="btn"
            style={{ ...cardButton, minHeight: 64, borderColor: "rgba(255,201,60,0.4)" }}
            onClick={() => onPick(INSIGHT_CACHE.id)}
          >
            <span style={{ ...cardTitle, color: C.yellow, display: "flex", alignItems: "center", gap: 6 }}>
              <Zap size={14} />{INSIGHT_CACHE.name}
            </span>
            <span style={cardBody}>
              +{INSIGHT_CACHE.insightAward} Insight, no boss — then choose again.
            </span>
          </button>
        )}
      </div>
      <button
        className="btn" style={{ width: "100%", marginTop: 10, fontSize: 12.5 }}
        disabled={run.insight < rerollCost}
        onClick={onRerollBranch} title="Redraw what's on offer here"
      >
        <Shuffle size={14} />Reroll the roundabout ({rerollCost})
      </button>
    </>
  );
}

/* Choose 1 of 3, offered every mods.draftEvery clean clears. Replaces the
   normal "Next situation" button while a choice is pending — picking one
   is what advances, not a separate step in front of it. */
export function TraitDraftScreen({ options, onPick }) {
  return (
    <div style={{ ...st.tells, background: "rgba(59,170,81,0.08)", borderColor: "rgba(59,170,81,0.28)" }}>
      <div style={{ ...st.tellsHead, color: C.green, display: "flex", alignItems: "center", gap: 6 }}>
        <Sparkles size={14} />Fit an upgrade
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
        {options.map((t) => (
          <button
            key={t.id}
            className="btn"
            style={{
              ...cardButton, minHeight: 56,
              // The tier reads at a glance from the edge, so a legendary is
              // recognisable before the name has been read.
              borderLeft: `3px solid ${RARITY_C[t.rarity] || RARITY_C.common}`,
            }}
            onClick={() => onPick(t.id)}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
              <span style={cardTitle}>{t.name}</span>
              <RarityTag rarity={t.rarity} />
            </span>
            <span style={cardBody}>{t.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
