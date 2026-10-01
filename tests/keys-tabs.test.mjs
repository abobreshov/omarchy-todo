import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';
import { streams, task } from './p2-helpers.mjs';
const K=lib('Keys.js'),T=lib('Tabs.js'),S=lib('Streams.js');
const items=[task(1),task(2,{status:'done',completedAt:'2026-09-30T09:00Z'})];
const ctx={backend:'cli',hasStreams:true,catalogue:streams,items,currentTab:'s1',tabKey:'work: tellkin',rows:[{kind:'header'},...items.map(item=>({kind:'item',item}))]};
const ui=()=>({...K.initialUi(),cursor:1,cursorKey:'item:1'});
const key=(k,state=ui(),context=ctx)=>K.reduceUi(state,{type:'key',key:k},context);

test('tab keys, digits and detail/compose exclusivity (AC-ST.7,22; AC-22.13)',()=>{
  for(const [k,uid] of [[']','s8'],['[','I'],['0','overview'],['1','I'],['4','s9']]) assert.deepEqual(key(k).actions,[{type:'selectTab',uid}]);
  assert.deepEqual(key('9').actions,[]);
  assert.deepEqual(key(']',ui(),{...ctx,currentTab:'s9'}).actions,[{type:'selectTab',uid:'done'}]);
  assert.deepEqual(key(']',ui(),{...ctx,currentTab:'done'}).actions,[]);
  for(const view of ['compose','detail']) for(const k of [']','[','0','1','m','v']) assert.deepEqual(key(k,{...ui(),view}).actions,[]);
  assert.deepEqual(key("m",ui(),{...ctx,rows:[{kind:"focus",item:null}],items:[]}).actions,[]);
  const compose=K.reduceUi({...ui(),view:'compose'},{type:'text',text:'[1] Hire'},{...ctx,hasStreams:false});
  assert.equal(compose.ui.name,'[1] Hire'); assert.deepEqual(compose.actions,[]);
  const saved=K.reduceUi({...ui(),view:'compose',composeField:'description',name:'Wire the webhook',description:'d',horizonFilter:'mid'},{type:'enter'},ctx);
  assert.deepEqual(saved.actions,[{type:'add',name:'Wire the webhook',description:'d',stream:'work: tellkin',horizon:'mid'}]);
});

test('capability messages, filter and Esc levels, busy actions inert (AC-ST.13,19,25)',()=>{
  for(const [over,msg] of [[{backend:'json'},T.E22],[{hasStreams:false},T.E23],[{catalogue:streams.slice(0,1)},T.E21]]) {
    for(const k of [']','m']) assert.deepEqual(key(k,ui(),{...ctx,...over}).actions,[{type:'message',text:msg}]);
    if(msg!==T.E21) assert.deepEqual(key('v',ui(),{...ctx,...over}).actions,[{type:'message',text:msg}]);
  }
  const filtered=key('v').ui; assert.equal(filtered.horizonFilter,'short');
  const armed={...filtered,armedId:'1'};
  let r=K.reduceUi(armed,{type:'esc'},ctx); assert.equal(r.ui.armedId,''); assert.equal(r.ui.horizonFilter,'short');
  r=K.reduceUi(r.ui,{type:'esc'},ctx); assert.equal(r.ui.horizonFilter,'all'); assert.deepEqual(r.actions,[]);
  r=K.reduceUi(r.ui,{type:'esc'},ctx); assert.deepEqual(r.actions,[{type:'close'}]);
  for(const k of ['d','s','f','p','n']) assert.deepEqual(key(k,ui(),{...ctx,busy:true}).actions,[]);
  assert.equal(key('m',ui(),{...ctx,busy:true}).ui.moving,null);
  assert.equal(key('v',ui(),{...ctx,busy:true}).ui.horizonFilter,'short');
  for(const ev of [{type:'delete',id:'1'},{type:'key',key:'x'}]) {
    const r=K.reduceUi({...ui(),armedId:'1'},ev,{...ctx,busy:true});
    assert.deepEqual(r.actions,[]); assert.equal(r.ui.armedId,'1');
  }
  assert.deepEqual(K.reduceUi({...ui(),view:'detail',selectedId:'1'},{type:'enter'},{...ctx,busy:true,steps:1}).actions,[]);
});

test('move held by uid, rename resolves at dispatch; archive cancels (AC-ST.44)',()=>{
  let state=key('m').ui; assert.deepEqual(state.moving,{id:'1',targetUid:'s1'});
  state=key(']',state).ui; assert.equal(state.moving.targetUid,'s8');
  assert.equal(T.movePrompt(state,ctx),'Move #1 to leadtone · [ ] 1-9 · Enter · Esc');
  const renamed=streams.map(s=>s.uid==='s8'?{...s,key:'work: leadtone-2',name:'leadtone-2'}:s);
  let r=K.reduceUi(state,{type:'enter'},{...ctx,catalogue:renamed});
  assert.deepEqual(r.actions,[{type:'move',id:'1',stream:'work: leadtone-2'}]); assert.equal(r.ui.moving,null);
  r=K.reduceUi(state,{type:'rows'},{...ctx,catalogue:streams.filter(s=>s.uid!=='s8'),previousCatalogue:streams});
  assert.equal(r.ui.moving,null); assert.deepEqual(r.actions,[{type:'message',text:'work: leadtone was archived · move cancelled'}]);
  assert.equal(K.reduceUi(state,{type:'rows'},{...ctx,items:[]}).ui.moving,null);
  for(const ev of [{type:'move',dy:1},{type:'key',key:'j'},{type:'key',key:'!'},{type:'hover',index:2}]) assert.equal(K.reduceUi(state,ev,ctx).ui.cursor,state.cursor);
  assert.equal(key('m',state).ui.moving,null); assert.equal(K.reduceUi(state,{type:'esc'},ctx).ui.moving,null);
  assert.deepEqual(K.reduceUi(key('m').ui,{type:'enter'},ctx).actions,[]);
  assert.deepEqual(key('1',state).actions,[{type:'move',id:'1',stream:'inbox'}]);
  assert.deepEqual(K.reduceUi(state,{type:'chooseTab',uid:'overview'},ctx).actions,[]);
  assert.deepEqual(K.reduceUi(state,{type:'chooseTab',uid:'I'},ctx).actions,[{type:'move',id:'1',stream:'inbox'}]);
  assert.equal(K.reduceUi(state,{type:'stepTab',direction:-1},ctx).ui.moving.targetUid,'s1');
  assert.deepEqual(K.reduceUi(ui(),{type:'chooseTab',uid:'I'},ctx).actions,[{type:'selectTab',uid:'I'}]);
  assert.deepEqual(K.reduceUi(ui(),{type:'stepTab',direction:1},ctx).actions,[{type:'selectTab',uid:'s8'}]);
  assert.deepEqual(T.reduce({...ui(),view:'detail'},{type:'chooseTab',uid:'I'},ctx),null);
  assert.equal(T.movePrompt(ui(),ctx),'');
  assert.equal(K.reduceUi(state,{type:"highlightTab",uid:"I"},ctx).ui.moving.targetUid,"I");
  assert.equal(K.reduceUi(state,{type:"highlightTab",uid:"done"},ctx).ui.moving.targetUid,"s8");
  const busy=K.reduceUi(state,{type:'enter'},{...ctx,busy:true});
  assert.deepEqual(busy.actions,[]); assert.deepEqual(busy.ui.moving,state.moving);
});

test('Done list only reopens/reviews/deletes; filter persists and Esc skips it (AC-ST.54,57)',()=>{
  const doneCtx={...ctx,currentTab:'done',tabKey:'done'};
  for(const k of ['n','N','+','m','v','!','z','s','f','p']) assert.deepEqual(key(k,ui(),doneCtx).actions,[]);
  assert.deepEqual(key('d',{...ui(),cursor:2},doneCtx).actions,[{type:'setStatus',id:'2',status:'todo'}]);
  assert.deepEqual(K.reduceUi({...ui(),horizonFilter:'mid'},{type:'esc'},doneCtx).actions,[{type:'close'}]);
  assert.equal(K.reduceUi({...ui(),horizonFilter:'mid'},{type:'close'},doneCtx).ui.horizonFilter,'all');
  assert.equal(K.reduceUi(ui(),{type:'enter'},doneCtx).ui.view,'detail');
  assert.equal(K.reduceUi({...ui(),moving:{id:'1',targetUid:'s1'}},{type:'storeError',error:{kind:'protocol'}},ctx).ui.moving,null);
});

test('cursor keys on navigation, hover, selection and rows; sections skipped (AC-ST.24,44)',()=>{
  const rows=[{kind:'focus',selectable:false},{kind:'header'},ctx.rows[1],{kind:'day'},ctx.rows[2]];
  let r=K.reduceUi(ui(),{type:'open'},{...ctx,rows}); assert.equal(r.ui.cursor,2); assert.equal(r.ui.cursorKey,'item:1');
  r=K.reduceUi(r.ui,{type:'move',dy:1},{...ctx,rows}); assert.equal(r.ui.cursor,4); assert.equal(r.ui.cursorKey,'item:2');
  r=K.reduceUi(r.ui,{type:'hover',index:3},{...ctx,rows}); assert.equal(r.ui.cursor,4);
  r=K.reduceUi(r.ui,{type:'selectTask',id:'1'},{...ctx,rows}); assert.equal(r.ui.cursorKey,'item:1');
  r=K.reduceUi({...ui(),cursor:2,cursorKey:'item:2'},{type:'rows'},{...ctx,rows:[ctx.rows[2],ctx.rows[1]]}); assert.equal(r.ui.cursor,0);
  assert.equal(K.reduceUi(ui(),{type:'resetCursor'},{...ctx,rows}).ui.cursor,2);
});
