# PROPOSAL: a short, ad-supported game extracted from what exists (24 November 2026)

**Status: a proposal for Jay. Nothing is built, and nothing in the existing order of work (PLAN.md, HANDOFF-2026-11-19.md) changes until he rules.**

**JAY'S ANSWERS, 24 November (on section 6 and section 7), recorded before anything else is decided:**
- **The score sheet is public**: "given away with every test". Its categories may be used as vocabulary, in the game and in its marketing.
- **THE LOGIC EXAMINERS MARK BY IS NOT PUBLIC, AND IT STAYS OUT OF THE PRODUCT.** A round is graded by the law (public) and by what the sim's traffic did. It is never graded by how an examiner would deduct for it, or at what threshold. This applies with most force to option C: its faults may be named in the sheet's own categories, but how serious each one is, and when it fails a candidate, may not come from examining practice.
- **A conflict of interest is not a concern for now.** Section 6's other question is set aside by him, not answered.
- **Needing testers is a goal, not an obstacle.** The 12-tester, 14-day closed test is wanted, as a recruiting step.
- **SUPERSEDED 25 November: THE ROUND IS ONE FROZEN DECISION (Jay, after playing slice 1).** His words: "Boring. The gameplay needs to be even faster, let's try just a cut to the car pulling up to the (decision point) and the scene freezes. The player press go immediately or they can hold 'wait' and the simulation continues so the player can wait for their correct timing." He also reported that slice 1 "ran butter smooth" and that he "didn't notice any wrong calls". GAME.md and WORK-game-slice2.md carry it from here; the entry below is history.
- **THE ROUND IS DRIVEN, NOT TAPPED (Jay, 24 November): "I still want the round to be driven, not just the user watching a recording."**
  - **Section 4's GO tap and its hold-until-tapped mode are withdrawn.** The player drives the round with the existing two controls (`player.js`, `drive.js`), starting a short way before an intersection: `scene.js` `worldFor` with a map and `startAt`, placed clear by `placePlayer`.
  - **The verdict is the player's own detectors in `events.js`**, already written for the player: `ranRed`, `rolledStop`, `stoppedShort`, `tightGap`, `lateSignal`, `wideTurn`, `honkedAt`, `blockingBox`, plus contact. No change inside the sim is needed to start.
  - **It sits on the current sim, not the deleted engine.** Only the old situations' ideas and lesson prose come back, re-authored as maps and arrivals.
  - **The cost: rounds are longer**, about 20-30 s against 8-20 `[D: from a 100 m approach at 50 km/h, about 7 s, plus the stop, the wait and the exit; assuming the start is placed about there]`.
  - **The open defect that bears on it: the player's car has no position of its own (10.64).** Judgments that depend on the lane (a wide turn, leaving the lane) rest on re-location, which is built only behind the `realPos` switch and unmerged. Early rounds favour what is sound today: stops, gaps, signals, signalling, pedestrians. Lane rounds wait for re-location, which 10.65 puts "first in the queue when there is usage", and this game is that usage.

Marks follow CLAUDE.md item 3: `[M]` a run printed it (the run is named), `[D: from ..., assuming ...]` derived, `[S]` a published third-party source (listed at the end), `[Jay]` his words, `[invented]` my judgment with no ruling behind it.

---

## 0. The answer, in one paragraph

**Build a round-based right-of-way game. Call it "Your Turn" for now; the name is yours to choose.** Each round is 8 to 20 seconds at one intersection: your car is at the line, and the live sim traffic is around you. You tap GO when the road is yours. The sim already decides what happens next. You either go clean, or somebody has to brake for you, or somebody honks, or there is contact, or you sat too long and the car behind you honks. The pieces are:

- **A set** is five rounds, about 90 seconds.
- **The ad** goes between sets and never inside one.
- **A daily set** is the same seeded five rounds for everybody, with a shareable score.

That loop fits ads better than anything else the project has. It uses the part of the codebase that is most finished and cheapest on a phone (one intersection, not a highway). It is also the format the project started as, rebuilt on a foundation that can now express it.

On Ontario's graduated licensing: **use it as positioning and a content track, not as the game's identity.** The G1 knowledge-test category is crowded with near-identical quiz apps. Its users leave the day they pass, and many of them are 16-17, which lowers ad revenue. Where your authority is unique is the road test (G2 and G), and that is exactly where your employment as an examiner raises a question only you can answer (section 6).

---

## 1. What the project has, sorted by fitness for short sessions

I read the code (`src/`, about 30,000 lines), the plan, the latest handoffs and DECISIONS 10.60-10.63, and the code deleted in cuts B and C, which is still in git history.

### Fits a round of 8-60 seconds

| asset | where | what it gives a short game |
|---|---|---|
| **Right of way, gap acceptance, who goes first** | `src/sim/crossing.js` (`openTo`, `blockedBy`, `gapNeeded`, `leftYields`), `intersection.js`, `signal.js`, `peds.js` | The whole adjudication. A round does not need a single rule written for it. |
| **Consequences that are visible** | `horn.js`, courtesy and forced-entry yielding (10.118), `contact.js`, undue delay (`UNDUE_AT`, horn after 2.0 s) | What the player sees when they get it wrong: a car braking hard, a horn, a crash. Feedback that is a behavior, not a score. |
| **Twenty-three event detectors with severities** | `src/sim/events.js` `TRIGGERS` | Ran a red, rolled a stop, blocked the box, tight gap, honked at, let somebody in, stopped for a pedestrian. Most are a round's verdict, already written. |
| **A voice and its lines** | `voice.js` (rate limiter), `src/content/dialogue.js` | Short spoken reactions, already rate-limited. |
| **A deterministic, seeded sim** | the whole of `src/sim/` (replay is checked by world hash) | A daily challenge that is identical for everybody, an exact retry, and a shareable replay. This is almost free here and expensive in most games. |
| **Hand-authored situations with your lessons** | git `43f7f36^:src/engine/scenarios.js` (18 situations), the eight "Order" puzzles at `63a9c68` | Ready-made round designs, each with a lesson already written in plain English ("The turn signal that lied", "Asleep at the line", "It never signaled"). |
| **Signs as objects, with a difficulty each** | `reading.js`, `verify-signs` | Sign rounds: a hard sign is misread by more drivers, by construction. |
| **Candidates with readable weaknesses, and the exam mode** | `candidate.js`, `exam.js`, `checks.js` (mirror, shoulder, left-right-left) | The basis for a second round type later: "what did this driver do wrong?" |
| **Maps as data, plus the editor** | `src/map/`, `src/editor/` | A round is a tiny map plus arrival declarations, so it is authored as data rather than code. |

### Does not fit a short session, and should stay where it is

- **The endless highway.** Its loads are 6-8 s on your phone `[Jay, 10.63]`, its session shape is "about thirty minutes" `[Jay, 10.60]`, and it has an open felt-density gap (3.8-9.1 cars met per minute against your 12-30, 10.151). It is the long game and should stay the long game.
- **The city, jobs, money and mail.** Good systems, but each needs minutes of driving before anything happens.
- **MergeRush** (`src/apps/MergeRush.jsx`). This is a clone of a mobile-ad genre (the crowd runner), and it touches none of the sim. It is the cheapest thing to ship and the least distinctive: it would compete in the most crowded ad-funded genre there is, with nothing the competitors lack.

### Two measurements taken for this proposal

I ran a rough probe on the desk (`scratchpad/probe/rounds2.mjs`, six seeds, five minutes each, a single all-way-stop crossing at 50 km/h):

- **A one-intersection world steps in about 1.05 ms with up to 40 cars** `[M, rounds.mjs and rounds2.mjs; desk, phone factor unmeasured]`. The highway world is far heavier, so a round is cheap enough that phone performance should not be the constraint it has been on the highway.
- **In the default seeded crossing, the car at the front of a line stood only 0.4-0.5 s before leaving** (575 stands) `[M, rounds2.mjs; instrument unaudited: my "front of the line" test may miss some queued waits]`. That is close to the stop's own dwell, so ordinary background traffic gives almost no decision. **Rounds therefore need authored arrivals.** Arrival times get adjusted until the sim produces the tension the round is about, which is the established rule ("change the arrival times until the engine produces it"). Writing that content is the real work, not the engine.

---

## 2. What "ads in a tolerable way" means, from the evidence

The evidence is industry analysis and vendor research, not peer-reviewed work, and nobody publishes a consensus frequency cap `[S]`. It agrees on direction:

- **Players prefer rewarded ads, which they choose to watch, over interstitials, which are forced.** Tapjoy's figure is 4 to 1, a vendor number `[S: Unity]`. Interstitials produced noticeably more churn than rewarded video, and iOS players were more sensitive (peak churn above 15%, against about 10% on Android) `[S: PocketGamer.biz]`.
- **Placement matters more than count.** One experiment moved the interstitial ahead of the results screen. Revenue rose about 24% with no change in frequency and no visible rise in frustration `[S: Global Games Forum]`.
- **Disruptive ads drive quitting**: forced redirects and ads that are hard to close `[S: Deloitte/AdMob]`.
- **Google's rules set the floor.** AdMob disallows interstitials on app launch or exit, repeated interstitials, and interstitials that appear unexpectedly while content is in view `[S: AdMob policy]`. On the web, each rewarded ad must be opted into individually `[S: Ad Placement API]`.

**The rules I propose for this game** `[invented, from the above]`:

1. **An ad only ever appears at a boundary the player chose to cross.** Between sets, after they tap "next set". Never inside a round, never on launch, never on exit, never over a result.
2. **The lesson is never behind an ad.** Explaining why something was a fault is what the product is for. Hiding it behind an ad teaches less, and it breaks the "teach nothing false" rule in spirit.
3. **Rewarded ads buy only optional extras**: an exact retry of a missed round (the seed makes it identical), an extra daily set, keeping a streak alive.
4. **At most one interstitial per set** (about 90 s of play), and none in a player's first few sets, so the game earns their patience before spending it.
5. **A one-time purchase removes all interstitials.** This matters more for a test-prep audience than for anyone else (section 5).

---

## 3. The options, compared

| | A. G1 quiz, illustrated by the sim | **B. Your Turn: go when it's yours** | C. Examiner's Eye: spot the fault | D. Highway micro-missions | E. MergeRush |
|---|---|---|---|---|---|
| round length | 10-20 s a question | **8-20 s** | 15-25 s a clip | 30-90 s | 30-60 s |
| reuses | signs, a few sim scenes | **crossing, horn, courtesy, contact, events, seeds, the old situations** | exam, candidates, checks, events | the player model, merge, the highway | nothing of the sim |
| new work | a question bank in our own words, quiz UI | a hold-until-tapped player mode, a round runner, the grading, round content | detectors on an AI car (they read the player now), a marking interaction, clip content | a mission framework, controls teaching | ad wiring only |
| controls | taps | **one tap** | taps | the wheel and slider (needs learning) | a swipe |
| distinctive? | low: the category is full of clones `[S: store search]` | **high: live traffic that reacts to you** | **high: the examiner's view nobody else has** | medium | none |
| ad fit | good | **good: natural set boundaries** | good | weak: missions are long | very good |
| phone cost | trivial | trivial | small | the highway's known problems | trivial |
| main risk | sameness, short user lifetime | content authoring, whether "waiting" is fun | your employment question (section 6), reading faults on a phone | controls and performance | it is not this game |

**B first, C second, A as a content track inside B rather than a separate app, D and E not now.** The reasons:

- **B has the cheapest path to a fun round** and it showcases the thing only this project has: traffic that reads you and reacts.
- **C is the best idea on the list and the riskiest.** It depends on section 6, and the project's own record says reading a fault on a phone screen is hard. EXAMINER-REDESIGN.md's stage 2 failed on scarcity, and "the candidate is a few pixels on a phone" is in CLAUDE.md.
- **Your standing instruction holds** `[Jay, 10.38]`: "I want to avoid adding 50 half-cooked features." One round type at launch, done well.

---

## 4. The recommendation, in detail: Your Turn

### The round

- **The camera is tight on one intersection.** The player's car is at the line, or arriving at it. The round starts about 2 s before the decision, so no time is spent in transit. That is the direct answer to "the cars crawl... most of the screen space is empty" (REBUILD.md): every second on screen is decision time.
- **One control: GO.** Before the tap, the car holds at the line. After it, the car drives its route as an ordinary sim driver.
- **The verdict comes from what the sim did**, read through detectors that mostly exist already:

  | outcome | what the player sees |
  |---|---|
  | **clean** | went inside the window |
  | **forced** | somebody braked hard for you, or honked |
  | **contact** | there was contact |
  | **too early** | you entered space somebody was entitled to, whether or not they reacted |
  | **too slow** | you sat past the window, and the car behind you honks |

  The encroachment rule is already a ruling: "a fault exists independently of any reaction". **The window is derived, never typed in.** It is when a sound driver in your place would go: the same `openTo` the undue-delay clock reads. "Never author the answer" holds as written.
- **The lesson comes after the set, not the round,** so the five-round rhythm stays punchy. Every miss gets a replay of the moment and a sentence or two: your lessons from the old situations where they still hold, re-verified against the new sim.

### The set, the day and progression

- **A set is five rounds** (about 90 s) at increasing difficulty: busier traffic, a weaker driver in the scene (the skill dial exists), worse sightlines (trucks hide things, 10.43 is scoped for buildings).
- **The daily set** is the same five seeded rounds for everyone, with a shareable grid of results in the style of Wordle. This is the main way to grow without paid acquisition, and the deterministic sim makes it nearly free.
- **Rule packs** group rounds by situation:

  | pack | situations |
  |---|---|
  | four-way stops | — |
  | lefts across traffic | — |
  | pedestrians | the near-half rule |
  | roundabouts | — |
  | emergency vehicles | — |
  | signals | right on red, the amber |
  | signs | — |

  This is where the graduated-licensing angle lives without becoming the identity (section 5).

### What is new code, and what is not

- **New:**
  - A player mode that holds at the line until tapped. Today the player either drives with the two controls, or is an AI candidate (`exam.js`) who decides for themselves. This is small and local, but it is a change to `src/sim/` and gets its own check.
  - A round runner: load a tiny map plus arrivals, run, stop at the verdict.
  - Reading the window from a sound driver's `openTo` in the player's place.
  - The results and lesson screen.
  - Ad wiring.
  - The round content.
- **Not new:**
  - right of way, signals, pedestrians, the horn, yielding, contact, the event severities;
  - the renderer and camera (`src/iso/`);
  - storage and the wallet;
  - the editor for authoring rounds.
- **Not touched:** the highway, the city, and the open reds in HANDOFF-2026-11-19.md. Those wait. Pausing them is the cost of this proposal, stated plainly.

### Cost `[D: from PLAN.md's measured pace, "a feature like courtesy gaps or actuated signals: two to four days", assuming that pace holds and rounds take a few hours each to author and verify]`

| step | what | about |
|---|---|---|
| 1 | the hold-until-tapped mode with its check, the round runner, grading from the existing detectors, five rounds | 1-2 weeks |
| 2 | results, lesson and replay screen, sets, the daily set, the share grid, 25-30 rounds | 2-3 weeks |
| 3 | the Android wrap (Capacitor), AdMob with test ads, consent, the store listing, the closed test | 1-2 weeks of work, plus **14 days of waiting** (section 7) |

**First playable: about two weeks. Store-ready: roughly six to eight weeks.** These are derived estimates, not measured.

### What would show this is wrong, checked cheaply before anything else

1. **Is waiting fun?** The old game's whole tension was holding back. If people tap immediately every round, the loop fails. **Test:** five hand-tuned rounds on the existing site, played by you and a few others. Count how many rounds a person plays without being asked to. If most stop before ten, rethink before building more.
2. **Does the verdict read as fair?** A player who feels cheated by a sim decision leaves. **Test:** after each test round, ask "did you see why?" Any round where the answer is "no" is a legibility defect (10.51, 10.52), not a player problem.
3. **Is it readable on your Pixel in the default settings** (10.59)? One intersection should be easy, but nobody has looked.

---

## 5. The graduated-licensing angle, judged on its merits

### For it

- **A defined, motivated audience that searches for help.** "G1 practice test" apps and sites are everywhere `[S]`, which proves the demand. Discovery comes through store search, with no paid acquisition.
- **It plays to your authority.** The rules are Ontario's and you are an Ontario examiner. CLAUDE.md's whole stance (teach nothing false) is a selling point to a parent.
- **The law itself can be quoted.** Statutes and regulations (the Highway Traffic Act) may be reproduced freely `[S: King's Printer]`.

### Against it

- **The G1 test is mostly a knowledge test of the handbook**: road signs and rules, multiple choice, 80% to pass, taken in person `[S: DriveTest; prep sites; the exact count is unpublished, some say 40 questions in two sections of 20]`. A simulator adds little to "what does this sign mean". The sim's advantage is on the rules side (right of way, gaps, pedestrians), and that is only part of the test.
- **The category is saturated.** There are many near-identical G1 apps on both stores, some charging $29.99 for lifetime access `[S: App Store search]`. A new entrant competes on store ranking, not on quality.
- **The user lifetime is short by design.** People study for days or weeks, pass, and leave. Ads pay per session, so a short lifetime caps ad revenue. That favours a one-time purchase over ads alone.
- **Many of the users are 16-17.** Google applies extra ad protections to signed-in users under 18 `[S: Google teen ad protections]`, which in practice means less ad revenue per impression from them. Adult newcomers to Ontario are part of the market too, and are not affected.
- **The market is small.** There is no reliable published count of G1 tests per year `[S: one prep site claims 84,500, uncited]`. My estimate is roughly 170,000 sixteen-year-olds a year `[D: from Ontario's population of about 16 million, assuming about 1.1% in each single year of age]`, plus newcomers. That makes **low hundreds of thousands of people a year at most, each for a few weeks.**
- **The handbook cannot be copied for a commercial product without a licence.** Non-commercial reuse is allowed with credit and no changes, and commercial reuse needs a King's Printer licence `[S: ontario.ca copyright]`. So questions and explanations must be written in our own words, against the law rather than the handbook's text. That is fine, but it is work.

### What it is worth `[D: from the eCPM ranges in section 8, assuming 5% of about 250,000 test-takers install, 10 sessions each, 4 ad impressions a session, $8 per thousand]`

About $0.30 of ad revenue per user, or **low thousands of dollars a year from the Ontario market alone**, plus a removal purchase. **Not a business on its own, but it is a cheap, findable first audience.**

### Verdict

**Use the angle as one track of Your Turn**: rule packs keyed to what Ontario's rules section covers, with an honest store description ("learn right of way the way an examiner sees it", never "pass your G1" and never anything implying MTO endorsement). **Do not make it the identity.** The same game, with the same rounds, plays in Michigan, which CLAUDE.md already asks for ("nothing so provincial that a driver in Michigan finds it wrong").

The niche that really is yours is the road test, not G1: "what an examiner watches for" is something nobody does as a game. That is option C, and it is gated on section 6.

---

## 6. A question only you can answer, before anything uses your role

You are, by the record, an Ontario driving examiner. DriveTest examiners work for a contractor (Serco, under Plenary, for the Ministry) `[S: Infrastructure Ontario; Serco]`. I found no public policy on examiners' outside work `[S: searched, nothing found]`. The topic is sensitive: recent fraud charges and leaked memos about examiners and driving schools `[S: CBC, Trucknews]`.

**Before the game says "made by an examiner", or uses anything from the job:**

- **Is outside commercial work in driver education allowed under your employment, and does it need disclosure or approval?**
- **Is the score sheet public?** DECISIONS 10.26 measured the game against "the real Ontario score sheet". Is that sheet public, or internal material that must stay out of a product?

**Option B never needs any of this**: it teaches the law, which is public. **Option C, and any marketing of your role, does.**

---

## 7. Platform and the ad path, staged so each step is cheap to stop at

1. **Prototype on the existing site, no ads** (step 1 of section 4).
   - It goes on a new route on GitHub Pages, as everything does now.
   - "Do not add analytics... without being asked" still stands, so measurement is by asking testers, plus an on-screen stats card they can screenshot. Nothing leaves the phone.
2. **Two ways to put it in front of strangers. Pick one or both:**
   - **Google Play.** A personal developer account created after 13 November 2023 must run a closed test with **at least 12 testers opted in continuously for 14 days** before production access `[S: Play Console help]`. Organization accounts are reportedly exempt `[S: third-party sources only]`. **That closed test doubles as the retention test, so it is not wasted time.** The wrap is Capacitor, which SETUP.md and the 17 October handoff already name, with a community AdMob plugin. AdMob does not run on the web, so the web build keeps its own path `[S: Capacitor AdMob plugins]`. Expect a consent screen and Play's Data safety form, because ads make network calls and collect data.
   - **The web, through a game portal.** CrazyGames starts a game in a "Basic Launch" with no ads and no SDK, and moves it to a full launch with its ads after review. Its download limits sit far above this app's 131 KB gzipped `[S: CrazyGames docs]`. That reaches a general, international audience for free, which suits Your Turn as a game but not the Ontario angle. Google's own web-game ads (the Ad Placement API) are the alternative for a self-hosted site; that program has been in closed beta `[S]`, so check before counting on it.
3. **The repository is public**, because GitHub Pages on a free plan needs it (SETUP.md). For a commercial product that publishes the code and all the content. **Decide before launch** whether to make it private and host elsewhere: SETUP.md already names Netlify and Vercel.

**My recommendation** `[invented]`: prototype on the site (step 1), then run the Play closed test with the Ontario track as the store positioning, then a portal release of the general game if the closed test says the loop holds. Play first, because the Ontario audience searches there and the 14-day wait starts the clock early.

---

## 8. Revenue, stated so nobody is surprised

The published figures disagree several-fold, so treat them as orders of magnitude `[S]`:

| figure | value |
|---|---|
| Canada, Android rewarded eCPM | about $7.80 per thousand (2023) |
| Canada, Android interstitial eCPM | about $8.60 per thousand (undated) |
| ads-only casual ARPDAU | $0.01-0.05 |
| hybrid (ads plus a purchase) ARPDAU | $0.15-0.50 |
| median retention, all mobile games | 22% on day 1, under 4% on day 7 |

`[D: from those, assuming $0.03 a day per active player]` 1,000 daily players earn about $30 a day. **An ad-funded game is a volume business.** Without paid acquisition it pays only if the daily share loop or store search brings people in. So the short-term game's realistic value is in this order:

1. proving the loop with strangers;
2. building an audience the long game can later reach;
3. income.

Say this to yourself before the first payout, not after.

---

## 9. Decisions waiting on you

1. **Do you want this over resuming the highway order?** The highway work pauses while this is built, about two weeks to first playable.
2. **Option B as the launch game, one round type** (sections 3-4), or a different choice?
3. **Section 6**: your employer's position, and whether the score sheet is public.
4. **The Ontario angle as a track and the store positioning, not the identity** (section 5)?
5. **Platform order** (section 7): Play first, a portal first, or both, and a personal or an organization developer account?
6. **Monetization rules** (section 2): rewarded for extras only, at most one interstitial a set, never before the first few sets, a one-time removal purchase. Any price in mind?
7. **The name.** "Right of Way" was set aside for PRNDL and then PRNDL was put on hold (CLAUDE.md), so this is open.
8. **Whether the repository stays public** once the product is commercial.

---

## Sources

- G1 format and fees: [DriveTest: knowledge tests](https://drivetest.ca/tests/knowledge-tests/), [open-exam-prep: format](https://open-exam-prep.com/study-guides/on-g1-test/getting-your-drivers-licence/knowledge-test-format-procedures), [g1.ca: how many questions](https://www.g1.ca/driving-tips/how-many-questions-are-on-g1-test), [tests.ca](https://m.tests.ca/ontario/g1-test-online)
- Test volumes (none official): [knowledgetest.ca](https://knowledgetest.ca/ontario/g1-test-pass-rate-and-tips/), [greenhorndriving.ca](https://greenhorndriving.ca/blog/g1-test-toronto-downsview), [driveiqcanada.com](https://driveiqcanada.com/blog/g1-test-fail-rate-ontario/)
- Graduated licensing: [ontario.ca: new drivers](https://www.ontario.ca/page/get-g-drivers-licence-new-drivers), [DriveTest: licences](https://drivetest.ca/licences/drivers), [CAA SCO](https://www.caasco.com:443/insurance/resource-centre/graduated-licensing)
- Competition: [Google Play: G1 practice test Ontario 2026](https://play.google.com/store/apps/details?id=g1.ca), [App Store: G1 Driver's Test Ontario 2026](https://apps.apple.com/app/id6450638566), [App Store: G1 Practice Test Ontario 2025](https://apps.apple.com/app/id1557454493)
- Ad tolerance: [PocketGamer.biz: ad quality and churn](https://www.pocketgamer.biz/what-our-data-reveals-about-ad-quality-and-player-churn-in-mobile-games/), [Global Games Forum: in-game ad experiments](https://www.globalgamesforum.com/news/5-surprises-from-in-game-ad-experiments), [Deloitte: improve mobile game advertising](https://www.deloitte.com/us/en/industries/tmt/articles/improve-mobile-game-advertising.html), [Unity: rewarded ads and retention](https://unity.com/blog/understanding-the-impact-of-rewarded-ads-on-iap-retention-and-engagement)
- Ad policy: [AdMob: disallowed interstitial implementations](https://support.google.com/admob/answer/6201362?hl=en), [Google: splash pages and launch interstitials](https://blog.google/products/admob/using-splash-pages-to-avoid-unexpected-launch-interstitials/), [AdMob 2024 policy recap](https://services.google.com/fh/files/misc/2024_publisher_policies_recap_admob.pdf), [Ad Placement API](https://developers.google.com/ad-placement/apis), [Ad-serving protections for teens](https://support.google.com/publisherpolicies/answer/11975916), [Play: Families and target audience](https://support.google.com/googleplay/android-developer/answer/9893335?hl=en-GB)
- eCPM and benchmarks: [Statista: Canada rewarded eCPM, Android](https://statista.com/statistics/1401628/ecpm-rewarded-ads-android-canada), [Udonis: eCPMs](https://www.blog.udonis.co/mobile-marketing/mobile-apps/ecpms), [playio: eCPM benchmarks 2026](https://blog.playio.co/mobile-game-ecpm-benchmarks-2026), [Appodeal eCPM report](https://appodeal.com/the-mobile-ecpm-report-updated-q4-2024-view), [GameAnalytics 2025 benchmarks](https://gamedevreports.substack.com/p/gameanalytics-mobile-gaming-benchmarks), [App Developer Magazine: casual benchmarks 2025](https://appdevelopermagazine.com/mobile-casual-benchmarks-report-2025/), [Game Growth Advisor: KPIs 2026](https://gamegrowthadvisor.com/blog/2026-03-17-mobile-game-kpis-benchmarks-2026/)
- Platforms: [Play Console: testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en), [Android Authority on the requirement](https://www.androidauthority.com/google-play-app-testing-requirement-3510580), [Capawesome: Capacitor AdMob](https://capawesome.io/docs/blog/announcing-the-capacitor-admob-plugin/), [@capacitor-community/admob](https://socket.dev/npm/package/@capacitor-community/admob), [CrazyGames docs](https://docs.crazygames.com/requirements/intro/), [CrazyGames technical requirements](https://docs.crazygames.com/requirements/technical/), [CrazyGames ads requirements](https://docs.crazygames.com/requirements/ads/)
- Copyright: [ontario.ca: copyright information](https://www.ontario.ca/page/copyright-information), [Open Government Licence – Ontario](https://ontario.ca/page/open-government-licence-ontario), [MTO Driver's Handbook](https://www.ontario.ca/document/official-mto-drivers-handbook)
- Examiner employment context: [Infrastructure Ontario: Drivers Examination Services](https://infrastructureontario.ca/Drivers-Examination-Services/), [Serco: drivers examination services](https://www.serco.com/ca/citizen-services/drivers-examination-services), [CBC: leaked memo](https://amp.cbc.ca/lite/story/1.7348425), [Trucknews: exam fraud charges](https://www.trucknews.com/security/eight-face-charges-over-ontario-commercial-driver-exam-fraud/1003208045/), [Auditor General 2023](https://www.auditor.on.ca/en/content/annualreports/arreports/en23/AR_drivertraining_en23.pdf)
