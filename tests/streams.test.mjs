import fs from 'node:fs';
import path from 'node:path';
import { here } from './helpers.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';
import { streams, task, ids, from, expected } from './p2-helpers.mjs';
const S=lib('Streams.js'), O=lib('Order.js'), V=lib('View.js');

test('Overview headers and stream sections have no cursor/action (AC-ST.1,2,4)',()=>{
  const items=[task(1,{stream:'inbox'}),task(2,{stream:'personal: goals',horizon:'yearly'}),task(3)];
  const rows=S.overviewRows(items,streams);
  assert.deepEqual(rows.filter(r=>r.kind==='header').map(r=>[r.stream,r.open,r.caption]),[['inbox',1,'Inbox'],['work: tellkin',1,'work: tellkin'],['personal: goals',1,'personal: goals']]);
  assert.deepEqual(ids(rows),[1,3,2]); assert.equal(rows.at(-1).badge,'1y');
  const more=[task(4),task(5,{horizon:'mid'}),task(6,{status:'doing'}),task(7,{horizon:'long'}),task(8,{status:'doing',horizon:'yearly'})];
  assert.deepEqual(ids(S.overviewRows(more,streams)),[6,8,4,5,7]);
  const tab=S.tabRows(more,'work: tellkin',{streams});
  assert.deepEqual(tab.map(r=>r.kind==='item'?r.item.id:r.horizon),['6','8','4','mid','5','long','7']);
  assert.deepEqual(tab.filter(r=>r.kind==='item').map(r=>r.badge),['','1y','','','']);
  assert.equal(S.horizonCopy('unknown').name,'short-term');
});

test('consumer fixture orders are read from expected.json, orphan homes retain keys',()=>{
  const ties=from('board-ties.json'), exp=expected['board-ties.json'];
  assert.deepEqual(ids(S.overviewRows(ties.items,ties.streams)),exp.overviewGroup);
  const tab=S.tabRows(ties.items,'work: tellkin',{streams:ties.streams});
  const first=tab.findIndex(r=>r.kind==='section');
  assert.deepEqual(ids(tab.slice(0,first)),exp.tabFirstBlock);
  for(const [h,want] of Object.entries(exp.tabSections)) {
    const start=tab.findIndex(r=>r.kind==='section'&&r.horizon===h);
    const end=tab.findIndex((r,i)=>i>start&&r.kind==='section');
    assert.deepEqual(ids(tab.slice(start+1,end<0?undefined:end)),want);
  }
  assert.deepEqual(V.dumpView({backend:'cli',hasStreams:true,items:ties.items,catalogue:ties.streams}).open.map(r=>Number(r.id)),exp.dumpOpen);
  const orphan=from('board-archived-home.json');
  const inbox=S.tabRows(orphan.items,'inbox',{streams:orphan.streams});
  for(const id of expected['board-archived-home.json'].orphanIds) {
    const row=inbox.find(r=>r.item&&Number(r.item.id)===id);
    assert.equal(row.item.stream,expected['board-archived-home.json'].streams[id]);
  }
  const empty=from('board-empty-stream.json'), e=expected['board-empty-stream.json'];
  assert.equal(S.overviewRows(empty.items,empty.streams).some(r=>r.kind==='header'&&r.stream===e.omittedGroup),false);
  assert.equal(S.emptyCopy(empty.items,e.tab,'all',[]),e.emptyMessage);
  const old=from('board-old-cli.json');
  const dump=V.dumpView({backend:'cli',...old});
  assert.deepEqual(Object.fromEntries(Object.keys(expected['board-old-cli.json'].dump.itemMetadata).map(k=>[k,dump.rows[0][k]])),expected['board-old-cli.json'].dump.itemMetadata);
});

test('filter, captions, empty copy and compose target (AC-ST.32,35; AC-22.6)',()=>{
  assert.deepEqual(['all','short','mid','yearly','long'].map(S.cycleFilter),['short','mid','yearly','long','all']);
  assert.equal(S.cycleFilter('bad'),'short');
  const items=[task(1),task(2,{horizon:'mid'}),task(3,{horizon:'mid',status:'doing'})];
  assert.deepEqual(ids(S.overviewRows(items,streams,{horizonFilter:'mid'})),[3,2]);
  const filtered=S.tabRows(items,'work: tellkin',{streams,horizonFilter:'mid'});
  assert.deepEqual(filtered.map(r=>r.kind),['item','section','item']);
  assert.equal(S.countCaption(items,streams,'overview','mid',[]),'2 open · mid-term');
  assert.equal(S.countCaption(items,streams,'work: leadtone','all',[]),'0 open');
  assert.equal(S.emptyCopy(items,'work: tellkin','long',[]),'No long-term task here. v changes the filter · Esc clears it.');
  assert.equal(S.emptyCopy(items,'overview','all',[{kind:'item'}]),'');
  assert.equal(S.emptyCopy([],'overview','all',[]),'Nothing here yet. Press + to add a todo.');
  assert.equal(S.emptyCopy([task(1,{status:'done'})],'work: tellkin','all',[]),'All clear in work: tellkin. Press + to add a todo.');
  assert.equal(S.emptyCopy([task(1,{status:'done'})],'overview','all',[]),'All clear. Press + to add a todo.');
  assert.deepEqual(S.composeTarget('work: tellkin','mid'),{stream:'work: tellkin',horizon:'mid'});
  for(const tab of ['overview','inbox','done']) assert.deepEqual(S.composeTarget(tab,'short'),{});
  assert.deepEqual(S.composeTarget('overview','all'),{});
});

test('slot geometry is based on all document tasks, including done (AC-ST.43)',()=>{
  assert.equal(S.prioritySlot([task(1,{status:'done',priority:0})]),true);
  assert.equal(S.prioritySlot([task(1)]),false);
  assert.equal(S.badgeSlot(streams,[task(1)]),true);
  for(const extra of [{size:'M'},{horizon:'mid'}]) assert.equal(S.badgeSlot(streams.slice(0,1),[task(1,{status:'done',...extra})]),true);
  assert.equal(S.badgeSlot(streams.slice(0,1),[task(1)]),false);
});

test('tick latch holds stream uid through rename and archive, current display data (AC-ST.40)',()=>{
  const a=task(1,{priority:100}), b=task(2,{priority:50}), c=task(3,{priority:0});
  const latch=O.latchOf(b,[a,b,c],'s1',1);
  const held={...b,status:'done',name:'new title'};
  const items=[{...a,priority:0},held,{...c,priority:100}];
  assert.deepEqual(ids(S.tabRows(items,'work: tellkin',{streams,latches:{2:latch}})),[3,2,1]);
  const renamed=streams.map(s=>s.uid==='s1'?{...s,key:'work: tk',name:'tk'}:s);
  const moved=items.map(t=>({...t,stream:'work: tk'}));
  const rows=S.overviewRows(moved,renamed,{latches:{2:latch}});
  assert.equal(rows[0].caption,'work: tk'); assert.deepEqual(ids(rows),[3,2,1]);
  const archived=streams.map(s=>s.uid==='s1'?{...s,archivedAt:'now'}:s);
  const tail=S.overviewRows([held],archived,{latches:{2:latch}});
  assert.equal(tail[0].stream,'work: tellkin'); assert.equal(tail[0].open,0);
  assert.equal(S.effectiveHome(b,streams,{streamUid:'gone'}),'work: tellkin');
  assert.deepEqual(ids(S.tabRows([held],'work: tellkin',{streams,sessionDone:{2:'todo'}})),[2]);
});


test("tick peer blocks include held rows but isolate sections", () => {
  const items=[task(1),task(2,{status:'doing',horizon:'yearly'}),task(3,{horizon:'mid'}),task(4,{horizon:'mid',status:'done'}),task(5,{stream:'inbox'})];
  const latch=O.latchOf({...items[3],status:'todo'},items,'s1');
  assert.deepEqual(S.latchBlock(items,items[0],streams,{4:latch},false).map(t=>t.id),['1','2']);
  assert.deepEqual(S.latchBlock(items,items[2],streams,{4:latch},false).map(t=>t.id),['3','4']);
  assert.deepEqual(S.latchBlock(items,items[0],streams,{4:latch},true).map(t=>t.id),['1','2','3','4']);
  assert.equal(S.latchBlock(items,items[0],streams,null,true).length,4);
});


test("compose headers name the target and inherited non-short horizon",()=>{
  assert.equal(S.composeCaption('overview','all',true),'New todo · Inbox');
  assert.equal(S.composeCaption('inbox','short',true),'New todo · Inbox');
  assert.equal(S.composeCaption('work: tellkin','mid',true),'New todo · work: tellkin · mid-term');
  assert.equal(S.composeCaption('overview','yearly',false),'New todo · yearly');
  assert.equal(S.composeCaption('overview','all',false),'New todo');
});

test("view selection shares grouping with dump and preserves Inbox-only E1/E2", () => {
  const migrated = lib('Store.js').fromCli(JSON.parse(fs.readFileSync(path.join(here, 'fixtures/contract/board.json'), 'utf8')));
  assert.equal(S.viewKey('done', migrated.streams), 'overview');
  for (const tab of ['overview', 'inbox']) {
    assert.equal(S.viewKey(tab, migrated.streams), 'overview');
    const empty = S.viewRows([], migrated.streams, tab);
    assert.equal(S.emptyCopy([], S.viewKey(tab, migrated.streams), 'all', empty), 'Nothing here yet. Press + to add a todo.');
    const done = migrated.items.map(it => ({...it, status:'done', completedAt:'2026-09-29T09:00:00Z'}));
    const rows = S.viewRows(done, migrated.streams, tab, {dayStart:Date.parse('2026-09-30T00:00:00Z')});
    assert.deepEqual(rows, []);
    assert.equal(S.emptyCopy(done, S.viewKey(tab, migrated.streams), 'all', rows), 'All clear. Press + to add a todo.');
  }
  const items = [task(1),task(2,{stream:'inbox'}),task(3,{status:'done',completedAt:'2026-09-30T09:00:00Z'})];
  const opts = { dayStart:Date.parse('2026-09-30T00:00:00Z'), horizonFilter:'all' };
  for (const tab of ['overview','work: tellkin','done']) {
    const expectedRows = tab === 'overview' ? S.overviewRows(items,streams,opts) : tab === 'done' ? S.doneRows(items,streams,opts) : S.tabRows(items,tab,{...opts,streams});
    assert.deepEqual(S.viewRows(items,streams,tab,opts), expectedRows);
    const dump = V.dumpView({backend:'cli',hasStreams:true,items,catalogue:streams,tab,dayStart:opts.dayStart});
    assert.deepEqual(dump.rows.filter(r=>r.kind==='item').map(r=>r.id), expectedRows.filter(r=>r.kind==='item').map(r=>r.item.id));
  }
  assert.deepEqual(S.viewRows([], [], 'overview'), []);
  assert.equal(S.streamCaptionOf(task(1),streams), S.itemRow(task(1),'',streams,true).streamCaption);
});
