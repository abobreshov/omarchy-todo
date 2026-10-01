import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';
import { task, streams } from './p2-helpers.mjs';
process.env.TZ = 'Europe/London';
const O = lib('Order.js');
const sorted = tasks => tasks.slice().sort(O.compareOpen).map(t => t.id);
const latch = (it, block, order = 0) => ({ item: { ...it, status: 'done' }, latch: O.latchOf(it, block, 's1', order) });
const placed = (open, held, cmp) => O.placeLatched(open.slice().sort(cmp || O.compareOpen), held, cmp).map(t => Number(t.id));

test('doing first, then priority, zero above unset, numeric IDs before temporary IDs (AC-ST.39, DECISIONS D34)', () => {
  const tasks = [task(6, { status: 'doing' }), task(4, { priority: 50 }), task(5, { priority: 50, horizon: 'mid' }), task(7, { priority: 90, horizon: 'long' })];
  assert.deepEqual(sorted(tasks), ['6','7','4','5']);
  assert.deepEqual(sorted(tasks.map(t => ({ ...t, priority: null }))), ['6','4','5','7']);
  assert.deepEqual(sorted([task('t1'), task(10), task(2), task(9, { priority: 0 })]), ['9','2','10','t1']);
  // DECISIONS D34: status rank decides before priority, whatever the levels.
  assert.deepEqual(sorted([task(1, { priority: 100 }), task(2, { status: 'doing' })]), ['2','1']);
  assert.deepEqual(sorted([task(1, { status: 'doing', priority: 25 }), task(2, { status: 'doing', priority: 75 })]), ['2','1']);
  assert.deepEqual(sorted([task(1, { status: 'doing' }), task(2, { status: 'doing', priority: 0 })]), ['2','1']);
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

test('a doing peer stays above a latched todo row whatever the priorities (AC-ST.40, DECISIONS D34)', () => {
  const l = task(2, { priority: 100 }), t = task(3, { priority: 50 });
  for (const before of [null, 0, 100]) {
    const d = task(1, { status: 'doing', priority: before }), held = latch(l, [d, l, t]);
    for (const after of [null, 0, 100]) assert.deepEqual(placed([{ ...d, priority: after }, t], [held]), [1,2,3]);
  }
  const held = latch(l, [l, t]);
  assert.deepEqual(placed([t, task(4, { status: 'doing' })], [held]), [4,2,3]);
  assert.deepEqual(placed([{ ...t, status: 'doing', priority: 0 }], [held]), [3,2]);
});

test('AC-35.5 store: the doing #6 heads the first block before and after #1 turns critical (AC-ST.40, DECISIONS D34)', () => {
  const S = lib('Streams.js'), home = 'work: leadtone', t = (id, over) => task(id, { stream: home, ...over });
  const items = [t(1), t(2, { priority: 60 }), t(3, { horizon: 'mid' }), t(4, { horizon: 'mid', priority: 25 }), t(6, { status: 'doing', horizon: 'yearly' })];
  const shape = rows => rows.map(r => r.kind === 'item' ? Number(r.item.id) : r.horizon);
  assert.deepEqual(shape(S.tabRows(items, home, { streams })), [6,2,1,'mid',4,3]);
  const { latches } = O.recordTick({ latches: {}, tickSequence: 0 }, { type: 'setStatus', id: '2', status: 'done' }, { items, catalogue: streams, metadata: true, currentTab: 's8' });
  assert.deepEqual(latches[2].peers, { 1: null, 6: null });
  // `todocli priority 1 critical` (100) runs before the panel closes.
  const after = items.map(it => it.id === '1' ? { ...it, priority: 100 } : it.id === '2' ? { ...it, status: 'done' } : it);
  const rows = S.tabRows(after, home, { streams, latches });
  assert.deepEqual(shape(rows), [6,2,1,'mid',4,3]);
  assert.equal(rows[1].item.status, 'done');
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

test('record tick chooses Overview peers, section peers and orphan Inbox uid', () => {
  const items=[task(1,{priority:0}),task(2,{horizon:'mid'}),task(3,{horizon:'mid',status:'doing'}),task(4,{stream:'inbox'}),task(5,{stream:'missing'})];
  const state={latches:{},tickSequence:7};
  const ctx={items,catalogue:streams,metadata:true,currentTab:'overview'};
  const action={type:'setStatus',id:'1',status:'done'};
  let r=O.recordTick(state,action,ctx);
  assert.deepEqual(r.latches[1].peers,{2:null,3:null});
  assert.equal(r.latches[1].streamUid,'s1'); assert.equal(r.latches[1].priority,0);
  assert.equal(r.latches[1].tickOrder,7); assert.equal(r.tickSequence,8);
  r=O.recordTick(state,{...action,id:'5'},ctx);
  assert.equal(r.latches[5].streamUid,'I'); assert.deepEqual(r.latches[5].peers,{4:null});
  r=O.recordTick(state,{...action,id:'2'},{...ctx,currentTab:'s1'});
  assert.deepEqual(r.latches[2].peers,{});
  r=O.recordTick(state,action,{...ctx,currentTab:'s1'});
  assert.deepEqual(r.latches[1].peers,{3:null});
  for (const change of [{metadata:false},{currentTab:'done'},{items:[]},{items:[{...items[0],status:'done'}]}]) assert.deepEqual(O.recordTick(state,action,{...ctx,...change}),state);
  for (const change of [{type:'focus'},{status:'todo'}]) assert.deepEqual(O.recordTick(state,{...action,...change},ctx),state);
  assert.deepEqual(state,{latches:{},tickSequence:7});
});

test('record reopen preserves the first instant and ignores other actions/views', () => {
  const it=task(1,{status:'done',completedAt:'2026-09-30T10:00:00Z'});
  const ctx={currentTab:'done',items:[it]}, state={reopened:{}};
  const action={type:'setStatus',id:'1',status:'todo'};
  const first=O.recordReopen(state,action,ctx);
  assert.deepEqual(first,{1:it.completedAt});
  assert.deepEqual(O.recordReopen({reopened:first},action,{...ctx,items:[{...it,completedAt:'later'}]}),first);
  for (const change of [{currentTab:'overview'},{items:[]},{items:[{...it,status:'todo'}]}]) assert.deepEqual(O.recordReopen(state,action,{...ctx,...change}),{});
  for (const change of [{type:'focus'},{status:'doing'}]) assert.deepEqual(O.recordReopen(state,{...action,...change},ctx),{});
  assert.deepEqual(state.reopened,{});
});

test('session identities and peer priorities translate and prune without dropping zero',()=>{
  const held={id:'t1',status:'todo',priority:0,horizon:'short',streamUid:'s1',peers:{t2:0,3:null},tickOrder:0};
  const state={latches:{t1:held,4:{...held,id:'4'}},reopened:{t2:'instant',gone:'instant'},sessionDone:{t1:'todo',4:'todo',gone:'doing'}};
  const items=[task(22,{status:'done'}),task(23),task(4)];
  const maps=O.sessionMaps(state,items,{t1:'22',t2:'23'});
  assert.deepEqual(Object.keys(maps.latches),['22']);
  assert.deepEqual(maps.latches[22].peers,{23:0,3:null}); assert.equal(maps.latches[22].id,'22');
  assert.deepEqual(maps.reopened,{23:'instant'}); assert.deepEqual(maps.sessionDone,{22:'todo'});
  assert.deepEqual(O.sessionMaps({},[]),{latches:{},reopened:{},sessionDone:{}});
  assert.equal(state.latches.t1.peers.t2,0);
});
