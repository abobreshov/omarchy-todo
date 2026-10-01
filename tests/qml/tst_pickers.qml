import QtQuick
import QtTest
import qs.Commons
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
      panel.store.sync=[]
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
    function ghostWithTip(item, tip) {
      if (item.tooltipText === tip) return item
      for (var i=0;i<item.children.length;i++) {
        var found=ghostWithTip(item.children[i],tip)
        if (found) return found
      }
      return null
    }
    function test_focus_ghosts_are_inert_under_picker() {
      panel.store.focus={text:"Task 3",taskId:"3"}
      wait(30)
      panel.dispatch({type:"hover",index:panel.firstRow})
      panel.dispatch({type:"key",key:"!"})
      panel.dispatch({type:"key",key:"]"})
      for (var tip of ["Start pomodoro (p)","Clear focus (f)"]) {
        var ghost=ghostWithTip(focusLine,tip)
        verify(ghost!==null)
        var point=ghost.mapToItem(focusLine,ghost.width/2,ghost.height/2)
        mouseMove(focusLine,point.x,point.y); wait(100)
        verify(focusLine.hovered)
        mouseClick(focusLine,point.x,point.y)
        compare(panel.store.queue.length,0)
        compare(panel.store.focus.taskId,"3"); compare(panel.store.focus.text,"Task 3")
        compare(panel.ui.picker.id,"4"); compare(panel.ui.picker.choice,100)
      }
    }
    // UX §24.3: while picking, no tab switch can hide the picker; the IPC
    // `tab` twin stays unguarded, so only the strip's click side refuses.
    function test_tab_click_is_inert_under_picker() {
      panel.store.streams=panel.store.streams.concat([{uid:"s",key:"work: a",name:"a",group:"work",system:false,archivedAt:null,open:0}])
      wait(30)
      panel.dispatch({type:"key",key:"!"})
      panel.dispatch({type:"key",key:"]"})
      compare(panel.ui.picker.id,"4"); compare(panel.ui.picker.choice,100)
      tryVerify(function(){return findChild(panel,"tabClick_s")!==null})
      var tab=findChild(panel,"tabClick_s")
      verify(tab.visible); verify(tab.enabled)
      mouseClick(tab,tab.width/2,tab.height/2)
      compare(panel.currentTab,"overview")
      compare(panel.ui.picker.id,"4"); compare(panel.ui.picker.choice,100)
      compare(panel.store.queue.length,0)
      compare(panel.tab("work: a"),"ok")
      compare(panel.currentTab,"s"); compare(panel.ui.picker,null)
      compare(panel.store.queue.length,0)
    }
    function addStreams(n) {
      var more=[]
      for (var i=0;i<n;i++) more.push({uid:"s"+i,key:"work: stream"+i,name:"stream"+i,group:"work",system:false,archivedAt:null,open:0})
      panel.store.streams=panel.store.streams.concat(more)
      wait(30)
    }
    // UX §24.3 and 4.2 rule 4: the overflow indicator's click goes through
    // the same guard, so under a picker it selects no hidden tab.
    function test_indicator_click_is_inert_under_picker() {
      addStreams(8)
      panel.dispatch({type:"key",key:"!"})
      panel.dispatch({type:"key",key:"]"})
      compare(panel.ui.picker.id,"4"); compare(panel.ui.picker.choice,100)
      tryVerify(function(){return findChild(panel,"indicatorRight")!==null})
      var ind=findChild(panel,"indicatorRight"), first=panel.stripFirst
      verify(ind.visible); verify(ind.hidden>0)
      var nearest=panel.tabs[panel.strip.last+2].uid
      mouseClick(ind,ind.width/2,ind.height/2)
      compare(panel.currentTab,"overview"); compare(panel.stripFirst,first)
      compare(panel.ui.picker.id,"4"); compare(panel.ui.picker.choice,100)
      compare(panel.store.queue.length,0)
      // The same click with the picker closed reaches the nearest hidden tab.
      panel.dispatch({type:"esc"}); compare(panel.ui.picker,null)
      mouseClick(ind,ind.width/2,ind.height/2)
      compare(panel.currentTab,nearest)
    }
    // UX §24.3 (hover is ignored while picking) and 4.1: under a picker a tab
    // shows no hover fill and no tooltip, nor does the overflow indicator,
    // as their clicks do nothing; colour and popups only, the geometry holds.
    function test_strip_hover_look_is_off_under_picker() {
      addStreams(8)
      tryVerify(function(){return findChild(panel,"tab_s0")!==null})
      var box=findChild(panel,"tab_s0"), fill=findChild(box,"tabFill_s0"), tip=findChild(box,"tabTip_s0")
      var ind=findChild(panel,"indicatorRight"), indTip=findChild(ind,"indicatorRightTip")
      verify(fill!==null); verify(tip!==null); verify(indTip!==null)
      function geometry() {
        var at=box.mapToItem(null,0,0), indAt=ind.mapToItem(null,0,0)
        return JSON.stringify([at.x,at.y,box.width,box.height,indAt.x,ind.width,ind.height,fill.width,fill.height])
      }
      var before=geometry()
      try {
        mouseMove(box,box.width/2,box.height/2)
        tryVerify(function(){return tip.visible}); verify(fill.color.a>0)
        panel.dispatch({type:"key",key:"!"})
        compare(panel.ui.picker.id,"4")
        compare(fill.color.a,0); tryVerify(function(){return !tip.visible})
        mouseMove(ind,ind.width/2,ind.height/2); wait(600)
        verify(!indTip.visible)
        mouseMove(box,box.width/2,box.height/2); wait(600)
        compare(fill.color.a,0); verify(!tip.visible)
        compare(geometry(),before)
        compare(panel.currentTab,"overview"); compare(panel.ui.picker.id,"4")
        panel.dispatch({type:"esc"}); compare(panel.ui.picker,null)
        verify(fill.color.a>0); tryVerify(function(){return tip.visible})
        mouseMove(ind,ind.width/2,ind.height/2)
        tryVerify(function(){return indTip.visible}); compare(fill.color.a,0)
        compare(geometry(),before)
      } finally {
        mouseMove(top,415,300)   // park the pointer off the strip and the rows
      }
    }
    // UX §24.1: the row mark's tone wiring (Priority.markTone on the value
    // and on isDone: a done row's mark is dim whatever its level).
    function test_row_mark_tones() {
      panel.store.items=[task("4",{priority:80}),task("3",{priority:100}),task("5",{priority:50}),
        task("6",{priority:100,status:"done",completedAt:"2026-10-01T10:00:00.000Z"})]
      wait(30)
      compare(String(findChild(panel,"rowPriorityMark_4").color),String(panel.contentForeground))
      compare(String(findChild(panel,"rowPriorityMark_3").color),String(Color.urgent))
      compare(String(findChild(panel,"rowPriorityMark_5").color),String(panel.dimForeground))
      var doneMark=findChild(panel,"rowPriorityMark_6")
      verify(doneMark!==null)
      compare(String(doneMark.color),String(panel.dimForeground))
    }
    function test_detail_mark_tones_and_fixed_footer() {
      panel.store.items=[task("4",{priority:100}),task("3",{priority:100,status:"done"})]
      panel.store.sync=[{name:"obsidian",enabled:false,lastOkAt:null,lastAttemptAt:null,intervalSec:null,error:null}]
      panel.openDetail("4"); wait(30)
      compare(String(findChild(panel,"detailPriorityMark").color),String(Color.urgent))
      var actualFooter=findChild(panel,"detailStatusFooter")
      verify(actualFooter.visible)
      var height=actualFooter.height
      verify(height>=Style.space(22))
      panel.dispatch({type:"key",key:"!"}); wait(30)
      compare(actualFooter.height,height)
      assertFooterFits("detailStatusFooter")
      panel.dispatch({type:"esc"}); wait(30)
      compare(actualFooter.height,height)
      panel.openDetail("3"); wait(30)
      compare(String(findChild(panel,"detailPriorityMark").color),String(panel.dimForeground))
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
