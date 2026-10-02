pragma ComponentBehavior: Bound
import QtQuick
import QtQml.Models
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "View.js" as View
import "Cursor.js" as Cursor

Column {
  id: list
  required property var panel
  property real maxHeight: Style.space(520)
  readonly property bool listShown: panel.ui.view === "list"
  readonly property color fg: panel.contentForeground
  readonly property color dim: panel.dimForeground
  readonly property string family: panel.contentFontFamily
  // What the column lays out around the rows: the pinned block and its gap,
  // and the help line with its own gap only while shown (a hidden child
  // takes no gap). The card asks for it and the rows viewport is the rest.
  readonly property real chromeHeight: pinned.implicitHeight + spacing + (help.visible ? help.implicitHeight + spacing : 0)
  readonly property real desiredHeight: chromeHeight + rowsScroll.contentHeight
  readonly property alias rowsFlickable: rowsScroll
  spacing: Style.spacing.md
  function ensureCursor(reset) {
    if (reset) { rowsScroll.contentY = 0; return }
    var index = panel.ui.cursor - panel.firstRow
    var row = rowsRepeater.itemAt(index)
    if (row) rowsScroll.contentY = Cursor.scrollTo(rowsScroll.contentY, rowsScroll.height, row.y, row.height)
  }
  component Copy: Text {
    width: parent.width
    textFormat: Text.PlainText; wrapMode: Text.WordWrap
    color: list.dim; font.family: list.family; font.pixelSize: Style.font.body
  }
  Column {
    id: pinned
    width: parent.width
    spacing: Style.spacing.md
    Item {
      width: parent.width
      height: Math.max(title.implicitHeight, addButton.implicitHeight)
      Text {
        id: title
        anchors.left: parent.left; anchors.verticalCenter: parent.verticalCenter
        text: "Todos"; color: list.fg
        font.family: list.family; font.pixelSize: Style.font.title; font.bold: true
      }
      Text {
        visible: list.listShown
        anchors.right: addButton.left; anchors.rightMargin: Style.spacing.lg; anchors.verticalCenter: parent.verticalCenter
        text: list.panel.countLabel; color: list.dim
        font.family: list.family; font.pixelSize: Style.font.caption
      }
      PanelActionButton {
        id: addButton
        anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter
        iconText: Model.G.plus; tooltipText: "New todo (n)"
        foreground: list.fg; fontFamily: list.family
        enabled: !list.panel.errored && list.panel.currentTab !== "done"
        onClicked: list.panel.beginCompose()
      }
    }
    Copy { visible: list.listShown && list.panel.banner !== ""; text: list.panel.banner; color: Color.urgent }
    FocusLine { width: parent.width; panel: list.panel; visible: list.listShown && list.panel.focusLineModel !== null }
    Loader {
      active: list.panel.stripShown
      visible: active
      width: parent.width
      height: active ? Style.space(28) : 0
      sourceComponent: TabStrip { panel: list.panel }
    }
    PanelSeparator { visible: list.listShown && (list.panel.focusLineModel !== null || list.panel.stripShown); foreground: list.fg }
  }
  Flickable {
    id: rowsScroll
    objectName: "todoRows"
    visible: list.listShown
    width: parent.width
    // chromeHeight, as desiredHeight counts it: subtracting a hidden help
    // line's implicitHeight clipped the last row (2.1.1).
    height: Math.min(contentHeight, Math.max(0, list.maxHeight - list.chromeHeight))
    contentWidth: width; contentHeight: content.implicitHeight
    clip: true; boundsBehavior: Flickable.StopAtBounds
    interactive: contentHeight > height && !list.panel.wheelLatched
    flickableDirection: Flickable.VerticalFlick
    Column {
      id: content
      width: rowsScroll.width
      opacity: list.panel.errored ? 0.6 : 1
      Copy { visible: list.panel.emptyCopy !== ""; text: list.panel.emptyCopy; topPadding: Style.spacing.md; bottomPadding: Style.spacing.md }
      Repeater {
        id: rowsRepeater
        model: list.panel.displayRows
        delegate: DelegateChooser {
          role: "kind"
          DelegateChoice {
            roleValue: "item"
            delegate: TaskRow {
              required property int index
              width: list.width; panel: list.panel
              rowIndex: list.panel.firstRow + index
              itemData: modelData.item
              badge: modelData.badge
              streamCaption: modelData.streamCaption
            }
          }
          DelegateChoice { delegate: SectionHeader { width: list.width; panel: list.panel } }
        }
      }
      TabWheel { panel: list.panel; objectName: "rowsShiftWheel"; enabled: list.panel.stripShown }
    }
  }
  Copy {
    id: help
    visible: list.listShown && list.panel.ui.help
    height: visible ? implicitHeight : 0
    text: View.helpLine("list", list.panel.backend, list.panel.metadata, list.panel.stripShown, list.panel.tabKey, list.panel.ui.picker, list.panel.store.hasNorthStar)
    font.pixelSize: Style.font.caption
  }
  ErrorView { visible: list.panel.ui.view === "error"; width: parent.width; panel: list.panel }
  TabWheel { id: horizontalWheel; panel: list.panel; shiftOnly: false; objectName: "horizontalTabWheel"; enabled: list.panel.stripShown }
  TabWheel { panel: list.panel; objectName: "pinnedShiftWheel"; enabled: list.panel.stripShown }
  Connections {
    target: list.panel
    function onCursorScroll(reset) { Qt.callLater(function() { list.ensureCursor(reset) }) }
  }
}
