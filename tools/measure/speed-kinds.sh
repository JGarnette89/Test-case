#!/bin/sh
# Crash KINDS for the speed-range ruling, highway, perception+brake-reaction world, seeds 1-12: usage speed-kinds.sh <repo root> <label>
R=/c/Users/yyzga/Documents/dd-realpos; cd $1; OUT=$R/tools/scratch/speed-kinds-$2.txt; : > $OUT
for seed in 1 2 3 4 5 6 7 8 9 10 11 12; do
  for m in test-highway test-loop; do
    (echo "$m $seed $(PERC=1 BR=1 MAP=$m CARS=150 node tools/measure/crash-matrix.mjs $seed 2>&1 | grep -o '"kinds":{[^}]*}')" >> $OUT) &
  done; wait
done
echo DONE >> $OUT
