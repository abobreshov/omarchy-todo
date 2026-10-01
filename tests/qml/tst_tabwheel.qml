import QtQuick
import QtTest
import "../.." as Todo

Item {
  id: top
  width: 420; height: 400
  P2Panel { id: fakePanel }
  Todo.TaskList { id: list; width: 340; maxHeight: 300; panel: fakePanel }
  TestCase {
    name: "TabWheelDelivery"; when: windowShown
    function reset(count) { fakePanel.fill(count); fakePanel.currentTab="I"; fakePanel.wheelState=({}); list.rowsFlickable.contentY=0; wait(50) }
    function test_vertical_and_horizontal_delivery() {
      reset(50)
      var scroll=list.rowsFlickable
      mouseWheel(scroll,100,50,0,-120); wait(50)
      verify(scroll.contentY>0); compare(fakePanel.currentTab,"I")
      var before=scroll.contentY
      mouseWheel(scroll,100,50,-60,-120); wait(50)
      verify(scroll.contentY>before); compare(fakePanel.currentTab,"I")
      scroll.contentY=scroll.contentHeight-scroll.height; wait(30)
      before=scroll.contentY
      mouseWheel(scroll,100,50,0,-120); wait(30); compare(scroll.contentY,before); compare(fakePanel.currentTab,"I")
      mouseWheel(scroll,100,50,-60,-120); wait(20); compare(fakePanel.currentTab,"I")
      // Drift at the bound never latched: reversing immediately still scrolls.
      verify(!fakePanel.wheelLatched)
      mouseWheel(scroll,100,50,0,120); wait(50)
      verify(scroll.contentY<before); compare(fakePanel.currentTab,"I")
      fakePanel.wheelState=({})
      mouseWheel(scroll,100,50,-120,0); wait(30); compare(fakePanel.currentTab,"s1")
      // Reset from tab switching may have scheduled contentY=0; let it settle.
      before=scroll.contentY
      mouseWheel(scroll,100,50,0,-120); wait(30)
      compare(fakePanel.currentTab,"s1")
      // AC-ST.47: the following vertical event in H's active window stays put.
      compare(scroll.contentY,before)
    }
    function test_modified_horizontal_axes_on_rows_and_pinned() {
      for (var modifiers of [Qt.ShiftModifier,Qt.AltModifier]) {
        for (var onRows of [true,false]) {
          reset(50)
          var before=list.rowsFlickable.contentY
          mouseWheel(onRows?list.rowsFlickable:list,100,onRows?50:10,-120,0,Qt.NoButton,modifiers)
          compare(fakePanel.currentTab,"s1")
          compare(list.rowsFlickable.contentY,before)
        }
      }
    }
    function test_hidden_strip_and_detail_guard() {
      reset(1)
      fakePanel.stripShown=false
      fakePanel.wheelTab({ax:-120,at:Date.now()}); compare(fakePanel.currentTab,"I")
      fakePanel.stripShown=true
      fakePanel.ui=Object.assign({},fakePanel.ui,{view:"detail"})
      fakePanel.wheelTab({ax:-120,at:Date.now()}); compare(fakePanel.currentTab,"I")
      fakePanel.ui=Object.assign({},fakePanel.ui,{view:"list"})
    }
    function test_short_shift_and_latch() {
      reset(1)
      mouseWheel(list.rowsFlickable,100,10,0,-120); compare(fakePanel.currentTab,"I")
      fakePanel.wheelState=({})
      mouseWheel(list.rowsFlickable,100,10,-120,0); compare(fakePanel.currentTab,"s1")
      wait(50)
      mouseWheel(list.rowsFlickable,100,10,-120,0); compare(fakePanel.currentTab,"s1")
      fakePanel.wheelState=({})
      mouseWheel(list,100,10,0,-120,Qt.NoButton,Qt.ShiftModifier); compare(fakePanel.currentTab,"s2")
      fakePanel.wheelState=({})
      var before=list.rowsFlickable.contentY
      mouseWheel(list.rowsFlickable,100,10,0,-120,Qt.NoButton,Qt.ShiftModifier); compare(fakePanel.currentTab,"s3")
      compare(list.rowsFlickable.contentY,before)
      for(var name of ["horizontalTabWheel","pinnedShiftWheel","rowsShiftWheel"]) {
        var handler=findChild(list,name)
        verify(handler!==null); verify((handler.acceptedDevices & PointerDevice.TouchPad)!==0)
        compare(handler.acceptedModifiers,name==="horizontalTabWheel"?Qt.KeyboardModifierMask:Qt.ShiftModifier)
      }
      console.log("PROBE wheel tab=" + fakePanel.currentTab + " contentY=" + list.rowsFlickable.contentY)
    }
  }
}
