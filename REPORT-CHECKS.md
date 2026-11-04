> **SOURCE DOCUMENT, NOT THE RECORD.** Dated 30 October 2026; the project lead attributes it to an external review by Gemini. Uploaded by the maintainer on 3 November 2026 in `226198a`, which holds this file unaltered. Everything below the rule is the source verbatim; only this note was added. Where it was accepted, narrowed or refused: DECISIONS 10.36, TESTING.md "Gemini's numbers".

---

# REPORT: Check Execution Times and the Singular Large Map Architecture

**Date**: 30 October 2026  
**Audience**: Claude, Jay (Project Lead), and subsequent engineering sessions  
**Subject**: Why running checks consumes the vast majority of engineering time, measured bottlenecks in the suite, and how the transition to a singular large map and unified screen transforms test execution.

---

## 1. Executive Summary

"Running checks is most of the time spent." Across development sessions, automated verification runs frequently stretch past 15 to 25 minutes. On resource-constrained environments (e.g. 2-CPU containers) or during iterative tasks, prolonged test suites cause tool timeouts, quota exhaustion, and stalled agent turns.

This report establishes:
1. **The mathematical cause of suite latency**: Parallel execution in `tools/check.mjs` is bottlenecked by the "long pole" — a small cluster of monolithic checks taking 12 to 15 minutes each.
2. **Empirical measurements of the longest checks**: Demonstrating that over 60% of test time is spent executing redundant warm-up cycles (stepping unpopulated worlds from $t = 0$ to $t = 240\text{ s}$ over multiple seeds).
3. **The impact of moving to a singular large map**: Simulating a single 8 km² continuous map with 300+ cars globally would multiply step costs and make checks even slower unless accompanied by two architectural requirements:
   - **District Subgraph Extraction**: Checks must execute against localized subgraphs of the singular map rather than stepping the global world.
   - **Cached Pre-Warmed Snapshots**: A canonical warmed baseline state must be generated once and forked across test trials, eliminating repeated warm-up stepping.
4. **Single-screen consolidation**: Collapsing divergent test routes into a unified gameplay view removes mock harness drift and streamlines UI regression testing.

---

## 2. The Mechanics of the Bottleneck

`tools/check.mjs` executes tests in parallel, capped by CPU threads and memory (`Math.max(2, Math.min(threads * 3/4, freemem / 0.75 GB))`). On a 2-core machine, `jobs = 2`. On an 8-core machine, `jobs = 12`.

However, parallel scheduling **cannot beat the longest single test**. The wall clock of the entire suite equals the runtime of its slowest process:

| Check Name | Suite Recorded Time | Measured Cause of Latency |
| :--- | :--- | :--- |
| `verify-peds` | **920 s (15.3 min)** | Section 5 runs six 10-minute simulation runs (60 simulated minutes total); Section 6 simulates 300 cars on the city for 5 minutes. |
| `verify-courtesy` | **832 s (13.8 min)** | Repeated loop warm-up: warms 6 seeds to 240 s in Sections 2–4, then re-warms all 6 seeds from $t = 0$ again in Section 7. |
| `verify-keepright` | **811 s (13.5 min)** | 3 modes ("on", "off", "stripped") each run 3 seeds for 150 s sequentially (9 runs $\times$ 150 s = 1,350 simulated seconds of 200 cars in one thread). |
| `verify-busbays` | **805 s (13.4 min)** | Multiple long highway and collector trials stepping bus merge queues. |
| `verify-trucks` | **757 s (12.6 min)** | Sight lines and passing scenarios across multiple extended runs. |
| `verify-graph` | **752 s (12.5 min)** | Whole-network pathfinding and non-overlap proofs on large node topologies. |
| `verify-passing` | **749 s (12.5 min)** | Solid line overtaking across multiple seeds on highway stretches. |

Even if 38 of the 45 checks complete in under 60 seconds, any full suite run is locked to a 15-minute floor by `verify-peds` and `verify-courtesy`.

---

## 3. Micro-Analysis: Redundant Warm-Up in `verify-courtesy.mjs`

To understand where the minutes go, `verify-courtesy.mjs` was profiled in isolation on 30 October 2026:

1. **Sections 2–4 (Highway signalling trials)**:
   - Needs 14 encounters (`8 yes, 6 no`) of a player level with a car in the middle lane.
   - Warms up 6 seeds on the 200-car `testLoop()` from $t = 0$ to $t = 120\text{–}240\text{ s}$.
   - **Measured duration**: **4 minutes 56 seconds** (296 s).
2. **Section 7 ("Taken, it is noticed in the running sim")**:
   - Tests detector event emission (`letIn`) when a courteous offer is accepted.
   - Floor requirement: $\ge 3$ taken offers and $\ge 3$ alone trials.
   - Implementation: Loops over seeds `[1, 2, 3, 4, 5, 6]`, initializes each from scratch (`seedGraph`), steps from $t = 0$ to $t = 180\text{ s}$ and $t = 240\text{ s}$, then runs 4 trials per moment up to 90 seconds each.
   - **Measured duration**: **6 minutes 44 seconds** (~404 s) for all 6 seeds (seeds 1–3 alone took 3 minutes 22 seconds).

**The Architectural Defect**: Section 7 discarded the warmed `bases[0..5]` already stepped in Section 2–4 and completely re-simulated the first 240 seconds for all 6 seeds. Over 7 minutes were spent stepping traffic that had already been stepped minutes earlier in the same process.

---

## 4. Architectural Transformation: The Singular Large Map

The project is consolidating its various stand-in maps (`testMap1`, `testLoop`, `testHighway`, `testBuses`, `testPeds`, `city`) into a **singular large map (~8 km² continuous world)** containing all game features, driven by a single unified screen.

### 4.1 The Danger of Global Simulation
On `testMap1` (1 km², 4 nodes), 200 cars step in ~10–15 ms. On an 8 km² continuous map with 300–400 cars, stepping the entire world takes ~25–45 ms per tick.
If automated checks were to instantiate and step the full 8 km² map globally:
- A 150-second test run would jump from 15 CPU-seconds to 75–120 CPU-seconds.
- The suite's long pole would balloon from 15 minutes to over 40 minutes.
- **Rule**: Automated checks must NEVER simulate the entire singular map globally unless explicitly testing global density shaping or macro trip routing.

### 4.2 Pattern 1: District Subgraph Extraction (`subgraphOf`)
Instead of standalone synthetic maps, each verification check extracts a functional subgraph from the singular map:
- `verify-peds`: Extracts the commercial district crossing nodes (e.g. 4 intersections, sidewalks, crosswalks).
- `verify-busbays`: Extracts the arterial collector transit corridor.
- `verify-courtesy` & `verify-merge`: Extracts the ring-road highway interchange with its on-ramp acceleration lane.
- `verify-signs`: Extracts the two-way and all-way stop intersections.

**Benefits**:
1. Active simulation actors drop from 300+ cars to 30–60 cars per check.
2. Step time drops to under 5 ms per tick.
3. Road geometry, curb radii, lane widths, and markings are real production geometry rather than synthetic test fixtures.

### 4.3 Pattern 2: Cached Pre-Warmed Snapshots
Traffic cannot be tested at $t = 0$ because roads start empty; it requires 90 to 180 seconds for queues, headways, and speeds to reach realistic equilibrium.

Instead of each check simulating $0 \to 120\text{ s}$ from scratch:
1. **Canonical Baseline Snapshots**: A canonical warmed baseline for a district subgraph (or the core loop) is generated once (e.g. at $t = 120\text{ s}$) with fixed seeds.
2. **Snapshot Forking**: Checks load the pre-warmed snapshot directly (or clone it in memory).
3. **Execution Savings**:
   - In `verify-courtesy`: Eliminates ~9 minutes of warm-up stepping; trials begin testing gaps immediately at $t = 120\text{ s}$.
   - In `verify-keepright`: Eliminates 3 minutes of lane population build-up per seed.
   - Suite long-pole checks drop from 800–900 s down to **120–180 s**.

### 4.4 Pattern 3: Single-Screen Consolidation
Currently, `verify-screens.mjs` must maintain separate harnesses for `ExaminerDrive`, `MapRoad`, and retired prototypes. Different screens had subtle variations in how inputs, chase cameras, and overlay HUDs were mounted.

Consolidating into a singular screen:
- Eliminates multi-route regression checks.
- Guarantees that camera tracking, mirror check wedges (`sim/checks.js`), and examiner alerts are verified against the exact component tree the player touches.
- Prevents the recurring defect where a feature functions in a headless test harness but fails under SSR or in the UI bundle.

---

## 5. Operational Discipline for Engineers & Agents

Until the singular map and snapshot cache are built, adherence to `CLAUDE.md` Item 8 is mandatory to preserve development bandwidth:

1. **Iterate with `--direct`**:
   ```bash
   node tools/check.mjs --direct
   ```
   Runs only the 1–3 checks that directly import the files modified, plus `verify-screens` and `verify-core`. Typical duration: **15 to 45 seconds**.

2. **Commit with affected derivation**:
   ```bash
   node tools/check.mjs
   ```
   Runs only checks whose transitive import closure includes a modified file.

3. **Never run `--all` during iteration**:
   `--all` must be reserved strictly for cross-subsystem milestones or pre-deployment sign-offs. Running `--all` while writing code guarantees a 15–24 minute wait.

4. **Zero Polling Rule on Background Tasks**:
   When a long-running check is launched via `run_command`, **never poll `manage_task status` in a loop**. Doing so consumes tool steps and exhausts quota. Allow the background task to complete and await the system notification.

---

## 6. Recommended Action Items

1. **Immediate (Suite Latency Quick-Win)**:
   - Patch `verify-courtesy.mjs` to reuse the warmed `bases` from Sections 2–4 in Section 7, immediately saving ~400 seconds on that check.
   - Apply worker threads to `verify-keepright.mjs` (running the 3 modes in parallel), cutting its runtime from 811 s to ~300 s.

2. **Singular Map Migration Architecture**:
   - Author the subgraph extraction utility: `extractDistrict(map, districtId, { bufferMeters: 100 })`.
   - Implement the snapshot serializer / loader for pre-warmed graph states.
   - Retire legacy test maps (`test-signs`, `test-buses`, `test-peds`) as their districts are integrated into the singular master map.
