#!/usr/bin/env python3
"""Task B: two full shifted suites in a frozen archive under tools/scratch.
Usage: python tools/seed-inventory.py --ref origin/main --shifts 11 29
Requires the existing Node dependencies and Python 3.12+; installs nothing.
No application source, existing check assertions or sample sizes are edited.
Metadata is reset between runs and restored on exit. All evidence stays in
its named scratch directory; copy the final report into tools/ for review.
Hook coverage is source seedGraph only, not every RNG or compiled copy.
"""
from pathlib import Path
import argparse, collections, hashlib, io, json, os, shutil, subprocess, tarfile, time
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--ref', default='origin/main')
parser.add_argument('--shifts', nargs=2, type=int, default=[11, 29])
parser.add_argument('--jobs', type=int, default=3)
parser.add_argument('--timeout', type=int, default=2400)
args = parser.parse_args()
assert args.jobs > 0 and args.timeout > 0 and len(set(args.shifts)) == 2 and all(args.shifts)
ref = subprocess.check_output(['git', 'rev-parse', args.ref], cwd=ROOT, text=True).strip()
name = 'seed-inventory-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
out = ROOT/'tools/scratch'/name
out.mkdir(parents=True)
work = out/'tree'
work.mkdir()
archive = subprocess.check_output(['git', 'archive', ref], cwd=ROOT)
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:') as stream:
    stream.extractall(work, filter='data')
for file in ['seed-shift.mjs', 'seed-shift-test.mjs']:
    shutil.copy2(ROOT/'tools'/file, work/'tools'/file)
metadata = ['check-times.json', 'check-history.jsonl', 'check-hashes.json']
saved = {file: (work/'tools'/file).read_bytes() for file in metadata}
for file, data in saved.items():
    (out/('original-' + file)).write_bytes(data)
expected = {f.stem for f in (work/'tools').glob('verify-*.mjs')}
def manifest():
    files = [p for base in ['src', 'tools'] for p in (work/base).rglob('*')
             if p.is_file() and p.suffix in ('.js', '.mjs', '.jsx', '.cjs')
             and 'scratch' not in p.relative_to(work).parts]
    return {str(p.relative_to(work)): hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
original = manifest()
report = {'source_ref': ref, 'shifts': args.shifts, 'jobs': args.jobs,
          'timeout_seconds': args.timeout, 'expected_checks': sorted(expected),
          'coverage_limit': 'Only source src/sim/crossing.js seedGraph is hooked. Other RNG entry points and bundled copies are not shifted. Counters from killed threads are lower bounds.',
          'runs': []}
(out/'source-manifest.json').write_text(json.dumps(original, indent=2)+'\n')
(ROOT/'tools/scratch/seed-inventory-latest.json').write_text(json.dumps({'directory': str(out), 'source_ref': ref})+'\n')
try:
    proof = subprocess.run(['node', 'tools/seed-shift-test.mjs'], cwd=work, capture_output=True, text=True)
    (out/'hook-proof.log').write_text(proof.stdout + proof.stderr)
    if proof.returncode:
        raise RuntimeError('hook proof failed on frozen main; see hook-proof.log')
    report['hook_proof_passed'] = True
    for shift in args.shifts:
        for file, data in saved.items():
            (work/'tools'/file).write_bytes(data)
        evidence = out/f'evidence-{shift}'
        env = os.environ.copy()
        env['CHECK_SEED_SHIFT'] = str(shift)
        env['CHECK_SEED_EVIDENCE'] = str(evidence)
        env['NODE_OPTIONS'] = (env.get('NODE_OPTIONS', '') + ' --import=' + str(work/'tools/seed-shift.mjs')).strip()
        command = ['node', 'tools/check.mjs', '--all', '--jobs', str(args.jobs), '--timeout', str(args.timeout)]
        start = time.monotonic()
        with (out/f'shift-{shift}.log').open('w') as log:
            child = subprocess.Popen(command, cwd=work, env=env, stdout=log, stderr=subprocess.STDOUT)
            (out/'active.json').write_text(json.dumps({'shift': shift, 'pid': child.pid})+'\n')
            code = child.wait()
        history = json.loads((work/'tools/check-history.jsonl').read_text().splitlines()[-1])
        (out/f'shift-{shift}-history.json').write_text(json.dumps(history, indent=2)+'\n')
        results = history['results']
        if len(results) != len(expected) or {r[0] for r in results} != expected:
            raise RuntimeError(f'shift {shift}: missing/duplicate check results')
        records = [json.loads(f.read_text()) for f in evidence.glob('*.json')]
        parents = {r['pid']: Path(r['entry']).stem for r in records if r['isMainThread']}
        coverage = {name: {'calls': 0, 'worker_calls': 0, 'lower_bound': False} for name in expected}
        for record in records:
            name = parents.get(record['pid'])
            if name not in coverage:
                continue
            for sample in record['samples']:
                if sample['after'] != (int(sample['before']) + shift) % (2**32):
                    raise RuntimeError('seed evidence contradicts configured shift')
            item = coverage[name]
            item['calls'] += record['calls']
            if not record['isMainThread']:
                item['worker_calls'] += record['calls']
            if record['calls'] and not record['exitObserved']:
                item['lower_bound'] = True
        if not any(item['calls'] for item in coverage.values()):
            raise RuntimeError('hook shifted no seeds')
        if manifest() != original:
            raise RuntimeError('source/check files changed during experiment')
        report['runs'].append({'shift': shift, 'exit': code, 'wall_seconds': round(time.monotonic()-start, 3),
                               'results': results, 'counts': dict(collections.Counter(r[1] for r in results)),
                               'coverage': coverage, 'without_seedGraph_calls': sorted(n for n,v in coverage.items() if not v['calls'])})
        (out/'inventory.json').write_text(json.dumps(report, indent=2)+'\n')
    report['complete'] = True
except BaseException as error:
    report['error'] = str(error)
    raise
finally:
    for file, data in saved.items():
        (work/'tools'/file).write_bytes(data)
    report['metadata_restored'] = all((work/'tools'/f).read_bytes() == data for f,data in saved.items())
    (out/'inventory.json').write_text(json.dumps(report, indent=2)+'\n')
    (out/'active.json').unlink(missing_ok=True)
