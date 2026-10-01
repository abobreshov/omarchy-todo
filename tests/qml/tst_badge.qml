import QtQuick
import QtTest
import "../.." as Todo

Item {
  id: top
  width: 420; height: 300
  P2Panel { id: fakePanel }
  Column {
    id: rows
    width: 340
    Repeater {
      id: repeater
      model: [null,0,50,75,100]
      delegate: Todo.TaskRow {
        required property int index
        // modelData is the priority value here; itemData is the real task.
        itemData: ({id:String(index+1),name:"Same title",status:"todo",plan:[],horizon:index<2?"short":"mid",priority:modelData,size:index===1?"XL":null})
        width: rows.width; panel: fakePanel; badge: index<2?"":"3m"
      }
    }
  }
  TestCase {
    name: "BadgeGeometry"; when: windowShown
    function title(row) { return row.children.filter(function(c){return c.text==="Same title"})[0] }
    function cluster(row) { return row.children.filter(function(c){return String(c).indexOf("QQuickRow")===0})[0] }
    function badge(row) { return cluster(row).children.filter(function(c){return c.slotWidth!==undefined})[0] }
    function geom(row) {
      var t=title(row), focus=cluster(row).children.filter(function(c){return c.key==="f"})[0]
      return JSON.stringify({x:t.x,w:t.width,h:row.height,focusX:focus.mapToItem(row,0,0).x,badgeWidth:badge(row).width})
    }
    function test_slots_and_hover() {
      waitForRendering(rows)
      var before=geom(repeater.itemAt(0))
      var marks=["", "\udb82\udcbc", "\udb82\udcbd", "\udb82\udcbe", "\udb81\udebd"]
      for(var i=0;i<5;i++) {
        var row=repeater.itemAt(i)
        compare(geom(row),before); compare(row.priorityMark,marks[i])
        mouseMove(row,title(row).x-10,row.height/2); wait(20); compare(geom(row),before)
        var b=badge(row), point=b.mapToItem(row,b.width/2,b.height/2)
        mouseMove(row,point.x,point.y); wait(20); compare(geom(row),before)
        compare(b.chip,i===1)
        mouseMove(top,400,280); wait(20); compare(geom(row),before)
      }
      fakePanel.prioritySlot=false; wait(20)
      compare(title(repeater.itemAt(0)).x,title(repeater.itemAt(1)).x)
      verify(title(repeater.itemAt(0)).x<JSON.parse(before).x)
      console.log("PROBE badges " + before)
    }
  }
}
