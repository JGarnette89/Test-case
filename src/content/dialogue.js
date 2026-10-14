/* =====================================================================
   THE LINES -- A.U.T.O., Jay and the rivals, keyed by trigger and speaker
   (DIALOGUE.md). Written 14 October to the record's spec (no external file
   is coming): per trigger five or six from A.U.T.O., four or five from Jay,
   one or two from a rival where one is the other party or the place is
   theirs. Every line under 90 characters, metric. A.U.T.O. is correct on
   the stop rule -- a complete stop, no time stated; Brenda's three seconds
   are her own. A line with `when` is said only in that context (night,
   race).

   Data, not code: the voice (sim/voice.js) reads it as it is. Ids are
   derived (trigger-speaker-n), so a line is never said twice in a session.
   ===================================================================== */
const RAW = {
  collision: {
    auto: ["Contact registered. Vehicle and incident logged.", "Collision. Grid response dispatched. Remain where you are.", "Impact detected. This will appear on your record.", "Collision event. Liability assessment pending.", "Two vehicles occupied one space. That is not permitted."],
    jay: ["Okay. Breathe. Look at what you were watching, and what you weren't.", "That's the one thing we never do. Slow everything down.", "Contact. Next time, the gap you're unsure of is the gap you don't take.", "Stop. Hazards on. Then we talk about where your eyes were."],
    victor: ["Should've moved, sunshine."],
    mason: ["Lost my line and my position. Brilliant.", { text: "That cost me the whole race. Brilliant.", when: "race" }],
  },
  ranRed: {
    auto: ["Red signal violation. Image captured.", "Entry on red recorded. Intersection 4B notified.", "Signal was red. Your vehicle was not stopped.", "Infraction: proceeding against a red indication.", "The light was red. The record will say so."],
    jay: ["That was red. Not stale amber. Red.", "If you're asking whether you can make it, you can't.", "Amber means stop if you safely can. You could have.", "Red light. That's the one that ends tests on the spot."],
    victor: ["Red's a suggestion if you're quick enough."],
  },
  rolledStop: {
    auto: ["Stop sign: the vehicle did not come to a complete stop.", "Rolling stop logged. Wheels must cease rotation.", "A stop is zero kilometres per hour. You did not reach it.", "Incomplete stop at a controlled intersection.", "Stop sign compliance: failed. Momentum maintained."],
    jay: ["That wasn't a stop. That was a slow-down with good intentions.", "Full stop. Wheels still. Then you look. Then you go.", "Feel the car settle back on its springs. That's a stop.", "Rolling through is the habit that gets people hurt."],
    brenda: ["I always count three seconds at a stop. Always."],
    victor: ["Nobody was coming. I checked. Mostly."],
  },
  blockingBox: {
    auto: ["Vehicle stationary in the intersection. Cross traffic obstructed.", "Do not enter an intersection you cannot clear.", "Intersection blocked. Flow penalty applied to your corridor.", "Obstruction detected in the box.", "Your vehicle is in the conflict area and not moving."],
    jay: ["Never go in unless you can get out the other side.", "Wait at the line until there's room past the box.", "You're sitting where everyone else needs to drive.", "If the far side's full, the box isn't yours yet."],
    brenda: ["I'd never. I wait for the whole street to clear."],
  },
  harshBraking: {
    auto: ["Deceleration exceeded comfort threshold.", "Harsh braking event. Following distance insufficient.", "Abrupt stop recorded. Occupant comfort index reduced.", "Braking force excessive for conditions.", "Late braking detected. Anticipation rating lowered."],
    jay: ["You saw that coming two hundred metres ago. Use them.", "Smooth is fast. Get off the gas earlier.", "If your passenger's hand hits the dash, you braked too late.", "Look further up the road and the brake gets gentle."],
    hannah: ["Brake like that on gravel and you're in the ditch."],
  },
  lateSignal: {
    auto: ["Signal activated late. Minimum lead not met.", "Turn indication insufficient in advance.", "Signal duration below standard before the manoeuvre.", "Late signal. Following drivers were not informed in time.", "The signal came on as the wheel turned."],
    jay: ["Two to three seconds before you turn. Not as you turn.", "A signal that late tells nobody anything.", "Signal first, then brake, then turn.", "Give them time to read you. That's what it's for."],
  },
  noSignal: {
    auto: ["Turn completed without indication.", "No signal. Intent not communicated.", "Unsignalled turn recorded.", "Direction change without a signal.", "Signal absent for a turning movement."],
    jay: ["Nobody knew you were turning. Including the car behind you.", "Every turn gets a signal. Every one.", "That lane turns. You still tell people.", "No signal, no warning. Don't make them guess."],
  },
  tightGap: {
    auto: ["Lane change into insufficient headway.", "Merge gap below safe threshold for the following vehicle.", "Cut-in detected. Following vehicle forced to brake.", "Lane change rejected by safety model. Executed anyway.", "Headway violated on entry."],
    jay: ["That gap was for a motorbike, not you.", "Check the mirror, check the gap, then decide. In that order.", "If the car behind has to brake, you took their space.", "Wait for a gap you'd be happy to be on the other end of."],
    victor: ["They'll brake. They always brake."],
    mason: ["Tight, but I had it. You didn't."],
  },
  honkedAt: {
    auto: ["Audible complaint registered against your vehicle.", "Another driver has flagged your conduct.", "Horn event directed at you. Conduct under review.", "Peer feedback received.", "A road user has expressed dissatisfaction."],
    jay: ["They're honking for a reason. Find it.", "Don't get angry. Ask what you did to earn that.", "A horn is information. What were you doing just then?", "Somebody wanted you moving. Were you holding them up?"],
    victor: ["Move it or lose it!"],
    brenda: ["Oh, sorry! Sorry. I'm going."],
  },
  stoppedShort: {
    auto: ["Stopped short of the line.", "Vehicle position: behind the stop line.", "Stopping position incorrect. The line is further forward.", "Incorrect stopping position.", "Stop line is further forward."],
    jay: ["Pull up to the line. Stop where you can see and be seen.", "The line is where the road wants you. Use it.", "That far back, nobody knows you're waiting.", "Stop at the line, not near it."],
    brenda: ["I like to leave a little extra room. Just in case."],
  },
  dawdling: {
    auto: ["Path clear. Vehicle not proceeding.", "Unnecessary delay at an open intersection.", "You have right of way. Proceed.", "Flow obstruction: vehicle idle with a clear path.", "Hesitation logged."],
    jay: ["It's yours. Go.", "Waiting when it's clear is its own kind of unsafe.", "Nobody's coming. Trust what you just checked.", "Decide, then commit. You already checked."],
    brenda: ["I just like to be sure. Very, very sure."],
  },
  missedTurn: {
    auto: ["Requested turn not executed.", "Route deviation. Recalculating.", "Wrong lane for the indicated turn.", "Turn signalled, turn not taken.", "Navigation intent and lane disagree."],
    jay: ["You wanted left. The lane went straight. Get over earlier.", "Plan the lane a block ahead, not at the line.", "Missed it. Don't swerve for it. Take the next one.", "Wrong lane for that turn. Read the arrows sooner."],
  },
  wideTurn: {
    auto: ["Turning radius exceeded the lane.", "Vehicle crossed into the adjacent lane on the turn.", "Wide turn. Lane discipline not maintained.", "Exit lane overrun.", "Turn geometry outside tolerance."],
    jay: ["Finish the turn in the lane you started for.", "Slower in, tighter line, smoother out.", "You swung wide. Look where you want the car to end up.", "Hand over hand, and look through the turn."],
    hannah: ["Wide's fine on a farm lane. Not here."],
  },
  waveLost: {
    auto: ["Excess speed. Signal coordination forfeited.", "Your speed broke the wave. Red issued.", "Corridor timing assumes the posted speed. You did not hold it.", "Progression lost to speeding.", "Faster arrived at a red. As calculated."],
    jay: ["The lights are timed for the limit. Faster just gets you a red.", "You were riding the wave and raced past it.", "Hold the limit and the greens hold for you.", "Speeding bought you a red light. Bad trade."],
    mason: ["Ha. Faster isn't always quicker, is it?"],
  },
  notKeepingRight: {
    auto: ["Left lane occupancy without cause.", "Keep right except to pass.", "Lane discipline: return to the curb lane.", "Passing lane in use while not passing.", "You are obstructing faster traffic."],
    jay: ["Done passing? Then move back right.", "The left lane's for overtaking, not cruising.", "Keep right unless you're going somewhere.", "Somebody wants by. Let them."],
    victor: ["Get out of my lane!"],
  },
  underLimit: {
    auto: ["Speed well below the posted limit. Flow impeded.", "Vehicle underperforming the corridor speed.", "Minimum flow rate not met.", "Your speed is causing a queue.", "Posted limit is a target, not a ceiling to avoid."],
    jay: ["Clear road. You can use the limit.", "Too slow is its own hazard. People pass badly.", "Bring it up to speed. You've got room.", "Match the road. Not slower, not faster."],
    brenda: ["Slow and steady. That's what I always say."],
  },
  waveCaught: {
    auto: ["Signal progression achieved. Corridor efficiency noted.", "Green wave sustained. Compliance rewarded.", "Three greens. Optimal speed maintained.", "Your speed matches the corridor plan.", "Flow alignment confirmed."],
    jay: ["Feel that? Hold the limit and the city opens up.", "That's the rhythm. Don't chase it, just keep it.", "Green after green. That's what smooth gets you.", "This is why we drive the limit, not past it."],
  },
  stoppedForPed: {
    auto: ["Pedestrian priority observed.", "Correct yield to a pedestrian.", "Crosswalk compliance confirmed.", "Pedestrian protected. Conduct noted.", "Yield to pedestrian: complete."],
    jay: ["Good. People first, always.", "That's right. They have the crosswalk.", "Nice and early. They never felt rushed.", "Wait till they're well clear of your half."],
  },
  letSomeoneIn: {
    auto: ["Merge accommodation provided.", "You created a gap for another road user.", "Cooperative driving event recorded.", "Courtesy gap issued. Flow preserved.", "Merging vehicle accommodated."],
    jay: ["Nice. That's how traffic is supposed to work.", "Letting them in cost you a second and saved a mess.", "Good courtesy. They'll pay it forward. Maybe.", "That's a driver who thinks about the whole road."],
    brenda: ["Oh, how kind of you!"],
  },
  cleanRun: {
    auto: ["Two kilometres without an infraction.", "Clean distance logged.", "No violations detected over the last segment.", "Compliance streak: two kilometres.", "Record unchanged. Continue."],
    jay: ["Two clean kilometres. That's how it should feel.", "Nothing to say for a while. That's a compliment.", "Smooth, quiet, legal. Keep it there.", "That stretch was textbook."],
  },
  streak: {
    auto: ["Five minutes without an infraction.", "Sustained compliance noted.", "Five-minute clean interval recorded.", "No deviations in the current interval.", "Driver assessment trending positive."],
    jay: ["Five minutes and nothing to fix. Look at you.", "That's a habit forming. A good one.", "Steady. That's the whole job.", "Five clean minutes. Now make it ten."],
  },
  letIn: {
    auto: ["Merge completed in an offered gap.", "Gap acceptance: correct.", "Lane change accommodated by another driver.", "Cooperative merge recorded.", "Merge efficiency nominal."],
    jay: ["Somebody made room. Give them a wave.", "Good, you saw the gap and took it.", "That's the signal working. Use it early.", "Signal on time and people let you in."],
  },
  highwayMerge: {
    auto: ["Highway entry at corridor speed.", "Merge velocity matched.", "On-ramp acceleration adequate.", "Entry gap accepted at speed.", "Highway merge nominal."],
    jay: ["Up to speed on the ramp. That's the whole trick.", "Matching their speed is what makes a merge easy.", "Good merge. Mirror, signal, shoulder, go.", "You made it look simple. It isn't."],
  },
  arrived: {
    auto: ["Destination reached.", "Arrival logged. Route complete.", "You have arrived. Trip recorded.", "Destination confirmed. Vehicle stationary.", "Route complete. Efficiency noted."],
    jay: ["That's the place. Nice and easy to the curb.", "Here we are. Check your mirror before the door opens.", "Arrived. Pull in tight, wheels straight.", "Good. That's a trip, start to finish."],
  },
  passedTruck: {
    auto: ["Heavy vehicle passed.", "Overtake of a commercial vehicle completed.", "Large vehicle cleared.", "Pass completed.", "Blind zone exited."],
    jay: ["Don't hang beside a truck. Pass or drop back.", "Good. Don't sit in their blind spot.", "Clean pass. Make sure you see their lights before you move over.", "Trucks need room. You gave it."],
    hannah: ["Pass 'em clean and let 'em breathe."],
  },
};

/* Flattened, with ids. */
export const LINES = Object.fromEntries(Object.entries(RAW).map(([trigger, by]) => [trigger, Object.entries(by).flatMap(([speaker, list]) => list.map((l, i) => {
  const line = typeof l === "string" ? { text: l } : l;
  return { id: `${trigger}-${speaker}-${i + 1}`, speaker, ...line };
}))]));

/* Who the speakers are, for the caption. */
export const SPEAKERS = { auto: "A.U.T.O.", jay: "Jay", victor: "Victor", brenda: "Brenda", mason: "Mason", hannah: "Hannah" };
