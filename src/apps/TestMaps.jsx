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
import { ChevronLeft, Eye, Car } from "lucide-react";
import { C, FONT_D, FONT_U } from "../theme.js";
import { TEST_MAPS } from "../map/samples.js";
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

  if (chosen && built) {
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

const S = {
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
