pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The focus line between the header and the list (UX §4.2, variants F0–F6):
// cursor row 0 when a focus exists, the pomodoro timer while one runs on
// the focus task, a hint when it runs elsewhere, and a ghost (t) / {x} on
// hover. As in TaskRow, a HoverHandler owns the hover (a ghost's own
// MouseArea takes it from the MouseArea beneath) and the ghosts the
// variant lays out (`model.actions`) keep their space and only fade in.
Item {
  id: line

  required property var panel
  readonly property var model: panel.focusLineModel
  readonly property bool shown: model !== null
  readonly property bool selectable: shown && model.selectable
  readonly property bool current: selectable && panel.ui.cursor === 0
  readonly property bool hasFocus: shown && model.variant !== "F0"
  readonly property bool hovered: hoverHandler.hovered
  readonly property color fg: panel.contentForeground
  readonly property color dim: panel.dimForeground
  readonly property string family: panel.contentFontFamily
  readonly property bool timerShown: shown && model.timer !== ""
  readonly property bool ghostPomodoro: shown && model.actions.pomodoro
  readonly property bool ghostClear: shown && model.actions.clear

  component Ghost: PanelActionButton {
    anchors.verticalCenter: parent.verticalCenter
    size: Style.space(24)
    opacity: line.hovered ? 1 : 0
    enabled: line.hovered && !line.panel.errored
    foreground: line.dim
    hoverColor: Color.accent
    fontFamily: line.family
    fontSize: Style.font.caption

    Behavior on opacity { NumberAnimation { duration: 80 } }
  }

  component Caption: Text {
    textFormat: Text.PlainText
    elide: Text.ElideRight
    color: line.dim
    font.family: line.family
    font.pixelSize: Style.font.caption
  }

  visible: shown
  height: shown ? column.implicitHeight + Style.spacing.lg : 0

  Rectangle {
    anchors.fill: parent
    radius: Style.cornerRadius
    color: line.current ? Style.hoverFillFor(line.fg, Color.accent) : "transparent"
  }

  HoverHandler {
    id: hoverHandler
    onHoveredChanged: if (hovered && line.selectable && !line.current) line.panel.hoverRow(0)
  }

  MouseArea {
    id: area
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: line.selectable ? Qt.PointingHandCursor : Qt.ArrowCursor
    onClicked: if (line.selectable) line.panel.activateFocusLine()

    // F6's tooltip; it yields to a ghost's own tooltip, which takes the hover.
    PanelToolTip {
      visible: line.shown && line.model.tooltip !== "" && area.containsMouse
      text: line.shown ? line.model.tooltip : ""
      fontFamily: line.family
    }
  }

  Column {
    id: column
    anchors.left: parent.left
    anchors.right: parent.right
    anchors.leftMargin: Style.spacing.lg
    anchors.rightMargin: Style.spacing.lg
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.spacing.sm

    Item {
      width: parent.width
      height: Math.max(glyph.implicitHeight, label.implicitHeight, Style.space(24))

      Text {
        id: glyph
        anchors.left: parent.left
        anchors.verticalCenter: parent.verticalCenter
        text: Model.G.focus
        color: line.hasFocus ? Color.accent : line.dim
        font.family: line.family
        font.pixelSize: Style.font.subtitle
      }

      Caption {
        id: label
        anchors.left: glyph.right
        anchors.leftMargin: Style.spacing.controlGap
        anchors.right: trailing.left
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        text: line.shown ? line.model.text : ""
        color: line.hasFocus ? line.fg : line.dim
        font.pixelSize: line.hasFocus ? Style.font.body : Style.font.caption
      }

      Row {
        id: trailing
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.spacing.sm

        Caption {
          visible: line.timerShown
          anchors.verticalCenter: parent.verticalCenter
          text: line.shown ? line.model.timerGlyph + " " + line.model.timer : ""
          color: line.shown && line.model.timerDim ? line.dim : Color.accent
        }

        Ghost {
          visible: line.ghostPomodoro
          iconText: Model.G.pomodoro
          tooltipText: "Start pomodoro (p)"
          onClicked: line.panel.startPomodoro("focus")
        }

        Ghost {
          visible: line.ghostClear
          iconText: Model.G.close
          tooltipText: "Clear focus (f)"
          hoverColor: Color.urgent
          onClicked: line.panel.perform({ type: "focus", id: "clear" })
        }
      }
    }

    Caption {
      visible: line.shown && line.model.hint !== ""
      width: parent.width
      text: line.shown ? line.model.hint : ""
    }
  }
}
