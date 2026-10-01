import QtQuick
import QtTest
import qs.Commons
import "../.." as Todo
import "../../Tabs.js" as Tabs

Item {
  id: top
  width: 420; height: 200
  P2Panel { id: fakePanel }
  readonly property var strip: stripLoader.item
  Loader {
    id: stripLoader
    width: Style.space(340) - 2 * (Style.spacing.popupPadding + Math.max(1, Style.space(2)))
    active: fakePanel.ui.view === "list"
    sourceComponent: Todo.TabStrip { width: stripLoader.width; panel: fakePanel }
  }
  TestCase {
    name: "TabStrip"; when: windowShown
    function init() {
      fakePanel.ui = Object.assign({}, fakePanel.ui, {view:"list",moving:null})
      fakePanel.currentTab = "overview"
      fakePanel.stripFirst = 1
      tryVerify(function() { return top.strip !== null })
      waitForRendering(strip)
    }
    function box(uid) { return findChild(strip,"tab_" + uid) }
    function layout(want) {
      compare(strip.layout.first,want[0]); compare(strip.layout.last,want[1])
      compare(strip.layout.hiddenLeft,want[2]); compare(strip.layout.hiddenRight,want[3])
    }
    function geometry() {
      var left=findChild(strip,"indicatorLeft"), right=findChild(strip,"indicatorRight")
      return JSON.stringify({h:strip.height,w:strip.width,widths:strip.widths,
        overview:[box("overview").x,box("overview").width,box("overview").height],
        inbox:[box("I").x,box("I").width,box("I").height],
        indicators:[left.width,left.height,right.width,right.height]})
    }
    function boxesUnchanged(before) {
      compare(geometry(),before)
      for (var tab of fakePanel.tabs) {
        var entry=box(tab.uid)
        if (!entry) continue
        var at=strip.windowTabs.map(function(t){return t.uid}).indexOf(tab.uid)
        compare(entry.width,at<0?strip.iconWidth:strip.widths[at])
        compare(entry.height,strip.height)
        var point=entry.mapToItem(strip,entry.width/2,entry.height/2)
        mouseMove(strip,point.x,point.y); wait(10)
        compare(geometry(),before)
        mouseMove(top,410,190); compare(geometry(),before)
      }
    }
    function test_AC_ST_60_font_width_window_and_done_geometry() {
      compare(strip.width,Style.space(340)-2*(Style.spacing.popupPadding + Math.max(1, Style.space(2))))
      compare(strip.widths[2],strip.fontMetrics.advanceWidth("leadtone")+2*strip.tabPadding)
      console.log("PROBE stripWidth=" + strip.width + " widths=" + JSON.stringify(strip.widths))
      compare(JSON.stringify(strip.widths),JSON.stringify([32,67,64,58,49,46,32]))
      compare(strip.windowBudget(),196)
      layout([1,3,0,3])
      console.log("PROBE overview="+JSON.stringify(strip.layout))
      verify(box("done")===null)
      compare(findChild(strip,"indicatorRight").label,"3›")
      compare(strip.hiddenTip(false),"Hidden: todo, goals, Done")
      var before=geometry()
      boxesUnchanged(before)
      for (var uid of ["s5","done"]) {
        fakePanel.currentTab=uid; wait(30)
        layout([3,6,2,0])
        console.log("PROBE "+(uid==="s5"?"goals":"done")+"="+JSON.stringify(strip.layout))
        compare(strip.windowTabs.slice(strip.layout.first,strip.layout.last+1).map(function(t){return t.label}).join(","),"dataart,todo,goals,Done")
        // Three user streams plus the pinned Inbox meet G-6.
        compare(strip.windowTabs.slice(strip.layout.first,strip.layout.last+1).filter(function(t){return t.stream!==undefined}).length+1,4)
        boxesUnchanged(before)
        var done=box("done"), overview=box("overview")
        compare(done.width,overview.width); compare(done.height,overview.height)
        compare(done.boundary,false); compare(done.ruleWidth,0)
      }
    }
    function test_AC_ST_27_each_move_target_and_real_done_click() {
      fakePanel.currentTab="I"
      var before=geometry()
      for (var stream of fakePanel.catalogue) {
        fakePanel.ui=Object.assign({},fakePanel.ui,{moving:{id:"1",targetUid:stream.uid}})
        wait(30); boxesUnchanged(before)
        var target=box(stream.uid)
        verify(target!==null)
        var pos=target.mapToItem(strip,0,0)
        verify(pos.x>=0 && pos.x+target.width<=strip.width)
        compare(findChild(strip,"tabClick_overview").enabled,false)
        if (box("done")) {
          compare(findChild(strip,"tabClick_done").enabled,false)
          compare(box("done").labelColor,fakePanel.dimForeground)
        }
      }
      var done=box("done")
      verify(done!==null)
      var point=done.mapToItem(strip,done.width/2,done.height/2)
      mouseClick(strip,point.x,point.y)
      compare(fakePanel.ui.moving.targetUid,"s5")
      compare(fakePanel.currentTab,"I")
      var movingTabs=fakePanel.tabs.filter(function(t){return t.stream!==undefined})
      for (var tab of movingTabs) verify(Tabs.step(fakePanel.tabs,tab.uid,1,true).uid!=="done")
    }
    function test_detail_round_trip_keeps_window() {
      fakePanel.currentTab="s5"; wait(30); layout([3,6,2,0])
      // With the Inbox pinned, the remembered window must stay at 3.
      fakePanel.currentTab="I"; wait(30)
      fakePanel.ui=Object.assign({},fakePanel.ui,{view:"detail"}); wait(30)
      compare(top.strip,null); compare(fakePanel.stripFirst,3)
      fakePanel.ui=Object.assign({},fakePanel.ui,{view:"list"}); wait(30)
      layout([3,6,2,0])
      compare(strip.widths[2],strip.fontMetrics.advanceWidth("leadtone")+2*strip.tabPadding)
    }
  }
}
