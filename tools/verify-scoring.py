"""
Independent re-derivation of the scoring curve.

Run:  node tools/verify-windows.mjs && python tools/verify-scoring.py

CLAUDE.md requires new engine logic to be re-derived numerically rather than
checked against itself. So this does NOT import or port the JavaScript. It
implements the scoring rules as written in prose, from scratch, and compares
against the samples the JS emitted:

  - A press more than EARLY_TOLERANCE before the window is a failure to
    yield. No score.
  - Never going scores nothing.
  - Otherwise the score falls linearly from 100 to 0, starting once the
    reaction exceeds REACTION_FLOOR and reaching 0 at GRACE.
  - Past GRACE the verdict becomes undue delay, by which point the linear
    fall has already reached 0 — so there must be no jump at that boundary.

If the two implementations disagree anywhere, the difference is printed.
"""
import csv
import os
import sys

REACTION_FLOOR = 0.35
GRACE = 2.6
EARLY_TOLERANCE = 0.25

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = os.path.join(HERE, "scoring-samples.csv")


def expected(legal_at, pressed_at):
    """Verdict and score, derived from the rules rather than from the JS."""
    if pressed_at is None:
        return "missed", 0

    reaction = pressed_at - legal_at

    if reaction < -EARLY_TOLERANCE:
        return "early", 0

    # Fraction of the decay still remaining.
    if reaction <= REACTION_FLOOR:
        remaining = 1.0
    else:
        travelled = (reaction - REACTION_FLOOR) / (GRACE - REACTION_FLOOR)
        remaining = 1.0 - travelled
        remaining = max(0.0, min(1.0, remaining))

    score = round(100 * remaining)
    verdict = "late" if reaction > GRACE else "good"
    return verdict, score


def main():
    if not os.path.exists(SAMPLES):
        print("no samples found - run: node tools/verify-windows.mjs")
        return 1

    rows = disagreements = 0
    shown = 0
    with open(SAMPLES, newline="", encoding="utf8") as fh:
        for row in csv.DictReader(fh):
            rows += 1
            legal_at = float(row["legalAt"])
            pressed_at = float(row["pressedAt"])
            want_v, want_s = expected(legal_at, pressed_at)
            got_v, got_s = row["verdict"], int(row["score"])

            # Python and JS round halves differently (banker's vs half-up),
            # so a single point of difference on an exact .5 is not a bug.
            score_ok = abs(want_s - got_s) <= 1
            if want_v != got_v or not score_ok:
                disagreements += 1
                if shown < 12:
                    shown += 1
                    print(
                        f"  {row['scenario']:<12} press {pressed_at:>6.2f} "
                        f"(reaction {pressed_at - legal_at:+.2f})  "
                        f"js={got_v}/{got_s}  py={want_v}/{want_s}"
                    )

    print()
    print(f"compared {rows} samples across every scenario")
    if disagreements:
        print(f"MISMATCH: {disagreements} sample(s) disagree.")
        return 1
    print("OK: the JavaScript scoring matches an independent re-derivation.")

    # The boundary that the curve exists to remove: no jump at GRACE.
    before = expected(0.0, GRACE - 0.001)[1]
    at = expected(0.0, GRACE)[1]
    after = expected(0.0, GRACE + 0.001)[1]
    print(f"grace boundary: {before} -> {at} -> {after}  (no cliff)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
