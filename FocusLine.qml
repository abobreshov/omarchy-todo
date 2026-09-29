import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The focus line between the header and the list (UX §4.2, variants F0–F6):
// cursor row 0 when a focus exists, the pomodoro timer while one runs on
// the focus task, a hint when it runs elsewhere, and a ghost (t) / {x} on
// hover.
Item {
  id: line

  property var panel: null
  readonly property var model: panel ? panel.focusLineModel : null
  readonly property bool shown: model !== null
  readonly property bool selectable: shown && model.selectable
  readonly property bool current: selectable && panel.ui.cursor === 0
  readonly property bool hasFocus: shown && (model.variant !== "F0")
  readonly property bool hovered: area.containsMouse
  readonly property color fg: panel ? panel.contentForeground : Color.foreground
  readonly property color dim: panel ? panel.dimForeground : Qt.darker(Color.foreground, 1.5)
  readonly property string family: panel ? panel.contentFontFamily : Style.font.family
  readonly property bool timerShown: shown && model.timer !== ""
  readonly property bool ghostShown: shown && hovered && !timerShown && model.variant !== "F0" && model.variant !== "F5"

  visible: shown
  height: shown ? column.implicitHeight + Style.spacing.lg : 0

  Rectangle {
    anchors.fill: parent
    radius: Style.cornerRadius
    color: line.current ? Style.hoverFillFor(line.fg, Color.accent) : "transparent"
  }

  MouseArea {
    id: area
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: line.selectable ? Qt.PointingHandCursor : Qt.ArrowCursor
    onContainsMouseChanged: if (containsMouse && line.selectable && line.panel) line.panel.hoverRow(0)
    onClicked: if (line.selectable && line.panel) line.panel.activateFocusLine()

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

      Text {
        id: label
        anchors.left: glyph.right
        anchors.leftMargin: Style.spacing.controlGap
        anchors.right: trailing.left
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        text: line.shown ? line.model.text : ""
        textFormat: Text.PlainText
        elide: Text.ElideRight
        color: line.hasFocus ? line.fg : line.dim
        font.family: line.family
        font.pixelSize: line.hasFocus ? Style.font.body : Style.font.caption
      }

      Row {
        id: trailing
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.spacing.sm

        Text {
          visible: line.timerShown
          anchors.verticalCenter: parent.verticalCenter
          text: line.shown ? line.model.timerGlyph + " " + line.model.timer : ""
          textFormat: Text.PlainText
          color: line.shown && line.model.timerDim ? line.dim : Color.accent
          font.family: line.family
          font.pixelSize: Style.font.caption
        }

        PanelActionButton {
          visible: line.ghostShown
          anchors.verticalCenter: parent.verticalCenter
          iconText: Model.G.pomodoro
          tooltipText: "Start pomodoro (p)"
          size: Style.space(24)
          foreground: line.dim
          hoverColor: Color.accent
          fontFamily: line.family
          fontSize: Style.font.caption
          enabled: line.panel !== null && !line.panel.cliError
          onClicked: if (line.panel) line.panel.startPomodoro("focus")
        }

        PanelActionButton {
          visible: line.hasFocus && line.hovered
          anchors.verticalCenter: parent.verticalCenter
          iconText: Model.G.close
          tooltipText: "Clear focus (f)"
          size: Style.space(24)
          foreground: line.dim
          hoverColor: Color.urgent
          fontFamily: line.family
          fontSize: Style.font.caption
          enabled: line.panel !== null && !line.panel.cliError
          onClicked: if (line.panel) line.panel.perform({ type: "focus", id: "clear" })
        }
      }
    }

    Text {
      visible: line.shown && line.model.hint !== ""
      width: parent.width
      text: line.shown ? line.model.hint : ""
      textFormat: Text.PlainText
      elide: Text.ElideRight
      color: line.dim
      font.family: line.family
      font.pixelSize: Style.font.caption
    }
  }
}
