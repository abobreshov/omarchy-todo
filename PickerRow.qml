pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import "Pickers.js" as Pickers

// Fixed caption-font cells; selection and hover change paint only (UX §24.3).
Row {
  id: row
  required property var mode
  required property var item
  required property color foreground
  required property string fontFamily
  signal picked(var value)
  readonly property var values: Pickers.options(mode.kind)
  readonly property var labels: Pickers.labels(mode.kind)
  readonly property var currentValue: Pickers.current(mode.kind, item)
  readonly property int cellPadding: Style.space(4)
  readonly property alias fontMetrics: metrics
  height: title.implicitHeight + 2 * cellPadding
  FontMetrics { id: metrics; font: title.font }
  Text {
    id: title
    objectName: "pickerTitle"
    text: row.mode.kind === "priority" ? "Priority" : "Size"
    width: { metrics.font.family; metrics.font.pixelSize; return metrics.advanceWidth(text) + 2 * row.cellPadding }
    height: row.height
    verticalAlignment: Text.AlignVCenter
    color: row.foreground
    font.family: row.fontFamily
    font.pixelSize: Style.font.caption
  }
  Repeater {
    model: row.labels
    delegate: Item {
      id: cell
      required property string modelData
      required property int index
      objectName: "pickerCell_" + index
      readonly property var value: row.values[index]
      readonly property bool current: value === row.currentValue
      readonly property bool choice: value === row.mode.choice
      width: { metrics.font.family; metrics.font.pixelSize; return metrics.advanceWidth(modelData) + 2 * row.cellPadding }
      height: row.height
      Rectangle { anchors.fill: parent; color: Style.hoverFillFor(row.foreground, Color.accent); opacity: hover.hovered ? 1 : 0 }
      Rectangle {
        anchors.fill: parent
        color: "transparent"
        border.width: 1
        border.color: Color.accent
        opacity: cell.choice ? 1 : 0
      }
      Rectangle {
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        height: 2
        color: Color.accent
        opacity: cell.current ? 1 : 0
      }
      Text {
        anchors.centerIn: parent
        text: cell.modelData
        color: row.foreground
        font: title.font
      }
      HoverHandler { id: hover }
      MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: row.picked(cell.value)
      }
    }
  }
}
