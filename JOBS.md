# JOBS — sixteen daytime jobs (recorded 13 October 2026, CONTENT ONLY, NOT BUILT)

**Authored externally** (the maintainer, with another model). Stored as DATA
beside the dialogue -- `src/content/jobs.json` -- each job with a vehicle
class, a district, its specific difficulty and a scoring metric.

**NO SOURCE FILE IS COMING (the maintainer, 14 October).** This record
-- written from the maintainer's description of the external set -- IS the
source. When the content is built, it is written here, against this record
and the decisions below, and stored as data then. What is known per job is the table below; each job's district,
difficulty and metric are written when the job machinery is built. Built on
the job machinery in [PLAN.md](PLAN.md) (phase 3); the dialogue is
[DIALOGUE.md](DIALOGUE.md).

| job | vehicle | buildable from what exists? |
|---|---|---|
| Downtown Medical Express | motorcycle | **motorcycle class** (PLAN.md 6: deferred, no lane filtering) |
| Port Freight Reverse Dock | semi | **BLOCKED: trailer reversing + loading bays** (bays need the parking-lot work) |
| Suburban School Zone Run | bus | yes, on the objectives layer (+ school zones, district decoration) |
| Highway Intermodal Haul | semi | yes, on objectives + articulation |
| Rural Organic Produce Delivery | pickup | **BLOCKED: gravel surfaces** |
| Nightclub VIP Shuttle | pickup | yes |
| Industrial Steel Coil Delivery | semi | yes, on objectives + articulation |
| Courtesy Pacer Escort | box truck | **BLOCKED: convoy/escort behaviour** -- shepherding a specific slow vehicle |
| Last-Mile Courier Sprint | compact | yes |
| Suburban Commuter Express | bus | yes |
| Gravel Quarry Haul | semi | **BLOCKED: gravel surfaces** |
| Port Warehouse Distribution | box truck | **PARTLY: scores blind-spot collisions as a category** -- adjacent to what exists (sight, contact), not the same thing |
| Rural Mail & Parcel Route | compact | yes |
| Highway Flow Pacer | compact | yes -- and see below |
| Downtown Refrigerated Food Run | box truck | yes |
| VIP Airport Shuttle | compact | yes |

## The reviewer's notes (13 October), which matter more than the list

- **TEN ARE BUILDABLE FROM MECHANICS THAT EXIST**: courier sprint, food
  run, mail route, commuter express, VIP airport shuttle, steel coil haul,
  intermodal haul, school zone run, nightclub shuttle and flow pacer need
  nothing new beyond the objectives layer itself (the two semi hauls need
  articulation, which is already scheduled for hauling).
- **FOUR OR FIVE ARE BLOCKED, SO THE LIST IS A DEPENDENCY ARGUMENT.**
  Reverse dock: trailer reversing (not modelled at all) plus loading bays.
  Produce delivery and quarry haul: gravel. Pacer escort: convoy/escort
  behaviour. Warehouse distribution: blind-spot collisions as a scored
  category.
- **REVERSING unlocks the single most appealing job and makes the
  articulated truck an activity rather than a bigger vehicle. GRAVEL
  unlocks two jobs and Hannah's district.** Both were already shared
  foundations; this corroborates it independently.
- **THE STRONGEST THREE, AND ONE NOVEL.** The reverse dock (above). The
  school zone run -- smoothness scoring with pedestrians at stake is the
  clearest use of the braking model. And **HIGHWAY FLOW PACER**: hold a
  steady buffer behind a convoy and let merging traffic in, so the win
  condition is NOT BEING THE PROBLEM. Unusual in a driving game, possible
  only because courtesy and following are already modelled, and maybe the
  cheapest genuinely distinctive job on the list.
- **HONEST CAVEAT: sixteen jobs, about nine distinct activities.** The
  courier sprint, food run and mail route are one job -- multi-stop
  delivery, avoid faults -- in different costumes. That is how real
  content works; do not budget sixteen activities' worth of variety.
- **PASSENGER COMFORT scoring appears twice** (commuter express, airport
  shuttle): one mechanic serves both.

## Distinct activities, as the plan budgets them

1. **Multi-stop delivery** (courier sprint, food run, mail route, produce
   delivery once gravel exists).
2. **Passenger service with comfort scoring** (commuter express, VIP
   airport shuttle, nightclub shuttle).
3. **Time-critical run** (medical express -- awaits a motorcycle).
4. **Smoothness with pedestrians at stake** (school zone run).
5. **Long haul in a semi** (intermodal, steel coil, quarry once gravel).
6. **Reverse to a dock** (port freight; awaits reversing and bays).
7. **Flow pacer -- not being the problem** (highway flow pacer).
8. **Escort a slow vehicle** (courtesy pacer escort; awaits escort behaviour).
9. **Blind-spot discipline in a box truck** (warehouse distribution; awaits the scored category).
