import QtQuick
import QtTest
import "../.." as Todo
import "../../Model.js" as Model
import "../../Argv.js" as Argv
import "../../Priority.js" as Priority

// Production Panel + footer + detail; stubbed I/O never spawns anything.
Item {
  id: top
  width: 420; height: 560
  property double now: Date.parse("2026-10-01T12:00:00+01:00")
  Todo.Panel {
    id: panel
    clock: function() { return top.now }
    settings: ({backend:"cli",cliPath:"/nonexistent/todocli"})
  }
  Todo.StatusFooter {
    id: footer
    y: 530; width: 308
    panel: panel
  }
  Todo.FocusLine { id: focusLine; y: 440; width: 308; panel: panel }
  Todo.TaskList { id: scrollList; width: 340; maxHeight: 350; panel: panel; visible: false }
  TestCase {
    name: "PickerWiring"; when: windowShown
    function task(id, over) {
      return Model.normalize(Object.assign({id:id,name:"Task "+id,stream:"inbox",horizon:"short",priority:null,size:null,labels:["q4"]},over))
    }
    function cleanup() { scrollList.visible=false }
    function init() {
      panel.close()
      panel.store.active=false
      panel.store.error=null
      panel.store.loaded=true
      panel.store.hasStreams=true
      panel.store.streams=[{uid:"I",key:"inbox",name:"inbox",system:true,group:null,archivedAt:null,open:2}]
      panel.store.items=[task("4",{priority:80}),task("3",{priority:0,size:"M"})]
      panel.store.focus={text:"",taskId:null}
      panel.store.queue=[]
      panel.store.pending={action:{}}
      panel.store.writeProc.running=false
      panel.open()
      wait(30)
      panel.dispatch({type:"hover",index:panel.firstRow})
    }
    function assertFooterFits(name) {
      var actualFooter=findChild(panel,name)
      tryVerify(function(){return findChild(actualFooter,"pickerLoader").item!==null})
      var row=findChild(actualFooter,"pickerLoader").item
      verify(actualFooter.height>=row.height)
    }
    function test_focus_line_click_does_not_confirm_picker() {
      panel.store.focus={text:"Task 3",taskId:"3"}
      wait(30)
      panel.dispatch({type:"hover",index:panel.firstRow})
      panel.dispatch({type:"key",key:"!"})
      panel.dispatch({type:"key",key:"]"})
      compare(panel.ui.picker.id,"4"); compare(panel.ui.picker.choice,100)
      mouseClick(focusLine,20,focusLine.height/2)
      compare(panel.store.queue.length,0)
      compare(panel.store.items[0].priority,80)
      compare(panel.ui.picker.id,"4"); compare(panel.ui.picker.choice,100)
      compare(panel.ui.view,"list")
    }
    function test_step_click_twin_is_inert_under_picker() {
      panel.store.items=[task("3",{plan:[{text:"Step",done:false}]})]
      panel.openDetail("3")
      panel.dispatch({type:"key",key:"!"})
      panel.toggleStepAt(1)
      compare(panel.store.queue.length,0); compare(panel.detailItem.plan[0].done,false)
      verify(panel.ui.picker!==null)
      panel.dispatch({type:"esc"})
      panel.toggleStepAt(1)
      compare(panel.store.queue.length,1); compare(panel.detailItem.plan[0].done,true)
    }
    function test_real_footer_click_and_E25_rollback() {
      panel.dispatch({type:"key",key:"!"})
      compare(panel.ui.picker.id,"4")
      assertFooterFits("listStatusFooter")
      tryVerify(function(){return findChild(footer,"pickerCell_4")!==null})
      var cell=findChild(footer,"pickerCell_4"), point=cell.mapToItem(footer,cell.width/2,cell.height/2)
      mouseClick(footer,point.x,point.y)
      compare(panel.ui.picker,null)
      compare(panel.store.items[0].priority,100)
      compare(panel.store.queue.length,1)
      compare(JSON.stringify(panel.store.queue[0].action),JSON.stringify({type:"setPriority",id:"4",value:100}))
      compare(JSON.stringify(Argv.forAction("/fake",panel.store.queue[0].action)),JSON.stringify(["/fake","--source","omarchy","--json","priority","4","100"]))
      compare(panel.message,"#4 priority: critical (100)")
      panel.store.pending=panel.store.queue.shift()
      panel.store.finishWrite(1,false,"","refused")
      compare(panel.store.items[0].priority,80)
      compare(panel.store.items[0].labels[0],"q4")
      compare(panel.message,"Not saved — refused.")
    }
    function test_detail_fields_order_size_picker_and_mode_end() {
      panel.openDetail("3")
      wait(30)
      var status=findChild(panel,"detailStatus"), fields=findChild(panel,"detailFields"), labels=findChild(panel,"detailLabels")
      compare(fields.text,"priority: low (0) · size: M")
      var fieldsY=fields.mapToItem(status.parent,0,0).y
      verify(fieldsY>status.y); verify(labels.y>fieldsY)
      var mark=findChild(panel,"detailPriorityMark")
      compare(mark.text,Priority.markOf(0)); verify(mark.width>0)
      compare(labels.wrapMode,Text.WordWrap); compare(labels.elide,Text.ElideNone)
      panel.dispatch({type:"key",key:"z"})
      compare(panel.ui.picker.kind,"size")
      assertFooterFits("detailStatusFooter")
      panel.dispatch({type:"key",key:"2"})
      compare(panel.ui.picker,null)
      compare(panel.detailItem.size,"S")
      compare(panel.store.queue.length,1)
      compare(JSON.stringify(panel.store.queue[0].action),JSON.stringify({type:"setSize",id:"3",value:"S"}))
      compare(panel.message,"#3 size: S")
      panel.dispatch({type:"key",key:"!"})
      panel.openDetail("4")
      compare(panel.ui.picker,null)
      panel.dispatch({type:"key",key:"!"})
      panel.store.items=[]
      wait(30)
      compare(panel.ui.picker,null)
    }
    function test_read_drift_error_and_vertical_scroll_while_picking() {
      panel.dispatch({type:"key",key:"z"})
      panel.store.items=[task("4",{priority:80,horizon:"mid"}),task("3",{priority:0,size:"M"})]
      wait(30)
      compare(panel.ui.picker,null)
      compare(panel.message,"#4 is mid: size is for short-term tasks only")
      panel.dispatch({type:"key",key:"!"})
      panel.store.error={kind:"failed",message:"read failed"}
      compare(panel.ui.picker,null); compare(panel.ui.view,"error")
      panel.store.error=null
      var tasks=[]
      for(var i=1;i<=50;i++) tasks.push(task(String(i),{}))
      panel.store.items=tasks
      panel.store.streams=panel.store.streams.concat([{uid:"s",key:"work: a",name:"a",group:"work",system:false,archivedAt:null,open:0}])
      wait(30)
      panel.dispatch({type:"resetCursor"})
      panel.dispatch({type:"move",dy:1})
      panel.dispatch({type:"key",key:"!"})
      verify(panel.ui.picker!==null)
      scrollList.visible=true
      wait(30)
      var scroll=scrollList.rowsFlickable, cursor=panel.ui.cursor
      verify(scroll.interactive)
      scroll.contentY=0
      mouseWheel(scroll,100,50,0,-120); wait(50)
      verify(scroll.contentY>0)
      mouseWheel(scroll,100,50,-120,0); wait(30)
      mouseWheel(scroll,100,50,0,-120,Qt.NoButton,Qt.ShiftModifier); wait(30)
      compare(panel.currentTab,"overview")
      verify(!panel.wheelLatched); verify(scroll.interactive)
      compare(panel.ui.cursor,cursor)
    }
    function test_backend_change_hides_fields_and_cancels_mode() {
      panel.openDetail("3")
      panel.dispatch({type:"key",key:"!"})
      panel.settings=({backend:"json"})
      wait(30)
      compare(panel.ui.picker,null)
      panel.store.items=[task("3",{priority:0})]
      var fields=findChild(panel,"detailFields")
      compare(fields.text,"")
      compare(fields.visible,false)
      panel.dispatch({type:"key",key:"z"})
      compare(panel.message,"Priority and size need backend = cli.")
      compare(panel.ui.picker,null)
      panel.settings=({backend:"cli",cliPath:"/nonexistent/todocli"})
      wait(30)
    }
  }
}
