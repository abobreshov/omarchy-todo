import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';
import { streams, task, ids } from './p2-helpers.mjs';
process.env.TZ='Europe/London';
const S=lib('Streams.js'),O=lib('Order.js'),V=lib('View.js');
const dayStart=O.dayStartOf(Date.parse('2026-09-30T12:00:00+01:00'));
const done=(id,at,extra={})=>task(id,{status:'done',completedAt:`2026-09-${at}:00.000Z`,...extra});
const opts={streams,dayStart,horizonFilter:'all'};
const sample=[done(5,'30T09:00'),done(6,'30T15:00',{stream:'inbox'}),done(2,'29T18:00',{stream:'personal: goals'}),done(4,'24T10:00',{stream:'work: old'}),done(8,'23T10:00')];

test('done tails after every open/latched row, tail-only sections (AC-ST.49)',()=>{
  const items=[task(1),task(3,{horizon:'mid',priority:90}),done(5,'30T09:00',{priority:100}),done(6,'30T15:00'),done(7,'30T11:00',{horizon:'mid'})];
  const over=S.overviewRows(items,streams,opts);
  assert.deepEqual(ids(over),[3,1,6,7,5]); assert.equal(over[0].open,2);
  const tab=S.tabRows(items,'work: tellkin',opts);
  assert.deepEqual(tab.map(r=>r.kind==='item'?r.item.id:r.horizon),['1','6','5','mid','3','7']);
  assert.equal(tab[3].count,1);
  const only=[task(11),done(12,'30T08:00',{horizon:'yearly'})];
  const rows=S.tabRows(only,'work: tellkin',opts);
  assert.equal(rows[1].horizon,'yearly'); assert.equal(rows[1].count,0);
  assert.equal(S.countCaption(items,streams,'work: tellkin','all',tab),'2 open');
  assert.deepEqual(ids(S.tabRows(items,'work: tellkin',{...opts,horizonFilter:'mid'})),[3,7]);
});

test('the next open removes latches, tail persists today, drops later (AC-ST.50,52,53)',()=>{
  const a=task(1,{priority:50}),b=task(2),held=done(1,'30T09:00',{priority:50});
  const latch=O.latchOf(a,[a,b],'s1');
  assert.deepEqual(ids(S.tabRows([held,b],'work: tellkin',{...opts,latches:{1:latch}})),[1,2]);
  assert.deepEqual(ids(S.tabRows([held,b],'work: tellkin',opts)),[2,1]);
  const today=S.overviewRows([held],streams,opts); assert.equal(today[0].open,0);
  assert.deepEqual(ids(today),[1]);
  assert.equal(S.emptyCopy([held],'work: tellkin','all',S.tabRows([held],'work: tellkin',opts)),'');
  const tomorrow=O.daysBefore(dayStart,-1);
  assert.deepEqual(S.tabRows([held],'work: tellkin',{...opts,dayStart:tomorrow}),[]);
  assert.equal(S.emptyCopy([held],'work: tellkin','all',[]),'All clear in work: tellkin. Press + to add a todo.');
  const future=task(9,{status:'done',completedAt:'2026-10-01T01:00Z'});
  assert.equal(O.inTail(future,dayStart),true); assert.equal(O.inWindow(future,dayStart),true);
  assert.equal(S.doneRows([future],streams,opts)[0].caption,'Thu 1 Oct');
  assert.deepEqual(S.doneRows([task(1,{status:'done',completedAt:null})],streams,opts),[]);
});

test('last seven local days, archived stream and exact day dump (AC-ST.55)',()=>{
  const rows=S.doneRows(sample,streams,opts);
  assert.deepEqual(ids(rows),[6,5,2,4]);
  assert.deepEqual(rows.filter(r=>r.kind==='day').map(r=>[r.date,r.count,r.caption]),[['2026-09-30',2,'Today'],['2026-09-29',1,'Yesterday'],['2026-09-24',1,'Thu 24 Sep']]);
  assert.deepEqual(rows.filter(r=>r.kind==='item').map(r=>r.streamCaption),['Inbox','tellkin','goals','old']);
  assert.equal(S.countCaption(sample,streams,'done','mid',rows),'4 done');
  const dump=V.dumpView({backend:'cli',hasStreams:true,catalogue:streams,items:sample,tab:'done',dayStart,strip:{first:1,last:4,hiddenLeft:0,hiddenRight:0,reserve:0}});
  assert.equal(dump.tab,'done'); assert.deepEqual(dump.rows.filter(r=>r.kind==='day').map(r=>Object.keys(r)),[['kind','date','count'],['kind','date','count'],['kind','date','count']]);
  assert.deepEqual(dump.rows.filter(r=>r.kind==='item').map(r=>Object.keys(r)),Array(4).fill(['kind','id','status','stream','horizon','badge','priority','size']));
  assert.equal(dump.streams.length,4); assert.equal(dump.streams.some(s=>s.key==='done'),false);
  assert.deepEqual(dump.strip,{first:1,last:4,hiddenLeft:0,hiddenRight:0});
});

test('reopened rows keep original day and instant, current status/caption/count (AC-ST.56,58)',()=>{
  const reopened={6:sample[1].completedAt};
  const changed=sample.map(t=>t.id==='6'?{...t,status:'todo',completedAt:null}:t);
  let rows=S.doneRows(changed,streams,{...opts,reopened});
  assert.deepEqual(ids(rows),[6,5,2,4]); assert.equal(rows[1].item.status,'todo');
  assert.equal(S.countCaption(changed,streams,'done','all',rows),'3 done'); assert.equal(rows[0].count,2);
  rows=S.doneRows(changed.map(t=>t.id==='6'?{...t,status:'done',completedAt:'2026-10-01T10:00Z'}:t),streams,{...opts,reopened});
  assert.deepEqual(ids(rows),[6,5,2,4]); assert.equal(rows[0].date,'2026-09-30');
  assert.deepEqual(ids(S.doneRows(changed,streams,opts)),[5,2,4]);
  assert.equal(S.emptyCopy([],'done','mid',[]),'Nothing done in the last 7 days. todocli list done lists older ones.');
  assert.deepEqual(S.doneRows([],streams),[]);
  const fallback=S.itemRow(task(3,{stream:'missing'}),'',streams,true); assert.equal(fallback.streamCaption,'missing');
});
