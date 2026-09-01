/* =====================================================================
   TIMING UI STYLES
   The style objects the timing renderer and its screens share. Pulled out
   of RightOfWayTiming.jsx so a screen can live in its own file without
   either duplicating these or importing back from the component that
   renders it. Plain data — no React, no JSX, so importing it costs
   nothing and cannot create a cycle.

   Still inline style objects and still module-scoped, exactly as the
   conventions in CLAUDE.md ask: this is a move, not a new approach.
   ===================================================================== */
import { C, FONT_D, FONT_U } from "../theme.js";

export const st = {
  app: {
    position: "relative", width: "100%", minHeight: "100dvh", background: C.bg, color: C.white,
    fontFamily: FONT_U, display: "flex", flexDirection: "column", gap: 10,
    padding: `calc(12px + env(safe-area-inset-top,0px)) 12px calc(12px + env(safe-area-inset-bottom,0px))`,
    maxWidth: 540, margin: "0 auto", userSelect: "none",
  },
  head: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  title: { fontFamily: FONT_D, fontWeight: 700, fontSize: 26, letterSpacing: 1.5, lineHeight: 1 },
  sub: { fontSize: 12.5, color: "#8b9199", marginTop: 3 },
  chip: {
    display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.07)",
    padding: "9px 11px", borderRadius: 9, fontSize: 13, fontWeight: 600, color: "#c8cdd4",
  },
  brief: { fontSize: 13.5, color: "#c8cdd4", lineHeight: 1.5 },
  board: {
    borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
  },
  hint: { fontSize: 13, color: "#a8aeb6", lineHeight: 1.5 },
  result: { background: "rgba(32,35,40,0.94)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 14, padding: 15 },
  readout: { fontSize: 13, color: "#c8cdd4", lineHeight: 1.55, marginTop: 12 },
  bandNote: { fontSize: 12.5, color: "#8b9199", marginTop: 4, lineHeight: 1.45 },
  actionRow: { display: "flex", gap: 8, alignItems: "stretch" },
  creepCount: { marginLeft: 6, opacity: 0.75, fontVariantNumeric: "tabular-nums" },
  markRow: {
    display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
    borderTop: "1px solid rgba(255,255,255,0.07)", fontSize: 13,
  },
  markScore: {
    marginLeft: "auto", fontFamily: FONT_D, fontWeight: 700, fontSize: 16,
    fontVariantNumeric: "tabular-nums",
  },
  scoreBox: {
    flexShrink: 0, minWidth: 74, textAlign: "center", padding: "6px 8px 7px",
    borderRadius: 11, border: "1px solid", background: "rgba(0,0,0,0.22)",
  },
  scoreNum: { fontFamily: FONT_D, fontSize: 30, fontWeight: 700, lineHeight: 1 },
  scoreLabel: {
    fontSize: 10, letterSpacing: 0.8, textTransform: "uppercase",
    color: "#8b9199", marginTop: 3, fontWeight: 600,
  },
  lesson: { fontSize: 13.5, color: "#e2e6ea", lineHeight: 1.6, marginTop: 10, borderLeft: `3px solid ${C.yellow}`, paddingLeft: 11 },
  tells: { marginTop: 12, background: "rgba(240,169,60,0.10)", border: "1px solid rgba(240,169,60,0.28)", borderRadius: 10, padding: "10px 12px" },
  tellsHead: { fontFamily: FONT_D, fontSize: 13, fontWeight: 700, letterSpacing: 1, color: C.amber, marginBottom: 6, textTransform: "uppercase" },
  tellRow: { display: "flex", gap: 7, alignItems: "flex-start", fontSize: 12.5, lineHeight: 1.5, color: "#d8cdb8", marginTop: 3 },
  modalWrap: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 40,
    display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
  },
  modal: { background: "#22252A", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 16, padding: 18, maxWidth: 420, width: "100%" },
  p: { fontSize: 13.5, lineHeight: 1.6, color: "#c8cdd4", margin: "9px 0" },
};
