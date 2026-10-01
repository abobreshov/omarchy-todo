import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';
import { task } from './p2-helpers.mjs';
process.env.TZ = 'Europe/London';
const O = lib('Order.js');
const sorted = tasks => tasks.slice().sort(O.compareOpen).map(t => t.id);
const latch = (it, block, order = 0) => ({ item: { ...it, status: 'done' }, latch: O.latchOf(it, block, 's1', order) });
const placed = (open, held, cmp) => O.placeLatched(open.slice().sort(cmp || O.compareOpen), held, cmp).map(t => Number(t.id));

test('priority first, zero above unset, numeric IDs before temporary IDs (AC-ST.39)', () => {
  const tasks = [task(6, { status: 'doing' }), task(4, { priority: 50 }), task(5, { priority: 50, horizon: 'mid' }), task(7, { priority: 90, horizon: 'long' })];
  assert.deepEqual(sorted(tasks), ['7','4','5','6']);
  assert.deepEqual(sorted(tasks.map(t => ({ ...t, priority: null }))), ['6','4','5','7']);
  assert.deepEqual(sorted([task('t1'), task(10), task(2), task(9, { priority: 0 })]), ['9','2','10','t1']);
  assert.equal(O.compareId(task('t1'), task('t2')), 0);
  assert.ok(O.comparePriority({}, task(1, { priority: 0 })) > 0);
  assert.equal(O.statusRank(task(1, { status: 'done' })), 2);
  assert.ok(O.compareSection(task(3), task(2)) > 0);
});

test('crossing peers, one-sided drop, deletion, newcomer, started peer (AC-ST.40)', () => {
  const a = task(1, { priority: 100 }), l = task(2, { priority: 50 }), b = task(3, { priority: 0 });
  const held = latch(l, [a,l,b]);
  assert.deepEqual(placed([{ ...a, priority: 0 }, { ...b, priority: 100 }], [held]), [3,2,1]);
  assert.deepEqual(placed([{ ...a, priority: 0 }, b], [held]), [1,2,3]);
  assert.deepEqual(placed([b], [held]), [2,3]);
  // AC-ST.40's #3-deletion line says [2,1], but the contract's recorded-peer
  // count still includes A(100): k=1. Keep the §24.4 algorithm and flag it.
  assert.deepEqual(placed([{ ...a, priority: 0 }], [held]), [1,2]);
  assert.deepEqual(placed([], [held]), [2]);
  assert.deepEqual(placed([a,b,task(4, {priority:75})], [held]), [1,4,2,3]);
  const plain = [task(1),task(2),task(3)];
  assert.deepEqual(placed([plain[0],{...plain[2],status:'doing'}], [latch(plain[1],plain)]), [3,1,2]);
  assert.deepEqual(placed([plain[2]], [latch(plain[1],plain)]), [2,3]);
  assert.deepEqual(placed([plain[0]], [latch(plain[1],plain,1), latch(plain[2],plain,2)]), [1,2,3]);
  const tied = [task('t1'),task('t2')];
  assert.deepEqual(O.placeLatched([], [latch(tied[1],tied,2),latch(tied[0],tied,1)]).map(t=>t.id), ['t1','t2']);
  assert.deepEqual(O.placeLatched([a]), [a]);
  assert.equal(O.recorded(a, null).priority, 100);
});

test('local midnight, DST and month end; invalid instants are in no window (AC-37.5)', () => {
  assert.equal(O.dayStartOf(Date.parse('2026-09-30T22:20:00+01:00')), Date.parse('2026-09-30T00:00:00+01:00'));
  const day = O.dayStartOf(Date.parse('2026-10-25T23:30:00Z'));
  assert.equal(day, Date.parse('2026-10-24T23:00:00Z'));
  assert.equal(O.daysBefore(O.dayStartOf(Date.parse('2026-10-26T12:00Z')),1), day);
  assert.equal(O.daysBefore(O.dayStartOf(Date.parse('2026-11-01T12:00Z')),1), Date.parse('2026-10-31T00:00Z'));
  assert.equal(O.dayKey(day), '2026-10-25');
  const done = task(1, {status:'done', completedAt:'2026-10-25T23:30:00Z'});
  assert.equal(O.inTail(done,day), true);
  assert.equal(O.inTail({...done,completedAt:'2026-10-24T22:59:59Z'},day), false);
  for (const completedAt of [null, 'invalid', undefined]) {
    const it = {...done,completedAt};
    assert.ok(Number.isNaN(O.completedMs(it)));
    assert.equal(O.inTail(it,day), false); assert.equal(O.inWindow(it,day), false);
  }
  assert.equal(O.inWindow({...done,status:'todo'},day), false);
  assert.equal(O.DONE_DAYS,7);
});

test('done order and reopen placement use instants then id, never priority', () => {
  const a=task(1,{status:'done',completedAt:'2026-09-30T09:00Z',priority:100});
  const b=task(2,{status:'done',completedAt:'2026-09-30T15:00Z'});
  const c=task(3,{status:'done',completedAt:b.completedAt});
  assert.deepEqual([a,c,b].sort(O.compareDone).map(t=>t.id), ['2','3','1']);
  assert.deepEqual(O.placeReopened([{...b,status:'todo',completedAt:null},a,c],{2:b.completedAt}).map(t=>t.id), ['2','3','1']);
  assert.deepEqual(O.placeReopened([a,b]).map(t=>t.id), ['2','1']);
});
