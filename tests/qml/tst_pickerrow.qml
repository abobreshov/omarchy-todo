import QtQuick
import QtTest
import qs.Commons
import "../.." as Todo
import "../../Pickers.js" as Pickers
import "../../Model.js" as Model

Item {
  id: top
  width: 340; height: 160
  property var task: Model.normalize({id:"9",name:"Task",priority:80,size:"S",horizon:"short"})
  property var clicks: []
  Todo.PickerRow {
    id: row
    mode: ({kind:"priority",id:"9",choice:75})
    item: top.task
    foreground: "white"
    fontFamily: "DejaVu Serif"
    onPicked: function(value) { top.clicks.push(value) }
  }
  TestCase {
    name: "PickerGeometry"; when: windowShown
    function cell(i) { return findChild(row,"pickerCell_"+i) }
    function geometry() {
      var boxes=[]
      for (var i=0;i<row.values.length;i++) boxes.push([cell(i).x,cell(i).width,cell(i).height])
      return JSON.stringify({width:row.implicitWidth,height:row.height,cells:boxes})
    }
    function test_caption_geometry_every_choice_hover_and_click() {
      for (var kind of ["priority","size"]) {
        row.mode={kind:kind,id:"9",choice:Pickers.current(kind,top.task)}
        row.fontFamily="DejaVu Serif"
        wait(20); waitForRendering(row)
        for (var family of ["DejaVu Serif",Style.font.family]) {
          row.fontFamily=family
          wait(20)
          var title=findChild(row,"pickerTitle"), names=Pickers.labels(kind)
          compare(title.width,row.fontMetrics.advanceWidth(title.text)+2*Style.space(4))
          for (var n=0;n<names.length;n++)
            compare(cell(n).width,row.fontMetrics.advanceWidth(names[n])+2*Style.space(4))
          console.log("PROBE picker font "+kind+" family="+family+" "+geometry())
        }
        compare(row.fontMetrics.font.pixelSize,Style.font.caption)
        var before=geometry(), values=Pickers.options(kind), labels=Pickers.labels(kind)
        verify(row.implicitWidth<=308)
        for (var i=0;i<values.length;i++) {
          compare(cell(i).width,row.fontMetrics.advanceWidth(labels[i])+2*Style.space(4))
          row.mode={kind:kind,id:"9",choice:values[i]}
          wait(10); compare(geometry(),before)
          var at=cell(i).mapToItem(row,cell(i).width/2,cell(i).height/2)
          mouseMove(row,at.x,at.y); wait(10); compare(geometry(),before)
          mouseClick(row,at.x,at.y)
          compare(top.clicks[top.clicks.length-1],values[i])
          mouseMove(top,330,150); compare(geometry(),before)
        }
        console.log("PROBE picker "+kind+" caption="+row.fontMetrics.font.pixelSize+" "+before)
      }
    }
  }
}
