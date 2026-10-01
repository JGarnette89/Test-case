/* =====================================================================
   TEST MAPS (#/tests): every test map and its named sections, each with
   Watch and -- where it has a start -- Drive, and one line on what to
   judge there. Built so the maintainer can test from his phone without
   drawing anything in the editor: every feature ships with a map here
   and says which section to open.

   The sections are the maps' own data (map/samples.js, carried through
   the loader); this screen only lists them and opens #/map's screen on
   the chosen one.
   ===================================================================== */
import React, { useMemo, useState } from "react";
import { ChevronLeft, Eye, Car, Wand2, Shuffle } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { TEST_MAPS } from "../map/samples.js";
import { mapFromBrief, BRIEF, DEFAULT_BRIEF } from "../map/brief.js";
import MapRoad from "./MapRoad.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

const DIM = "#9AA3B2", TEXT = "#E6E8EC";

export default function TestMaps() {
  const [open, setOpen] = useState(TEST_MAPS[0]?.id ?? null);   // which map's sections are shown
  const [chosen, setChosen] = useState(null);                  // { mapId, section, mode } while viewing one
  /* A map is built only when its sections are shown -- the city is
     generated, so it costs a moment -- and kept while it stays open. */
  const built = useMemo(() => {
    const t = TEST_MAPS.find((m) => m.id === open);
    return t ? t.build() : null;
  }, [open]);
  /* A MAP MADE TO ORDER (map/brief.js): tapped together here, no drawing,
     and kept while this screen is open. */
  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [made, setMade] = useState(null);
  const [seed, setSeed] = useState(1);
  const make = (sd = seed) => { setSeed(sd); setMade(mapFromBrief(brief, sd)); };
  const current = chosen?.mapId === "made" ? made : built;

  if (chosen && current) {
    const built = current;
    const sec = chosen.section;
    return (
      <div style={{ minHeight: "100dvh", background: C.bg }}>
        <div style={S.bar}>
          <button className="btn" style={S.back} onClick={() => setChosen(null)}><ChevronLeft size={18} /> Test maps</button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_D, fontSize: 14, color: C.white }}>{sec.name}</div>
            <div style={{ fontFamily: FONT_U, fontSize: 12, color: DIM }}>{sec.judge}</div>
          </div>
        </div>
        <ErrorBoundary>
          <MapRoad key={`${chosen.mapId}-${sec.id}-${chosen.mode}`} mapData={built} startAt={chosen.mode === "drive" ? sec.start : null}
            initialMode={chosen.mode} initialFollow={chosen.mode === "watch" ? sec.id : null} />
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.head}>
        <span style={S.title}>Test maps</span>
        <span style={S.sub}>Pick a map, then a section: Watch shows the traffic there, Drive puts you at the wheel heading into it. Each says what to judge.</span>
      </div>
      <div style={S.card}>
        <div style={{ ...S.mapHead, cursor: "default" }}>
          <span style={{ fontFamily: FONT_D, fontSize: 16, color: C.white }}>Make a map</span>
          <span style={{ fontFamily: FONT_U, fontSize: 12, color: DIM, textAlign: "left" }}>Say what it should test, then Make it. Each map comes with a section for every thing asked for.</span>
        </div>
        <div style={S.picks}>
          <Pick label="Size" options={Object.keys(BRIEF.size)} value={brief.size} onPick={(v) => setBrief({ ...brief, size: v })} />
          <Pick label="Arterials" options={BRIEF.arterials} value={brief.arterials} onPick={(v) => setBrief({ ...brief, arterials: v })} />
          <Pick label="Signals" options={["auto", "0", "1", "2", "3", "4", "6"]} value={brief.signals == null ? "auto" : String(brief.signals)} onPick={(v) => setBrief({ ...brief, signals: v === "auto" ? null : Number(v) })} />
          <div style={S.pickRow}>
            {[["everyType", "Every intersection type"], ["downtown", "Downtown, busy on foot"], ["buses", "Buses"]].map(([k, label]) => (
              <button key={k} className="btn" style={{ ...S.chip, ...(brief[k] ? S.on : {}) }} onClick={() => setBrief({ ...brief, [k]: !brief[k] })}>{label}</button>
            ))}
            <button className="btn" style={{ ...S.chip, ...(brief.drivers === "mixed" ? S.on : {}) }} onClick={() => setBrief({ ...brief, drivers: brief.drivers === "mixed" ? "ordinary" : "mixed" })}>Mixed drivers</button>
          </div>
          <div style={S.pickRow}>
            <button className="btn" style={{ ...S.act, borderColor: C.amber }} onClick={() => make(seed)}><Wand2 size={16} /> Make it</button>
            {made && <button className="btn" style={S.act} onClick={() => make(seed + 1)}><Shuffle size={16} /> Another layout</button>}
          </div>
        </div>
        {made && (
          <>
            <div style={{ ...S.section, fontFamily: FONT_U, fontSize: 12, color: made.report.missing.length ? C.red : DIM }}>
              {made.name}. {made.report.signals} signals, {made.report.arterialKm} km of arterial, {made.report.crosswalks} crosswalk ends, {made.report.stops.curb + made.report.stops.bay} bus stops.
              {made.report.missing.length ? ` Not got: ${made.report.missing.join("; ")}.` : " Everything asked for is here."}
            </div>
            {(made.sections ?? []).map((sec) => (
              <div key={sec.id} style={S.section}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: FONT_D, fontSize: 14, color: TEXT }}>{sec.name}</div>
                  <div style={{ fontFamily: FONT_U, fontSize: 12, color: DIM }}>{sec.judge}</div>
                </div>
                <button className="btn" style={S.act} onClick={() => setChosen({ mapId: "made", section: sec, mode: "watch" })}><Eye size={16} /> Watch</button>
                {sec.start && <button className="btn" style={S.act} onClick={() => setChosen({ mapId: "made", section: sec, mode: "drive" })}><Car size={16} /> Drive</button>}
              </div>
            ))}
          </>
        )}
      </div>
      {TEST_MAPS.map((m) => (
        <div key={m.id} style={S.card}>
          <button className="btn" style={S.mapHead} onClick={() => setOpen(open === m.id ? null : m.id)}>
            <span style={{ fontFamily: FONT_D, fontSize: 16, color: C.white }}>{m.name}</span>
            <span style={{ fontFamily: FONT_U, fontSize: 12, color: DIM, textAlign: "left" }}>{m.blurb}</span>
          </button>
          {open === m.id && built && (built.sections ?? []).map((sec) => (
            <div key={sec.id} style={S.section}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: FONT_D, fontSize: 14, color: TEXT }}>{sec.name}</div>
                <div style={{ fontFamily: FONT_U, fontSize: 12, color: DIM }}>{sec.judge}</div>
              </div>
              <button className="btn" style={S.act} onClick={() => setChosen({ mapId: m.id, section: sec, mode: "watch" })}><Eye size={16} /> Watch</button>
              {sec.start && <button className="btn" style={S.act} onClick={() => setChosen({ mapId: m.id, section: sec, mode: "drive" })}><Car size={16} /> Drive</button>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* One row of choices: tap one. */
function Pick({ label, options, value, onPick }) {
  return (
    <div style={S.pickRow}>
      <span style={{ fontFamily: FONT_U, fontSize: 12, color: DIM, minWidth: 64 }}>{label}</span>
      {options.map((o) => <button key={o} className="btn" style={{ ...S.chip, ...(o === value ? S.on : {}) }} onClick={() => onPick(o)}>{o}</button>)}
    </div>
  );
}

const S = {
  picks: { display: "flex", flexDirection: "column", gap: 6, padding: "0 12px 12px" },
  pickRow: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 },
  chip: { minHeight: 44, padding: "0 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: DIM, fontFamily: FONT_D, fontSize: 13 },
  on: { borderColor: C.amber, color: C.white },
  page: { minHeight: "100dvh", background: C.bg, color: TEXT, padding: "0 10px 24px" },
  head: { padding: "10px 2px 8px", display: "flex", flexDirection: "column", gap: 2 },
  title: { fontFamily: FONT_D, fontSize: 18, fontWeight: 700, color: C.white },
  sub: { fontFamily: FONT_U, fontSize: 12, color: DIM },
  card: { border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, marginTop: 10, overflow: "hidden" },
  mapHead: { width: "100%", minHeight: 56, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, padding: "10px 12px", background: "transparent", border: "none", cursor: "pointer" },
  section: { display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderTop: "1px solid rgba(255,255,255,0.08)" },
  act: { minHeight: 44, padding: "0 12px", display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: C.white, fontFamily: FONT_D, fontSize: 13, whiteSpace: "nowrap" },
  bar: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", background: "#16191d", borderBottom: "1px solid rgba(255,255,255,0.1)" },
  back: { minHeight: 44, padding: "0 10px", display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", background: "transparent", color: C.white, fontFamily: FONT_D, fontSize: 13, whiteSpace: "nowrap" },
};
