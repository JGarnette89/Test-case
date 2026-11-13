#!/bin/sh
# Crash counts for the speed-range ruling (DECISIONS 10.71): usage speed-crash.sh <label>. Two worlds (the played world; perception + brake reaction on), two highway maps, seeds 1-4, 4 at a time.
L=$1; OUT=tools/scratch/speed-crash-$L.txt; : > $OUT
run() { echo "$1 $2 seed $3 [$4] $(env $4 MAP=$1 CARS=$2 node tools/measure/crash-matrix.mjs $3 2>&1 | grep -o '"crashes":[0-9]*')" >> $OUT; }
for seed in ${SEEDS:-1 2 3 4}; do
  for m in "test-highway 150" "test-loop 150"; do set -- $m
    run $1 $2 $seed "PLAYED=1" &
    run $1 $2 $seed "PERC=1 BR=1" &
  done; wait
done
echo DONE >> $OUT
