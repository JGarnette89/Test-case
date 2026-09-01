/* =====================================================================
   SHARED ROAD ART
   SVG the timing renderer and the roguelike's own screens both draw.

   Only the roundabout lives here so far, because it is the only piece
   with two genuinely different jobs: it is the carriageway a roundabout
   scenario is driven on, and it is the map the roguelike's between-stages
   branch screen is drawn over. Everything else in the renderer draws one
   thing in one place and has no reason to move.

   Renderer-side, like the rest of src/apps — it reads the engine's
   geometry constants so what is painted and what the cars drive on cannot
   drift apart, but nothing here is imported by the engine.
   ===================================================================== */
import React from "react";
import { C, shade } from "../theme.js";
import { M, W, H, CX, CY, HALF, RA_OUTER, RA_ISLAND } from "../engine/index.js";

/* Drawn from the same radii the engine drives on, so what is painted and
   what the cars do cannot drift apart. Give-way markings sit on the entry
   half of each approach only — the exit half is not yours to yield on. */
export function Roundabout({ island = C.grass }) {
  const Edge = (p) => <line {...p} stroke={C.line} strokeWidth={M(0.15)} />;
  const set = RA_OUTER + M(2);
  const give = [
    { x1: CX, y1: CY + set, x2: CX + HALF, y2: CY + set },
    { x1: CX - HALF, y1: CY - set, x2: CX, y2: CY - set },
    { x1: CX - set, y1: CY, x2: CX - set, y2: CY + HALF },
    { x1: CX + set, y1: CY - HALF, x2: CX + set, y2: CY },
  ];
  return (
    <>
      <rect x={CX - HALF} y={0} width={HALF * 2} height={H} fill={C.asphalt} />
      <rect x={0} y={CY - HALF} width={W} height={HALF * 2} fill={C.asphalt} />

      <Edge x1={CX - HALF} y1={0} x2={CX - HALF} y2={H} />
      <Edge x1={CX + HALF} y1={0} x2={CX + HALF} y2={H} />
      <Edge x1={0} y1={CY - HALF} x2={W} y2={CY - HALF} />
      <Edge x1={0} y1={CY + HALF} x2={W} y2={CY + HALF} />

      {/* The circulating carriageway, painted over the approach stubs. */}
      <circle cx={CX} cy={CY} r={RA_OUTER} fill={C.asphalt} stroke={C.line} strokeWidth={M(0.15)} />
      {/* Central island, kerbed. */}
      <circle cx={CX} cy={CY} r={RA_ISLAND} fill={island} stroke={C.line} strokeWidth={M(0.3)} />
      <circle cx={CX} cy={CY} r={RA_ISLAND - M(0.9)} fill={shade(island, 0.06)} />

      {give.map((g, i) => (
        <line key={i} {...g} stroke={C.line} strokeWidth={M(0.4)}
          strokeDasharray={`${M(0.6)} ${M(0.5)}`} />
      ))}
    </>
  );
}
