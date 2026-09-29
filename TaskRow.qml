pragma ComponentBehavior: Bound
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
  required property var panel
  property int rowIndex: 0

  readonly property bool current: panel.ui.cursor === rowIndex
  readonly property bool armed: panel.ui.armedId === modelData.id
  readonly property bool isDone: modelData.status === "done"
  readonly property bool isFocus: Model.isFocused(panel.focusModel, modelData.id)
  readonly property bool attached: Model.isAttached(panel.pomodoro, modelData.id)
  readonly property string progress: Model.planProgress(modelData)
  readonly property color fg: panel.contentForeground
  readonly property color dim: panel.dimForeground
  readonly property string family: panel.contentFontFamily
  property bool checkHovered: false
  readonly property bool rowHovered: rowHover.containsMouse

  // The right cluster's marks and ghost buttons share one look.
  component Mark: Text {
    anchors.verticalCenter: parent.verticalCenter
    color: row.dim
    font.family: row.family
    font.pixelSize: Style.font.caption
  }

  component Ghost: PanelActionButton {
    anchors.verticalCenter: parent.verticalCenter
    size: Style.space(24)
    foreground: row.dim
    hoverColor: Color.accent
    fontFamily: row.family
    fontSize: Style.font.caption
    enabled: !row.panel.errored
  }

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
    onContainsMouseChanged: if (containsMouse) row.panel.hoverRow(row.rowIndex)
    onClicked: row.panel.openDetail(row.modelData.id)
  }

  Text {
    id: rowCheck
    anchors.left: parent.left
    anchors.leftMargin: Style.spacing.lg
    anchors.verticalCenter: parent.verticalCenter
    text: Model.statusGlyph(row.modelData.status)
    // Ticking is no longer destructive: the box uses the accent under its
    // own pointer, and doing rows carry the accent always.
    color: row.checkHovered || row.modelData.status === "doing"
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
      onClicked: if (!row.panel.errored) row.panel.tickRow(row.modelData.id)
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

    Mark { visible: row.armed; text: "x again to delete"; color: Color.urgent }
    Mark { visible: !row.armed && row.progress !== ""; text: row.progress }
    Mark { visible: !row.armed && row.isFocus; text: Model.G.focus; color: Color.accent }
    Mark { visible: !row.armed && row.attached; text: Model.G.pomodoro; color: row.panel.pomodoro.running ? Color.accent : row.dim }

    Ghost {
      visible: !row.armed && row.rowHovered && !row.isFocus && !row.isDone
      iconText: Model.G.focus
      tooltipText: "Set focus (f)"
      onClicked: row.panel.rowKey(row.modelData.id, "f")
    }

    Ghost {
      visible: !row.armed && row.rowHovered && !row.attached && !row.isDone
      iconText: Model.G.pomodoro
      tooltipText: "Start pomodoro (p)"
      onClicked: row.panel.rowKey(row.modelData.id, "p")
    }
  }
}
