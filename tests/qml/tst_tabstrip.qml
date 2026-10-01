import QtQuick
import QtTest
import "../.." as Todo

Item {
  id: top
  width: 420; height: 200
  P2Panel { id: fakePanel }
  Todo.TabStrip { id: strip; width: 340; panel: fakePanel }
  TestCase {
    name: "TabStrip"; when: windowShown
    function geometry() { return JSON.stringify({h:strip.height,w:strip.width,widths:strip.widths}) }
    function test_whole_tabs_and_hover() {
      waitForRendering(strip)
      var before = geometry()
      for(var i=0;i<fakePanel.tabs.length;i++) {
        fakePanel.currentTab=fakePanel.tabs[i].uid
        wait(30); mouseMove(strip,10+i*40,10); wait(30)
        compare(geometry(),before)
        verify(strip.highlightedIndex<1 || (strip.layout.first<=strip.highlightedIndex && strip.layout.last>=strip.highlightedIndex))
        verify(strip.layout.last-strip.layout.first+1>=4)
      }
      fakePanel.currentTab = "done"; wait(30)
      compare(strip.layout.last,fakePanel.catalogue.length)
      verify(strip.layout.first <= strip.highlightedIndex)
      verify(strip.layout.last >= strip.highlightedIndex)
      verify(strip.widths.slice(strip.layout.first,strip.layout.last+1).reduce(function(a,b){return a+b},0) <= strip.windowBudget())
      compare(strip.widths[fakePanel.catalogue.length],strip.iconWidth)
      console.log("PROBE widths=" + JSON.stringify(strip.widths) + " budget=" + strip.windowBudget() + " layout=" + JSON.stringify(strip.layout))
      // G-6: Inbox plus three whole user tabs with Done current.
      verify(strip.layout.last - strip.layout.first >= 3)
      fakePanel.ui = Object.assign({},fakePanel.ui,{moving:{id:"1",targetUid:"s5"}})
      wait(30); compare(geometry(),before)
      mouseClick(strip,strip.width-16,strip.height/2); compare(fakePanel.ui.moving.targetUid,"s5")
      console.log("PROBE tabstrip " + JSON.stringify(strip.layout) + " widths=" + JSON.stringify(strip.widths))
      fakePanel.ui = Object.assign({},fakePanel.ui,{moving:null})
      fakePanel.currentTab="overview"
    }
  }
}
