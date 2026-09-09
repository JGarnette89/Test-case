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
import { M, W, CX, CY, HALF, RA_OUTER, RA_ISLAND } from "../engine/index.js";

/* Drawn from the same radii the engine drives on, so what is painted and
   what the cars do cannot drift apart. Give-way markings sit on the entry
   half of each approach only — the exit half is not yours to yield on. */
/* `reach` is how far the approach roads run out from the island — the
   widest this scenario's camera ever opens to (worldHalfFor in
   ../frame.js), not the fixed board. Same reasoning as Road's: a camera
   that opens past 720 would otherwise show the approaches stopping in
   mid-air. No roundabout scenario declares a camera today, so this is
   the identical latent bug rather than a live one, and it defaults to
   the board so the branch screen and both circle scenarios are
   untouched. */
export function Roundabout({ island = C.grass, reach = W / 2 }) {
  const Edge = (p) => <line {...p} stroke={C.line} strokeWidth={M(0.15)} />;
  const set = RA_OUTER + M(2);
  const T = CY - reach, B = CY + reach, L = CX - reach, R = CX + reach;
  const give = [
    { x1: CX, y1: CY + set, x2: CX + HALF, y2: CY + set },
    { x1: CX - HALF, y1: CY - set, x2: CX, y2: CY - set },
    { x1: CX - set, y1: CY, x2: CX - set, y2: CY + HALF },
    { x1: CX + set, y1: CY - HALF, x2: CX + set, y2: CY },
  ];
  return (
    <>
      <rect x={CX - HALF} y={T} width={HALF * 2} height={reach * 2} fill={C.asphalt} />
      <rect x={L} y={CY - HALF} width={reach * 2} height={HALF * 2} fill={C.asphalt} />

      <Edge x1={CX - HALF} y1={T} x2={CX - HALF} y2={B} />
      <Edge x1={CX + HALF} y1={T} x2={CX + HALF} y2={B} />
      <Edge x1={L} y1={CY - HALF} x2={R} y2={CY - HALF} />
      <Edge x1={L} y1={CY + HALF} x2={R} y2={CY + HALF} />

      {/* The circulating carriageway, painted over the approach stubs. */}
      <circle cx={CX} cy={CY} r={RA_OUTER} fill={C.asphalt} stroke={C.line} strokeWidth={M(0.15)} />
      {/* Central island, curbed. */}
      <circle cx={CX} cy={CY} r={RA_ISLAND} fill={island} stroke={C.line} strokeWidth={M(0.3)} />
      <circle cx={CX} cy={CY} r={RA_ISLAND - M(0.9)} fill={shade(island, 0.06)} />

      {give.map((g, i) => (
        <line key={i} {...g} stroke={C.line} strokeWidth={M(0.4)}
          strokeDasharray={`${M(0.6)} ${M(0.5)}`} />
      ))}
    </>
  );
}
