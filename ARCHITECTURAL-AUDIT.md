# ARCHITECTURAL AUDIT & IMPLEMENTATION ROADMAP FOR CLAUDE
**Project**: Red City — Miskawin Motor-Town Simulation  
**Document**: Architectural Alignment & Gap Analysis for Engineering Execution  
**Date**: 1 November 2026  
**Audience**: Claude (Primary Implementation Engineer), Jay (Project Lead)

---

## 1. Executive Purpose & Advisory Context

In this dual-AI development workflow, this document serves as an **architectural review and reference assessment** for Claude and the project lead. It audits the current simulation codebase (`src/sim/`, `src/core/`, `src/iso/`, `src/apps/`) against the narrative and world design established in `STORY.md` and `Narrative_Architecture_85879625.md`.

This review is advisory and intended to provide architectural context for upcoming planning rather than disrupting any work currently in progress. It highlights three primary areas of divergence to keep in mind when designing future increments:
1. **Traffic & Spawner Mechanics**: Identifying where uniform vehicle physics and static compliance diverge from the A.U.T.O. pod vs. organic revival contrast described in the narrative.
2. **80s/90s Analog Constraints**: Cataloging modern digital UI elements (AR road ribbons, GPS turn pills, digital HUD badges) that clash with the 1980s rust-belt aesthetic.
3. **Dispatch-to-Sandbox Integration**: Reviewing the hardcoded taxi job and screen fragmentation (`ExamRide.jsx`), and proposing a clean polymorphic contract pattern for Artie's dispatch board.

---

## 2. Area 1: Traffic & Spawner Mechanics

### Current Bottlenecks
* **Uniform Physics Clones (`src/sim/traffic.js`)**: Non-truck/bus vehicles (92% of traffic) share the exact same physical record: $4.5\text{ m} \times 1.8\text{ m}$, acceleration $2.4\text{ m/s}^2$, comfortable braking $2.7\text{ m/s}^2$, emergency braking $8.0\text{ m/s}^2$. An electric automated compliance pod and a rusted 1970s V8 sedan share the exact same weight, traction, and braking profile.
* **Static Compliance (`src/core/driver.js`)**: `composeDriver(seed, town)` assigns a static scalar `ratings.compliance` drawn from a fixed distribution. Once spawned, a driver's compliance is immutable; it cannot react to local A.U.T.O. surveillance gantries, induction loops, or regional revival.
* **Hardcoded Skill**: `composeDriver` line 286 hardcodes `skill: 1` across all non-player drivers.
* **Missing Progression Link**: Spawners (`src/sim/crossing.js` `joinAt` / `seedGraph`, `src/sim/shaping.js`) have no concept of regional economic health or player progress.

### Architectural Blueprint for Claude

#### 2.1 Vehicle Class Hierarchy (`src/sim/traffic.js`)
Expand `VEHICLES` beyond generic `car`:
```javascript
export const VEHICLES = {
  // A.U.T.O. Electric Pod ("Toaster")
  auto_pod: {
    length: 3.8, width: 1.7, height: 1.6,
    accel: 2.0, brake: 3.0, most: 8.5,
    cap: 1.0,           // Strict adherence to posted limits
    lateral: 0.8,
    electric: true,
    variance: 0.0,      // Zero speed spread; rigid spacing
    headway: 1.2        // Leaves conservative, sterile gap
  },
  // Rusted Detroit Sedan
  rust_sedan: {
    length: 5.1, width: 1.9, height: 1.45,
    accel: 1.5, brake: 2.2, most: 6.5, // Brake fade under heavy deceleration
    cap: 1.25, lateral: 0.7,
    electric: false
  },
  // V8 Muscle / RWD Beater
  v8_muscle: {
    length: 4.9, width: 1.9, height: 1.35,
    accel: 3.2, brake: 2.8, most: 7.5,
    cap: 1.4, lateral: 0.9,
    electric: false
  },
  // Tuned Compact
  tuned_compact: {
    length: 4.1, width: 1.75, height: 1.38,
    accel: 2.8, brake: 3.2, most: 8.2,
    cap: 1.35, lateral: 1.1, // Quick lane changes
    electric: false
  },
  // Heavy Commercial Fleet
  truck: { length: 9.0, width: 2.55, height: 3.4, accel: 1.0, brake: 2.0, most: 6.0, cap: 1.0, lateral: 0.6 },
  bus: { length: 12.2, width: 2.6, height: 3.2, accel: 1.0, brake: 1.8, most: 6.0, cap: 1.0, lateral: 0.6 },
};
```

#### 2.2 Ambient Compliance Evaluator (`src/sim/driver.js`)
Transform compliance from a static scalar into a dynamic state:
$$\text{Effective Compliance} = \text{clamp}_{0, 1}\left(\text{Base Compliance} + \text{Surveillance Modifier} - \text{Zone Revival Decay}\right)$$
* In dense, camera-monitored arterial zones (A.U.T.O. active oversight), compliance clamps high.
* In Hank's rural outcounty or unmonitored night corridors, compliance degrades, allowing rolling stops, aggressive lane-weaving, and speeding.

#### 2.3 Regional Spawner Parameter (`src/sim/crossing.js`)
Introduce `world.revival` ($0.0 \to 1.0$):
* At $0.0$ (early game): 85%+ of civilian spawns are `auto_pod` with zero speed variance. Traffic moves like a sterile conveyor belt.
* At $1.0$ (late game): `auto_pod` presence drops to $< 20\%$, replaced by `rust_sedan`, `v8_muscle`, and `tuned_compact` with wide speed and gap variations.

---

## 3. Area 2: 80s/90s Analog Constraints

### Current Modern Violations
1. **AR Route Ribbon (`src/sim/session.js` line 95, `src/apps/MapRoad.jsx`)**:
   `sc.routePts` traces an exact digital route line directly onto the asphalt surface. This is modern augmented reality.
2. **Digital Turn-by-Turn Banner (`src/iso/hud.js` line 230 `drawNav`)**:
   A floating cyan `#7fd3ff` pill reading: *"Get in the left lane — turn left at the next intersection, 120 m"*. This is a smartphone GPS navigation bar.
3. **Digital Throttle Badges (`src/iso/hud.js` line 88 `drawSlider`)**:
   HUD overlay labels displaying `HOLD`, `SLOW`, `STOP`, `FLW`, `BRK` and numeric headway (`1.8 s`).
4. **App-Style Ride Receipt (`src/iso/hud.js` line 247 `drawReceipt`)**:
   A digital ride-share popup displaying calculated tips and e-wallet balances.
5. **Modern Chat Overlay (`src/iso/hud.js` line 202 `drawCaption`)**:
   Floating rounded-rectangle popup notifications.

### Architectural Blueprint for Claude

#### 3.1 Wayfinding Refactor
* **Decommission**: Remove `sc.routePts` pavement rendering and `drawNav` digital turn-by-turn banner.
* **Implement Analog Route Cards**:
  - Wayfinding is presented on a **paper trip ticket / dispatch slip** mounted to the dashboard or sun visor.
  - Route descriptions use physical landmarks and street names:
    - *"North on St. Anne Blvd $\to$ Right at Miskawin Grain Elevator onto Concession 4 $\to$ Terminal Bay 3 at Assembly Plant"*.
  - The driver must observe physical street name signs (`src/sim/reading.js`, `src/map/load.js`), which the sim engine already natively supports.

#### 3.2 Diegetic Instrument Cluster
* Replace floating `drawSlider` digital text with an **analog dashboard aesthetic**:
  - Mechanical speedometer needle with glowing amber incandescent backlight.
  - Odometer rendered as rolling mechanical drums.
  - Tachometer / engine load needle indicating maintain/acceleration bands.
  - Physical dash indicator lights (blinking green signal arrows, high-beam indicator).

#### 3.3 Audio / CB Radio Dispatch & Paper Receipts
* Transform `drawCaption` into an **analog CB radio / tape deck readout**:
  - Accompany incoming calls with a brief radio squelch audio cue.
  - Render speaker text in vintage fluorescent green / amber dot-matrix display typography.
* Replace `drawReceipt` with a **carbon-copy dispatch slip**:
  - Rendered as paper with typed courier font, pencil checkmarks, and an ink "PAID" stamp.

---

## 4. Area 3: Dispatch-to-Sandbox Integration

### Current Bottlenecks
* **Hardcoded Taxi Monolith (`src/sim/jobs.js`)**: All job state assumes taxi fares (`toPickup` $\to$ `boarding` $\to$ `toDropoff` $\to$ `alighting`).
* **Screen Fragmentation (`src/apps/ExamRide.jsx`)**: Brenda's examiner mode is isolated in a separate React component and route (`#/exam`) with its own disconnected canvas ref and frame loop, with no connection to the player's wallet or sandbox state.
* **Missing Specialist Logic**: Zane's highway weaving, Victor's freight hauling, Hank's rural transit, and Maya's night tests have no unified contract execution pipeline.

### Architectural Blueprint for Claude

#### 4.1 Polymorphic Contract Engine (`src/sim/contracts.js`)
Deprecate `jobs.js` in favor of a unified contract architecture:
```javascript
export class Contract {
  constructor({ id, authority, title, client, origin, destination, payload, evaluator, timeLimitS, basePayout }) {
    this.id = id;
    this.authority = authority; // "brenda" | "victor" | "hank" | "maya" | "zane" | "artie"
    this.title = title;
    this.client = client;
    this.origin = origin;
    this.destination = destination;
    this.payload = payload;     // { kind: "student"|"freight"|"parts"|"passenger", massKg, fragility }
    this.evaluator = evaluator; // Pluggable scoring ruleset
    this.timeLimitS = timeLimitS;
    this.basePayout = basePayout;
    this.state = "active";
  }

  tick(context) {
    return this.evaluator.evaluate(this, context);
  }
}
```

#### 4.2 Specialist Evaluator Implementations
Create distinct evaluators in `src/sim/evaluators/`:
1. **`BrendaExamEvaluator` (Suburban Exam & Compliance)**:
   - Zero-tolerance regulatory grading.
   - Evaluates: left-right-left mirror scans before moving from stop lines (`sim/checks.js`), smooth deceleration ($\le 2.7\text{ m/s}^2$), exact stop line precision, and zero speed violations.
2. **`VictorFreightEvaluator` (Industrial Freight Logistics)**:
   - Evaluates momentum maintenance and schedule windows.
   - Evaluates: payload shift under excessive lateral Gs; rewards continuous motion via signal green waves (`sim/progression.js`); penalizes dead stops.
3. **`HankRuralEvaluator` (Outcounty Gravel Hauling)**:
   - Evaluates weight transfer and throttle modulation on low-friction road surfaces (`road.surface = "gravel"`).
   - Penalizes ditch excursions, wheel spin, and sliding.
4. **`ZaneWeaveEvaluator` (Interstate Bypass "Swimming")**:
   - Evaluates high-speed drafting/slipstreaming ($< 1.0\text{ s}$ headway behind highway vehicles), rapid lane transitions, and maintaining $> 120\text{ km/h}$ while avoiding automated speed enforcement gantries.
5. **`MayaNightEvaluator` (Downtown Street Performance)**:
   - Evaluates corner exit speeds, urban drift angle maintenance, and evasive maneuvers through sparse nightlife traffic.

#### 4.3 Screen Consolidation
* **Deprecate `ExamRide.jsx` and `RoadStrip.jsx`**:
  All driving contracts—including Brenda's driving exams—run inside the **singular sandbox loop** (`MapRoad.jsx` / `Game.jsx`).
* When an exam contract is accepted from Artie's board:
  - The player drives, with Brenda observing and evaluating in real time, OR
  - The AI student drives while the player acts as examiner/evaluator from the passenger seat.
* Eliminates multi-screen code divergence, separate canvas lifecycles, and synchronization bugs.

---

## 5. Recommended Phasing for Future Work

When scheduling work to align the engine with the updated narrative, consider approaching the changes in four phases:

### Phase 0: Contract Architecture & Deprecation of Taxi Monolith (P0)
* **Target Files**: Create `src/sim/contracts.js`, create `src/sim/evaluators/`, refactor `src/sim/session.js`.
* **Actions**:
  1. Build the base `Contract` and `ContractEvaluator` classes.
  2. Implement `BrendaExamEvaluator` and `ArtieCourierEvaluator`.
  3. Wire `session.js` to process generic contracts instead of hardcoded `taxi` logic.
* **Testing Gate**: Run `node tools/check.mjs --direct` on touched files; verify zero regressions in `verify-core.mjs` and `verify-exam.mjs`.

### Phase 1: Screen Consolidation (P1)
* **Target Files**: `src/apps/MapRoad.jsx`, `src/apps/ExamRide.jsx`, `src/App.jsx`.
* **Actions**:
  1. Integrate candidate exam ride mechanics directly into the primary sandbox screen as a contract mode.
  2. Retire `#/exam` standalone route; redirect all gameplay into the unified sandbox.
* **Testing Gate**: Run `node tools/check.mjs verify-screens` to ensure SSR and client bundles render cleanly.

### Phase 2: 80s/90s Analog HUD Transformation (P2)
* **Target Files**: `src/iso/hud.js`, `src/sim/session.js`, `src/iso/draw.js`.
* **Actions**:
  1. Remove road-surface route ribbon (`sc.routePts`) and digital turn banner (`drawNav`).
  2. Implement paper dispatch route card rendering.
  3. Re-skin speed and throttle meters into an analog instrument cluster.
  4. Style dialogues as CB radio transmissions with accompanying radio audio squelch.
* **Testing Gate**: Verify visual rendering on canvas; ensure no DOM re-renders inside the animation loop.

### Phase 3: Vehicle Archetypes & Revival Spawner (P3)
* **Target Files**: `src/sim/traffic.js`, `src/sim/crossing.js`, `src/sim/shaping.js`.
* **Actions**:
  1. Add `auto_pod`, `rust_sedan`, `v8_muscle`, and `tuned_compact` to `VEHICLES`.
  2. Connect spawner generation ratios to a regional `zoneRevival` parameter.
  3. Wire ambient A.U.T.O. surveillance modifiers into driver compliance evaluations.
* **Testing Gate**: Run `node tools/check.mjs verify-trucks verify-buses verify-crashes` to guarantee stability and non-overlap.
