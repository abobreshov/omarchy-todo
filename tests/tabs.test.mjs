import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';
import { streams, task } from './p2-helpers.mjs';
const T = lib('Tabs.js');

test('active tabs, stable digits, names, exact tooltip, done keyword first (AC-ST.3,36,54)', () => {
  const tabs=T.tabsOf(streams);
  assert.deepEqual(tabs.map(t=>t.key),['overview','inbox','work: tellkin','work: leadtone','personal: goals','done']);
  assert.equal(tabs.at(-1).digit,null);
  assert.equal(T.tabsOf(streams.slice(0,1)).length,2);
  assert.equal(T.byDigit(tabs,9),null);
  for (const query of ['work: tellkin','work:tellkin','Tellkin','2']) assert.equal(T.resolve(tabs,query).uid,'s1');
  assert.equal(T.resolve(tabs,'done').uid,'done'); assert.equal(T.resolve(tabs,'0').uid,'overview');
  assert.equal(T.resolve(tabs,'nope'),'unknown stream'); assert.equal(T.resolve(tabs,'work: old'),'unknown stream');
  const same=[{...streams[1],name:'todo',key:'work: todo'},{...streams[3],name:'todo',key:'personal: todo'}];
  assert.equal(T.labelOf(same[0],same),'work:todo'); assert.equal(T.labelOf(same[1],same),'pers…:todo');
  assert.equal(T.resolve(T.tabsOf(same),'todo'),'ambiguous stream');
  const long=same.map(s=>({...s,name:'platforms'})); assert.equal(T.labelOf(long[1],long),'p…:platfo…');
  const eight=same.map(s=>({...s,name:'platform'}));
  assert.equal(T.labelOf(eight[1],eight),'p…:platfo…');
  assert.ok(eight.every(s=>T.labelOf(s,eight).length<=10));
  const oneLetter=eight.map(s=>({...s,group:s.group.slice(0,1)}));
  assert.equal(T.labelOf(oneLetter[0],oneLetter),'w:platform');
  assert.equal(T.tooltipOf(tabs[0],[],0),'Overview · every stream · key 0');
  assert.equal(T.tooltipOf(tabs[2],[task(1),task(2,{status:'doing'})],0),'work: tellkin\n2 open · 1 doing\nKey 2');
  assert.equal(T.tooltipOf(tabs[1],[],0),'Inbox\n0 open · 0 doing\nKey 1');
  assert.equal(T.tooltipOf(tabs.at(-1),[],0),'Done\n0 done in the last 7 days');
  const many=Array.from({length:11},(_,i)=>({...streams[1],uid:'s'+i,key:'work: '+i,name:String(i)}));
  assert.equal(T.tabsOf(many)[10].digit,null);
  assert.equal(T.tooltipOf(T.tabsOf(many)[10],[],0).includes('Key'),false);
});

test('clamped steps; move excludes Overview and Done (AC-ST.7)',()=>{
  const tabs=T.tabsOf(streams);
  assert.equal(T.step(tabs,'overview',-1).uid,'overview');
  assert.equal(T.step(tabs,'s9',1).uid,'done'); assert.equal(T.step(tabs,'done',1).uid,'done');
  assert.equal(T.step(tabs,'done',-1).uid,'s9');
  assert.equal(T.step(tabs,'s9',1,true).uid,'s9'); assert.equal(T.step(tabs,'I',-1,true).uid,'I');
  assert.equal(T.step([], 'none',1),null);
});

test('whole-tab window moves minimally and pins Inbox; A2 dump indices (AC-ST.23)',()=>{
  const widths=[41,58,64,58,49,46];
  const check=(a,b)=>assert.deepEqual([a.first,a.last,a.hiddenLeft,a.hiddenRight],b);
  check(T.stripLayout(widths,1,-1,193,1),[1,3,0,2]);
  check(T.stripLayout(widths,1,4,193,1),[2,4,1,1]);
  const last=T.stripLayout(widths,1,5,193,2); check(last,[3,5,2,0]);
  check(T.stripLayout(widths,1,0,193,last.first),[3,5,2,0]); check(T.stripLayout(widths,1,-1,193,last.first),[3,5,2,0]);
  check(T.stripLayout([...widths,32],1,-1,193,1),[1,3,0,3]);
  check(T.stripLayout([...widths,32],1,6,193,1),[3,6,2,0]);
  check(T.stripLayout([...widths,32],1,5,193,3),[3,6,2,0]);
  check(T.stripLayout(widths,1,1,193,3),[1,3,0,2]);
  check(T.stripLayout([32,58,46,32],1,3,250),[1,3,0,0]);
  assert.equal(T.stripLayout([32,58,46,32],1,3,250).reserve,0);
});

test('angle and pixel accumulation, axis ratio, one gesture one tab (AC-ST.10b,46)',()=>{
  function gesture(delta) {
    let s={}, steps=[];
    for (const ev of [{phase:1,at:0},...Array.from({length:10},(_,i)=>({...delta,phase:2,at:10+i*10})),{phase:3,at:120}]) {
      const r=T.wheel(s,ev); s=r.state; if(r.step) steps.push(r.step);
    }
    return steps;
  }
  assert.deepEqual(gesture({x:-40,y:3}),[1]); assert.deepEqual(gesture({x:-40,y:30}),[]);
  assert.deepEqual(gesture({px:-8,py:0,ax:-96}),[1]); assert.deepEqual(gesture({px:-4,ax:-48}),[]);
  assert.deepEqual(gesture({px:-8,ax:0}),[1]); assert.deepEqual(gesture({px:-8,py:5}),[]);
  assert.equal(T.wheel({}, {ax:120,ay:0,at:1,inverted:true}).step,-1);
  let r=T.wheel({}, {ax:-120,at:1}); assert.equal(r.step,1);
  r=T.wheel(r.state,{ax:-120,at:51}); assert.equal(r.step,0);
  r=T.wheel(r.state,{ax:-120,at:351}); assert.equal(r.step,1);
  assert.equal(T.wheel({}, {ax:-120,phase:4}).step,0);
  assert.equal(T.shiftWheel({}, {ay:-120,inverted:true}).step,1);
  assert.equal(T.shiftWheel({}, {py:48,ay:1}).step,-1);
  assert.deepEqual(T.wheel(null).state,{x:0,y:0,latched:false,at:0});
});
