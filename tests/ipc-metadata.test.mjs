import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { lib, here, item } from './helpers.mjs';
const Store=lib('Store.js'), Priority=lib('Priority.js'), Argv=lib('Argv.js'), Queue=lib('Queue.js');
const fake=path.join(here,'fakebin/todocli');
const doc=()=>({backend:'cli',hasStreams:true,items:[item('4','Unset','todo',{priority:null,horizon:'short'}),item('3','Sized','todo',{priority:0,size:'M',horizon:'short'}),item('5','Yearly','todo',{horizon:'yearly'})],focus:{text:'',taskId:null}});

test('CONTRACT §10 Priority.parse IPC domain stays separate from normalize',()=>{
  for(const [input,value] of [['0',0],['none',null],['HIGH',75],['37',37],['100',100],['low',25],['MeDium',50],['CRITICAL',100]])
    assert.deepEqual(Priority.parse(input),{value});
  for(const input of ['150','-1','7.5','+5','', ' 5','5 ', 'constructor','toString'])
    assert.deepEqual(Priority.parse(input),{error:'bad priority'});
  assert.equal(Priority.normalize('0'),null);
  for(const [input,value] of [['xs','XS'],['s','S'],['m','M'],['l','L'],['xL','XL'],['NONE',null]])
    assert.deepEqual(Priority.parseSize(input),{value});
  for(const input of ['XXL','',' M','constructor']) assert.deepEqual(Priority.parseSize(input),{error:'bad size'});
});

test('AC-33.9 / AC-34.7 IPC replies and exact recorded argv', t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p3-metadata-')); t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const log=path.join(root,'argv.jsonl');
  for(const [kind,id,input,reply,value] of [
    ['priority','4','150','bad priority'],['priority','4','7.5','bad priority'],['priority','4','+5','bad priority'],
    ['priority','4','0','ok',0],['priority','4','HIGH','ok',75],['priority','3','none','ok',null],
    ['priority','4','37','ok',37],['size','3','S','ok','S'],['size','3','none','ok',null],
    ['size','5','M','size is for short-term tasks only'],['size','5','none','ok'],['size','3','x','bad size'],
    ['priority','999','high','unknown id'],['size','999','M','unknown id']
  ]) {
    const intent=Store.metadataIntent(doc(),kind,id,input);
    assert.equal(intent.reply,reply);
    const before=fs.existsSync(log)?fs.readFileSync(log,'utf8'):'';
    if (value===undefined) { assert.equal(intent.action,null); assert.equal(fs.existsSync(log)?fs.readFileSync(log,'utf8'):'',before); continue; }
    assert.deepEqual(intent.action,{type:kind==='priority'?'setPriority':'setSize',id,value});
    const argv=Argv.forAction(fake,intent.action);
    const result=spawnSync(fake,argv.slice(1),{encoding:'utf8',env:{PATH:process.env.PATH,FAKE_LOG:log}});
    assert.equal(result.status,0,result.stderr);
    const recorded=JSON.parse(fs.readFileSync(log,'utf8').trim().split('\n').at(-1));
    assert.deepEqual(recorded.argv,['--source','omarchy','--json',kind,id,value===null?'none':String(value)]);
  }
});

test('same stored values queue nothing; E31/E32 and unavailable pass through',()=>{
  const d=doc();
  for(const [kind,id,value] of [['priority','3','0'],['size','3','M'],['priority','4','none'],['size','5','none']])
    assert.deepEqual(Store.metadataIntent(d,kind,id,value),{reply:'ok',action:null});
  for(const kind of ['priority','size']) for(const [over,reply] of [
    [{backend:'json'},'Priority and size need backend = cli.'],[{hasStreams:false},'Priority and size need a newer todocli.'],
    [{error:{kind:'busy'}},'unavailable: database busy'],[{error:{kind:'missing'}},'unavailable: todocli not found']
  ]) assert.deepEqual(Store.metadataIntent({...d,...over},kind,'3','0'),{reply,action:null});
});

test('UI-30: optimistic metadata, rollback/rebase, temporary-id replay keep the full task',()=>{
  const base=doc(), before={items:base.items,focus:base.focus};
  for(const [type,value,field] of [['setPriority',75,'priority'],['setSize','S','size']]) {
    const write=Store.reduce(before,{type,id:'3',value});
    assert.equal(write.doc.items[1][field],value);
    const rebased=Queue.rebase(before,[{action:{type:'setStatus',id:'3',status:'doing',at:1},before:write.doc}]);
    assert.deepEqual(rebased.doc.items[1],{...before.items[1],status:'doing'});
    const added=Store.reduce(before,{type:'add',id:'tmp',name:'New'});
    const follow={type,id:'tmp',value};
    const replay=Queue.rebase(before,[{action:{type:'add',name:'New'},tempId:'tmp'},{action:follow}]);
    assert.equal(replay.doc.items.at(-1)[field],value);
    assert.deepEqual(Queue.withRealId(follow,{tmp:'40'}),{type,id:'40',value});
    assert.equal(added.item.priority,null);
  }
});

test('detail fields and transients use stored numbers, including zero and tuned 80',()=>{
  for(const [priority,size,want] of [[80,'M','priority: high (80) · size: M'],[0,null,'priority: low (0)'],[null,'XL','size: XL'],[null,null,'']])
    assert.equal(Priority.fieldsLine(item('3','Task','todo',{priority,size}),true),want);
  assert.equal(Priority.fieldsLine(null,true),''); assert.equal(Priority.fieldsLine(doc().items[1],false),'');
  for(const [type,value,text] of [['setPriority',0,'priority: low (0)'],['setPriority',75,'priority: high (75)'],['setPriority',null,'priority: (none)'],['setSize','S','size: S'],['setSize',null,'size: (none)']])
    assert.equal(Priority.resultMessage({type,id:'3',value}),'#3 '+text);
  assert.equal(Priority.resultMessage({type:'move'}),'');
});

test('UI-31 cursor identity follows metadata re-sort and the same-value size reducer is inert',()=>{
  const Keys=lib('Keys.js'), Streams=lib('Streams.js');
  const catalogue=[{uid:'I',key:'inbox',name:'inbox',system:true,archivedAt:null,open:2}];
  let d={items:[item('1','First','todo',{stream:'inbox',horizon:'short',priority:75}),item('3','Third','todo',{stream:'inbox',horizon:'short',priority:0,size:'M'})],focus:{text:'',taskId:null}};
  const rows=()=>Streams.viewRows(d.items,catalogue,'overview');
  let c={backend:'cli',hasStreams:true,catalogue,items:d.items,rows:rows()};
  let ui=Keys.reduceUi({...Keys.initialUi(),cursor:1},{type:'rows'},c).ui;
  ui=Keys.reduceUi(ui,{type:'key',key:'!'},c).ui;
  const picked=Keys.reduceUi(ui,{type:'key',key:'4'},c);
  assert.deepEqual(picked.actions,[{type:'setPriority',id:'3',value:100}]);
  d=Store.reduce(d,picked.actions[0]).doc;
  c={...c,items:d.items,rows:rows()};
  ui=Keys.reduceUi(picked.ui,{type:'rows'},c).ui;
  assert.equal(ui.cursor,0); assert.equal(c.rows[ui.cursor].item.id,'3');
  const same=Store.reduce(d,{type:'setSize',id:'3',value:'M'});
  assert.equal(same.action,null); assert.equal(same.doc.items,d.items);
  assert.equal(lib('View.js').helpLine('list','cli',true,false,'overview',{kind:'priority'}),'[ ] choose · 0-4 pick · Enter set · Esc cancel');
  assert.equal(lib('View.js').helpLine('detail','cli',true,false,'overview',{kind:'size'}),'[ ] choose · 0-5 pick · Enter set · Esc cancel');
});


test('UX §13.1 exact help copy for both views, Inbox-only and degraded modes',()=>{
  const View=lib('View.js');
  assert.equal(View.helpLine('list','cli',true,false,'overview'),'n new · d done · s doing · f focus · p pomodoro · ! priority · z size · v horizon · x x or Del delete · r reload · R sync · Tab next panel');
  assert.equal(View.helpLine('detail','cli',true),'Enter step · d done · s doing · f focus · p pomodoro · ! priority · z size · x x or Del delete · Esc back');
  assert.equal(View.helpLine('detail','json',true).includes('! priority'),false);
  assert.equal(View.helpLine('detail','cli',false).includes('z size'),false);
});
