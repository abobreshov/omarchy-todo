import QtQuick
import QtTest
import "../.." as Todo
import "../../Order.js" as Order
import "../../Model.js" as Model

Item {
  id: top
  width: 420; height: 520
  property double now: Date.parse("2026-09-30T23:59:50+01:00")
  Todo.Panel {
    id: panel
    clock: function() { return top.now }
    settings: ({ backend: "cli", cliPath: "/nonexistent/todocli" })
  }
  TestCase {
    name: "ViewDay"; when: windowShown
    function test_open_samples_day_and_reads_ticks_never_change_it() {
      compare(panel.viewDayStart,Order.dayStartOf(top.now))
      panel.open()
      var day=panel.viewDayStart
      top.now=Date.parse("2026-10-01T00:00:10+01:00")
      panel.clockNow=top.now
      panel.refresh()
      panel.dispatch({type:"tick"})
      panel.store.finishRead(0,false,JSON.stringify({version:1,tasks:[],streams:[],focus:"",focus_task:null}),"")
      wait(1100)
      compare(panel.viewDayStart,day)
      panel.close(); panel.open()
      compare(panel.viewDayStart,Order.dayStartOf(top.now))
      panel.store.hasStreams=true
      panel.store.streams=[{uid:"I",key:"inbox",name:"inbox",system:true,group:null,archivedAt:null,open:0},{uid:"s1",key:"work: a",name:"a",group:"work",archivedAt:null,open:0}]
      panel.store.items=[Model.normalize({id:"1",name:"done",status:"done",plan:[],horizon:"short",stream:"inbox",priority:null,size:null,completedAt:"2026-10-01T09:00:00.000Z"})]
      panel.store.loaded=true
      panel.selectTab("done")
      panel.store.error=null
      compare(panel.perform({type:"setStatus",id:"1",status:"todo"}),"ok")
      wait(30)
      compare(panel.sessionReopened["1"],"2026-10-01T09:00:00.000Z")
      compare(panel.displayRows[1].item.status,"todo")
      compare(panel.perform({type:"setStatus",id:"1",status:"done"}),"ok")
      wait(30)
      compare(panel.sessionReopened["1"],"2026-10-01T09:00:00.000Z")
      compare(panel.latches["1"],undefined)
      panel.close(); compare(Object.keys(panel.sessionReopened).length,0)
      console.log("PROBE viewDay=" + panel.viewDayStart + " clock=" + top.now)
    }
    function test_tab_routes_when_closed_and_in_detail() {
      panel.store.error=null
      compare(panel.tab("work:a"),"ok")
      compare(panel.currentTab,"s1")
      panel.dispatch({type:"selectTask",id:"1"})
      compare(panel.ui.view,"detail")
      compare(panel.tab("done"),"ok")
      compare(panel.currentTab,"done")
      panel.close()
      panel.dispatch({type:"close"})
      panel.store.streams=panel.store.streams.slice(0,1)
      wait(30)
      compare(panel.currentTab,"overview")
      compare(panel.tab("done"),"No streams yet · todocli stream add adds one")
      compare(panel.tab("0"),"ok")
      compare(panel.tab("inbox"),"ok")
      compare(panel.tab("nowhere"),"unknown stream")
      panel.store.hasStreams=false
      compare(panel.tab("done"),"Streams need a newer todocli.")
      panel.settings=({backend:"json"})
      wait(30)
      compare(panel.tab("done"),"Streams need backend = cli.")
    }
  }
}
