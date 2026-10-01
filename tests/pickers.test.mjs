import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib, item } from './helpers.mjs';
const Keys = lib('Keys.js'), Pickers = lib('Pickers.js');
const task = (over = {}) => item('9', 'Task', 'todo', { stream:'inbox', priority:80, size:'S', horizon:'short', ...over });
const ctx = (it = task(), over = {}) => ({ backend:'cli', hasStreams:true, items:it ? [it] : [], rows:it ? [{kind:'item',item:it}] : [], catalogue:[{uid:'I',key:'inbox',system:true,archivedAt:null}], ...over });
const key = key => ({type:'key',key});
function run(events, c = ctx(), ui = Keys.initialUi()) {
  const actions = [];
  for (const event of events) { const r = Keys.reduceUi(ui,event,c); ui = r.ui; actions.push(...r.actions); }
  return {ui,actions};
}

test('UI-31 / AC-ST.42: other level; current level; Esc; size outside short', () => {
  assert.deepEqual(run([key('!'),key(']'),{type:'enter'}]).actions,[{type:'setPriority',id:'9',value:100}]);
  for (const event of [{type:'enter'},key('3'),{type:'pickOption',value:75},{type:'esc'},key('!')]) {
    const r = run([key('!'),event]); assert.equal(r.ui.picker,null); assert.deepEqual(r.actions,[]);
  }
  const r = run([key('z')],ctx(task({horizon:'mid',size:null})));
  assert.equal(r.ui.picker,null);
  assert.deepEqual(r.actions,[{type:'message',text:'#9 is mid: size is for short-term tasks only'}]);
});

test('AC-ST.42: Inbox-only tuned 80 starts High; None and XL digits pick at once', () => {
  const open = run([key('!')]);
  assert.deepEqual(open.ui.picker,{kind:'priority',id:'9',choice:75});
  assert.equal(Pickers.current('priority',task()),75);
  assert.deepEqual(run([key('!'),{type:'enter'}]).actions,[]);
  assert.deepEqual(run([key('!'),key('0')]).actions,[{type:'setPriority',id:'9',value:null}]);
  assert.deepEqual(run([key('z'),key('5')]).actions,[{type:'setSize',id:'9',value:'XL'}]);
  assert.deepEqual(run([key('z'),key('0')]).actions,[{type:'setSize',id:'9',value:null}]);
  assert.equal(run([key('z'),key('5')]).ui.picker,null);
});

test('AC-ST.42 compose exclusivity: Fix!z remains text, no picker/action', () => {
  let ui = {...Keys.initialUi(),view:'compose',name:'Fix'};
  for (const character of ['!','z']) {
    const r = run([key(character),{type:'text',text:ui.name+character}],ctx(),ui);
    ui=r.ui; assert.deepEqual(r.actions,[]); assert.equal(ui.picker,null);
  }
  assert.equal(ui.name,'Fix!z');
  assert.equal(Keys.keyAction('compose','!',{}),null);
});

test('entry: list, focused task, detail, session done; no free-text task or move mode', () => {
  for (const kind of ['priority','size']) {
    const k = kind === 'priority' ? '!' : 'z';
    for (const status of ['todo','doing','done']) {
      const it=task({status});
      for (const [ui,c] of [
        [Keys.initialUi(),ctx(it)],
        [Keys.initialUi(),ctx(it,{rows:[{kind:'focus',item:it}]})],
        [{...Keys.initialUi(),view:'detail',selectedId:'9'},ctx(it,{rows:[]})]
      ]) assert.equal(run([key(k)],c,ui).ui.picker.kind,kind);
    }
    for (const rows of [[],[{kind:'focus',item:null}]]) for (const over of [{},{backend:'json'},{hasStreams:false}]) {
      const r=run([key(k)],ctx(null,{rows,focus:{text:'Free text'},...over}));
      assert.equal(r.ui.picker,null); assert.deepEqual(r.actions,[]);
    }
    assert.equal(run([key(k)],ctx(),{...Keys.initialUi(),moving:{id:'9',targetUid:'I'}}).ui.picker,null);
    assert.equal(run([key(k)],ctx(null),{...Keys.initialUi(),view:'error'}).ui.picker,null);
    assert.equal(run([key(k)],ctx(task(),{currentTab:'done'})).ui.picker,null);
  }
});

test('E31/E32 in both modes and busy E5 inert, including open picker', () => {
  for (const k of ['!','z']) {
    for (const [over,text] of [[{backend:'json'},'Priority and size need backend = cli.'],[{hasStreams:false},'Priority and size need a newer todocli.']]) {
      const r=run([key(k)],ctx(task(),over));
      assert.deepEqual(r.actions,[{type:'message',text}]); assert.equal(r.ui.picker,null);
    }
    assert.deepEqual(run([key(k)],ctx(task(),{busy:true})).actions,[]);
  }
  const open=run([key('!')]).ui;
  const r=run([key('4'),{type:'enter'}],ctx(task(),{busy:true}),open);
  assert.deepEqual(r.actions,[]); assert.deepEqual(r.ui.picker,open.picker);
  assert.equal(run([{type:'storeError',error:{kind:'busy'}}],ctx(),open).ui.picker.kind,'priority');
});

test('clamped steps, every option digit/click, current unset and zero survive', () => {
  for (const kind of ['priority','size']) {
    const k=kind==='priority'?'!':'z', values=Pickers.options(kind);
    assert.equal(Pickers.labels(kind).length,values.length);
    for (const start of [null,values.at(-1)]) {
      const it=task({[kind]:start});
      const r=run([key(k),...Array(9).fill(key(start===null?'[':']'))],ctx(it));
      assert.equal(r.ui.picker.choice,start);
    }
    for (const [i,value] of values.entries()) for (const ev of [key(String(i)),{type:'pickOption',value}]) {
      const r=run([key(k),ev],ctx(task({[kind]:null})));
      assert.equal(r.ui.picker,null);
      assert.deepEqual(r.actions,value===null?[]:[{type:kind==='priority'?'setPriority':'setSize',id:'9',value}]);
    }
    const own=run([key(k),key(k)]); assert.equal(own.ui.picker,null); assert.deepEqual(own.actions,[]);
  }
  assert.deepEqual(run([key('!'),key('1')],ctx(task({priority:0}))).actions,[]);
  assert.equal(Pickers.current('priority',null),null);
  assert.equal(Keys.keyAction('list','z',{item:task()}),null);
});

test('open picker ignores list keys, other picker, compose keys, hover, wheels and navigation', () => {
  for (const k of ['!','z']) {
    const ui=run([key(k)]).ui;
    const events=['j','k','d','s','f','p','m','v','n','N','+',k==='!'?'z':'!','9','r','R'].map(key)
      .concat([{type:'move',dx:1,dy:1},{type:'hover',index:7},{type:'stepTab',direction:1},{type:'chooseTab',uid:'I'},{type:'delete'},{type:'tab'},{type:'pickOption',value:'bad'}]);
    const r=run(events,ctx(),ui);
    assert.deepEqual(r.ui,ui); assert.deepEqual(r.actions,[]);
  }
  assert.deepEqual(run([key('!'),key('['),{type:'space'}]).actions,[{type:'setPriority',id:'9',value:50}]);
});

test('lifecycle: close, view change, error, dropped task, size horizon drift and real id re-read', () => {
  for (const ev of [{type:'close'},{type:'open'},{type:'resetCursor'},{type:'selectTask',id:'9'},{type:'storeError',error:{kind:'failed'}}]) {
    assert.equal(run([key('!'),ev]).ui.picker,null);
  }
  const open=run([key('!')]).ui;
  for (const over of [{backend:'json'},{hasStreams:false}]) {
    const degraded=run([{type:'rows'}],ctx(task(),over),open);
    assert.equal(degraded.ui.picker,null); assert.deepEqual(degraded.actions,[]);
  }
  const gone=run([{type:'rows'}],ctx(null),open);
  assert.equal(gone.ui.picker,null); assert.deepEqual(gone.actions,[]);
  const drift=run([{type:'rows'}],ctx(task({horizon:'yearly',size:null})),run([key('z')]).ui);
  assert.equal(drift.ui.picker,null);
  assert.deepEqual(drift.actions,[{type:'message',text:'#9 is yearly: size is for short-term tasks only'}]);
  const pending=run([key('4')],ctx(task(),{idMap:{'9':'40'}}),open);
  assert.deepEqual(pending.actions,[{type:'setPriority',id:'9',value:100}]);
  assert.deepEqual(lib('Queue.js').withRealId(pending.actions[0],{'9':'40'}),{type:'setPriority',id:'40',value:100});
  const real=run([{type:'rows'}],ctx({...task(),id:'40'},{idMap:{'9':'40'}}),open);
  assert.equal(real.ui.picker.id,'40');
  assert.deepEqual(run([key('4')],ctx({...task(),id:'40'}),real.ui).actions,[{type:'setPriority',id:'40',value:100}]);
  assert.equal(Pickers.reduce(Keys.initialUi(),{type:'hover'},{}),null);
});

test('refused picker keys disarm delete with production capabilities', () => {
  for (const [k,c] of [
    ['z',ctx(task({horizon:'mid',size:null}))],
    ['!',ctx(task(),{backend:'json'})], ['z',ctx(task(),{backend:'json'})],
    ['!',ctx(task(),{hasStreams:false})],
    ['!',ctx(task(),{currentTab:'done'})]
  ]) {
    const armed=run([{type:'delete',now:1}],c).ui;
    assert.equal(armed.armedId,'9');
    const refused=run([key(k)],c,armed);
    assert.equal(refused.ui.armedId,''); assert.equal(refused.ui.armedAt,0);
    const again=run([{type:'delete',now:2}],c,refused.ui);
    assert.equal(again.ui.armedId,'9');
    assert.deepEqual(again.actions,[]);
  }
});

test('? toggles picker help without setting or leaving the picker', () => {
  for (const k of ['!','z']) {
    const open=run([key(k)]).ui;
    const shown=run([key('?')],ctx(),open);
    assert.equal(shown.ui.help,true); assert.deepEqual(shown.ui.picker,open.picker);
    assert.deepEqual(shown.actions,[]);
    assert.deepEqual(run([key('?')],ctx(),shown.ui).ui,open);
  }
});
