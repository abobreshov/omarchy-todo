pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "View.js" as View

// The list view (UX §4.2) and the cli error body (UX §7 E4, E7, E8) under
// one header: "Todos", the open count and the + button (§7 E4 keeps the
// header, count off). The list body is the E5 / E14 banner, the focus line,
// the empty-state copy or the rows, and the help line; rows and buttons hand
// their keys and clicks to the panel, which owns the reducer and the store.
Column {
  id: list

  required property var panel
  readonly property bool listShown: panel.ui.view === "list"
  readonly property color fg: panel.contentForeground
  readonly property color dim: panel.dimForeground
  readonly property string family: panel.contentFontFamily

  component Copy: Text {
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    color: list.dim
    font.family: list.family
    font.pixelSize: Style.font.body
  }

  spacing: Style.spacing.md

  Item {
    width: parent.width
    height: Math.max(listTitle.implicitHeight, addButton.implicitHeight)

    Text {
      id: listTitle
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: "Todos"
      color: list.fg
      font.family: list.family
      font.pixelSize: Style.font.title
      font.bold: true
    }

    Text {
      id: listCount
      visible: list.listShown
      anchors.right: addButton.left
      anchors.rightMargin: Style.spacing.lg
      anchors.verticalCenter: parent.verticalCenter
      text: list.panel.countLabel
      color: list.dim
      font.family: list.family
      font.pixelSize: Style.font.caption
    }

    PanelActionButton {
      id: addButton
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      iconText: Model.G.plus
      tooltipText: "New todo (n)"
      foreground: list.fg
      fontFamily: list.family
      enabled: !list.panel.errored
      onClicked: list.panel.beginCompose()
    }
  }

  Column {
    visible: list.listShown
    width: parent.width
    spacing: Style.spacing.md

    // E5 / E14 banner above the last good list.
    Row {
      visible: list.panel.banner !== ""
      width: parent.width
      spacing: Style.spacing.controlGap

      Text {
        text: list.panel.errorModel ? list.panel.errorModel.glyph : Model.G.alert
        color: Color.urgent
        font.family: list.family
        font.pixelSize: Style.font.subtitle
      }

      Copy {
        width: parent.width - Style.space(24)
        text: list.panel.banner
        color: list.fg
      }
    }

    FocusLine {
      width: parent.width
      panel: list.panel
    }

    PanelSeparator {
      visible: list.panel.focusLineModel !== null
      foreground: list.fg
    }

    Copy {
      visible: list.panel.emptyCopy !== ""
      text: list.panel.emptyCopy
      topPadding: Style.spacing.md
      bottomPadding: Style.spacing.md
    }

    Column {
      width: parent.width
      spacing: 0
      // The last good list stays readable at 0.6 while the DB is busy.
      opacity: list.panel.errored ? 0.6 : 1

      Repeater {
        model: list.panel.listItems

        delegate: TaskRow {
          required property int index
          width: list.width
          panel: list.panel
          rowIndex: list.panel.firstRow + index
        }
      }
    }

    Copy {
      visible: list.panel.ui.help
      text: View.helpLine("list", list.panel.backend)
      font.pixelSize: Style.font.caption
    }
  }

  // The cli error body under the same header (UX §7 E4, E7, E8).
  ErrorView {
    visible: list.panel.ui.view === "error"
    width: parent.width
    panel: list.panel
  }
}
