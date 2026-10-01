import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lib, here } from './helpers.mjs';
const View=lib('View.js'), Store=lib('Store.js'), Keys=lib('Keys.js');
const canonical=()=>Store.fromCli(fs.readFileSync(path.join(here,'fixtures/contract/board-streams.json'),'utf8'));
const row=(id,status,stream,horizon,badge,priority,size)=>({kind:'item',id,status,stream,horizon,badge,priority,size});
const base={version:1,backend:'cli',cliPath:'/fake/todocli',view:'list',stale:false,error:null,
  pill:{glyph:'g',label:'l',tooltip:'t',urgent:false,dimmed:false},focus:{text:'',taskId:null},done:[],banner:null,footer:null,message:null};

// §10's worked stores differ from the golden's store: start with its full
// task objects and explicitly adapt only the example's fields, never fixtures.
test('CONTRACT §10 UI-27: the whole dump and three exact row shapes',()=>{
  const doc=canonical(), template=id=>doc.items.find(it=>it.id===String(id));
  const items=[template(1),{...template(2),id:'14',priority:null,labels:[]},
    {...template(3),priority:null,size:null,labels:[]},
    {...template(4),id:'9',priority:null}, {...template(5),id:'2'}];
  const catalogue=doc.streams.filter(s=>s.archivedAt===null).map(s=>({...s,open:s.key==='personal: goals'?1:2}));
  const strip={first:1,last:2,hiddenLeft:0,hiddenRight:0};
  const dump=View.dumpView({...base,items,catalogue,hasStreams:true,tab:'inbox',strip});
  assert.deepEqual(dump,{...base,tab:'inbox',streams:catalogue.map(s=>({uid:s.uid,key:s.key,open:s.open})),strip,horizonFilter:'all',moving:null,
    rows:[row('1','todo','inbox','short','',null,null),{kind:'section',horizon:'mid',count:1},row('14','todo','inbox','mid','',null,null)],
    open:[
      {id:'3',title:'Wire the webhook',status:'doing',stream:'work: tellkin',horizon:'short',labels:[],priority:null,size:null},
      {id:'1',title:'Call the bank',status:'todo',stream:'inbox',horizon:'short',labels:[],priority:null,size:null},
      {id:'2',title:'Run a marathon',status:'todo',stream:'personal: goals',horizon:'yearly',labels:['health'],priority:null,size:null},
      {id:'9',title:'Draft Q4 roadmap',status:'todo',stream:'work: tellkin',horizon:'mid',labels:['q4'],priority:null,size:null},
      {id:'14',title:'Renew the lease',status:'todo',stream:'inbox',horizon:'mid',labels:[],priority:null,size:null}
    ]});
  assert.equal(Object.hasOwn(dump,'picker'),false);
});

test('CONTRACT §10 separate worked inputs: AC-35.3 order and zero with size M',()=>{
  const doc=canonical(), home='work: tellkin', template=doc.items[2];
  const catalogue=doc.streams.map(s=>({...s,open:s.key===home?4:0}));
  const inputs=[
    [7,'todo','long',90,null],[4,'todo','short',50,null],[5,'todo','mid',50,null],[6,'doing','short',null,null]
  ].map(([id,status,horizon,priority,size])=>({...template,id:String(id),status,horizon,priority,size,labels:[]}));
  const dump=View.dumpView({...base,hasStreams:true,items:inputs,catalogue,tab:'overview'});
  assert.deepEqual(dump,{...base,tab:'overview',streams:catalogue.filter(s=>!s.archivedAt).map(s=>({uid:s.uid,key:s.key,open:s.open})),strip:null,horizonFilter:'all',moving:null,
    rows:[{kind:'header',stream:home,open:4},row('6','doing',home,'short','',null,null),row('7','todo',home,'long','1y+',90,null),row('4','todo',home,'short','',50,null),row('5','todo',home,'mid','3m',50,null)],
    open:['6','4','5','7'].map(id=>{const it=inputs.find(it=>it.id===id);return {id,title:'Wire the webhook',status:it.status,stream:home,horizon:it.horizon,labels:[],priority:it.priority,size:it.size};})});
  const zero={...template,status:'todo',priority:0,size:'M',labels:[]};
  const second=View.dumpView({...base,hasStreams:true,items:[zero],catalogue:catalogue.map(s=>({...s,open:s.key===home?1:0})),tab:home});
  assert.deepEqual(second.rows,[row('3','todo',home,'short','',0,'M')]);
  assert.deepEqual(second.open,[{id:'3',title:'Wire the webhook',status:'todo',stream:home,horizon:'short',labels:[],priority:0,size:'M'}]);
  assert.deepEqual(Object.keys(second),Object.keys(dump));
});

test('the extracted QML context/snapshot preserves dump keys, including empty and error values',()=>{
  const doc=canonical();
  for(const view of ['list','error']) for(const blank of [true,false]) {
    const p={...base,view,items:doc.items,catalogue:doc.streams,store:{...doc,stale:false,error:null},
      ui:{...Keys.initialUi(),view},focusModel:doc.focus,liveSessionDone:{},currentTab:'overview',tabKey:'overview',
      previousCatalogue:[],storeIdMap:{},errored:false,rows:[],detailItem:blank?null:doc.items[2],pomodoro:{},
      stripShown:!blank,strip:{first:1,last:3,hiddenLeft:0,hiddenRight:0},displayRows:[],latches:{},sessionReopened:{},viewDayStart:0,
      footerModel:{text:'todocli · local only',urgent:false},banner:blank?'':'Busy',message:blank?'':'Saved'};
    const state=View.panelState(p), context=Keys.panelContext(p);
    assert.deepEqual(context,{currentTab:p.currentTab,tabKey:p.tabKey,catalogue:p.catalogue,previousCatalogue:[],hasStreams:true,items:doc.items,busy:false,idMap:{},rows:[],steps:blank?0:1,backend:'cli',focus:doc.focus,sessionDone:{},pomodoro:{},prefill:doc.focus.text});
    assert.deepEqual(View.dumpView(state),View.dumpView({...base,view,items:doc.items,catalogue:doc.streams,hasStreams:true,focus:doc.focus,tab:'overview',strip:blank?null:p.strip,displayRows:[],dayStart:0,latches:{},reopened:{},banner:blank?null:'Busy',message:blank?null:'Saved',footer:view==='error'?null:p.footerModel}));
    const empty=Keys.panelContext({...p,focusModel:null}); assert.equal(empty.prefill,'');
  }
});
