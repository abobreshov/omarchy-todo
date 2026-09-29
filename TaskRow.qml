import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// One list row (UX §4.2): status glyph · title · plan n/m · (o) · (t). The
// status glyph is the click target upstream's checkbox was; it now marks
// done rather than deleting. Mouse and keyboard share one cursor.
Item {
  id: row

  required property var modelData
  property var panel: null
  property int rowIndex: 0

  readonly property bool current: panel !== null && panel.ui.cursor === rowIndex
  readonly property bool armed: panel !== null && panel.ui.armedId === modelData.id
  readonly property bool isDone: modelData.status === "done"
  readonly property bool isDoing: modelData.status === "doing"
  readonly property bool isFocus: panel !== null && panel.focusModel.taskId === modelData.id
  readonly property bool attached: panel !== null && panel.pomodoro.phase !== "idle" && panel.pomodoro.taskId === modelData.id
  readonly property bool disabled: panel !== null && panel.cliError
  readonly property string progress: Model.planProgress(modelData)
  readonly property color fg: panel ? panel.contentForeground : Color.foreground
  readonly property color dim: panel ? panel.dimForeground : Qt.darker(Color.foreground, 1.5)
  readonly property string family: panel ? panel.contentFontFamily : Style.font.family

  property bool checkHovered: false
  readonly property bool rowHovered: rowHover.containsMouse

  height: Math.max(rowCheck.implicitHeight, rowTitle.implicitHeight, cluster.implicitHeight) + Style.spacing.lg

  Rectangle {
    anchors.fill: parent
    radius: Style.cornerRadius
    color: row.armed
      ? Util.alpha(Color.urgent, 0.18)
      : (row.current ? Style.hoverFillFor(row.fg, Color.accent) : "transparent")
  }

  // Declared before the checkbox so the checkbox's own handler sits on top
  // and clicking the box ticks rather than opens.
  MouseArea {
    id: rowHover
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: Qt.PointingHandCursor
    onContainsMouseChanged: if (containsMouse && row.panel) row.panel.hoverRow(row.rowIndex)
    onClicked: if (row.panel) row.panel.openDetail(row.modelData.id)
  }

  Text {
    id: rowCheck
    anchors.left: parent.left
    anchors.leftMargin: Style.spacing.lg
    anchors.verticalCenter: parent.verticalCenter
    text: row.isDone ? Model.G.done : (row.isDoing ? Model.G.doing : Model.G.todo)
    // Ticking is no longer destructive: the box uses the accent under its
    // own pointer, and doing rows carry the accent always.
    color: row.checkHovered || row.isDoing
      ? Color.accent
      : (row.rowHovered && !row.isDone ? row.fg : row.dim)
    font.family: row.family
    font.pixelSize: Style.font.subtitle

    Behavior on color { ColorAnimation { duration: 80 } }

    MouseArea {
      anchors.fill: parent
      anchors.margins: -Style.spacing.sm
      hoverEnabled: true
      cursorShape: Qt.PointingHandCursor
      onContainsMouseChanged: row.checkHovered = containsMouse
      onClicked: if (row.panel && !row.disabled) row.panel.tickRow(row.modelData.id)
    }
  }

  Text {
    id: rowTitle
    anchors.left: rowCheck.right
    anchors.leftMargin: Style.spacing.controlGap
    anchors.right: cluster.left
    anchors.rightMargin: Style.spacing.md
    anchors.verticalCenter: parent.verticalCenter
    text: row.modelData.name
    textFormat: Text.PlainText
    elide: Text.ElideRight
    font.strikeout: row.isDone
    color: row.isDone ? row.dim : row.fg
    font.family: row.family
    font.pixelSize: Style.font.body
  }

  // Right cluster: plan progress, focus and pomodoro marks; ghost buttons on
  // hover; the armed-delete caption replaces it all.
  Row {
    id: cluster
    anchors.right: parent.right
    anchors.rightMargin: Style.spacing.lg
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.spacing.sm

    Text {
      visible: row.armed
      anchors.verticalCenter: parent.verticalCenter
      text: "x again to delete"
      color: Color.urgent
      font.family: row.family
      font.pixelSize: Style.font.caption
    }

    Text {
      visible: !row.armed && row.progress !== ""
      anchors.verticalCenter: parent.verticalCenter
      text: row.progress
      color: row.dim
      font.family: row.family
      font.pixelSize: Style.font.caption
    }

    Text {
      visible: !row.armed && row.isFocus
      anchors.verticalCenter: parent.verticalCenter
      text: Model.G.focus
      color: Color.accent
      font.family: row.family
      font.pixelSize: Style.font.caption
    }

    Text {
      visible: !row.armed && row.attached
      anchors.verticalCenter: parent.verticalCenter
      text: Model.G.pomodoro
      color: row.panel && row.panel.pomodoro.running ? Color.accent : row.dim
      font.family: row.family
      font.pixelSize: Style.font.caption
    }

    PanelActionButton {
      visible: !row.armed && row.rowHovered && !row.isFocus && !row.isDone
      anchors.verticalCenter: parent.verticalCenter
      iconText: Model.G.focus
      tooltipText: "Set focus (f)"
      size: Style.space(24)
      foreground: row.dim
      hoverColor: Color.accent
      fontFamily: row.family
      fontSize: Style.font.caption
      enabled: !row.disabled
      onClicked: if (row.panel) row.panel.rowKey(row.modelData.id, "f")
    }

    PanelActionButton {
      visible: !row.armed && row.rowHovered && !row.attached && !row.isDone
      anchors.verticalCenter: parent.verticalCenter
      iconText: Model.G.pomodoro
      tooltipText: "Start pomodoro (p)"
      size: Style.space(24)
      foreground: row.dim
      hoverColor: Color.accent
      fontFamily: row.family
      fontSize: Style.font.caption
      enabled: !row.disabled
      onClicked: if (row.panel) row.panel.rowKey(row.modelData.id, "p")
    }
  }
}
