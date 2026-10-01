import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lib } from './helpers.mjs';
import { task } from './p2-helpers.mjs';
const C=lib('Cursor.js');
const row=id=>({kind:'item',item:task(id)});
test('skip focus placeholder, headers, sections and days; clamp and empty (AC-ST.24)',()=>{
  const rows=[{kind:'focus',selectable:false},{kind:'header'},row(1),{kind:'section'},{kind:'day'},row(2)];
  assert.equal(C.nextSelectable(rows,-1,1),2); assert.equal(C.nextSelectable(rows,2,1),5);
  assert.equal(C.nextSelectable(rows,5,-1),2); assert.equal(C.nextSelectable(rows,5,1),5);
  assert.equal(C.nextSelectable([],0,1),-1); assert.equal(C.anchorOf({cursor:0},rows),'');
  assert.equal(C.anchorOf({cursor:0},[{kind:'focus'}]),'focus');
});
test('identity on reorder, delete, empty, temporary IDs and held state (AC-ST.44)',()=>{
  let ui={cursor:2,cursorKey:'item:12',selectedId:'t1',armedId:'t1',moving:{id:'t1',targetUid:'s8'}};
  ui=C.reanchor(ui,[row(12),row(9),row(3)],{t1:'22'});
  assert.equal(ui.cursor,0); assert.equal(ui.cursorKey,'item:12'); assert.equal(ui.selectedId,'22');
  assert.equal(ui.armedId,''); assert.equal(ui.moving.id,'22');
  ui=C.reanchor(ui,[row(9),row(3)],{}); assert.equal(ui.cursorKey,'item:9');
  assert.equal(C.reanchor({...ui,cursor:1,cursorKey:'gone'},[row(9),{kind:'day'}]).cursor,0);
  assert.equal(C.reanchor(ui,[]).cursorKey,'');
  assert.equal(C.reanchor({cursor:0,cursorKey:'item:t1',armedId:'t1'},[row(22)],{t1:'22'}).armedId,'22');
  assert.equal(C.reanchor({cursor:0},[row(9)]).cursorKey,'item:9');
  assert.equal(C.translatedKey('focus',{}),'focus');
});
test('scroll minimally to show the whole cursor row',()=>{
  assert.equal(C.scrollTo(50,100,40,30),40); assert.equal(C.scrollTo(50,100,140,30),70);
  assert.equal(C.scrollTo(50,100,80,30),50); assert.equal(C.scrollTo(0,10,0,30),20);
});


test('Done opens on the first item under its newest day, even with global focus',()=>{
  const rows=[{kind:'focus',selectable:true},{kind:'day'},row(6),row(5)];
  assert.equal(C.firstSelectable(rows,true),2);
  assert.equal(C.firstSelectable(rows,false),0);
  assert.equal(C.firstSelectable([{kind:'day'}],true),0);
});
