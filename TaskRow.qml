pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model
import "View.js" as View
import "Priority.js" as Priority

// One list row (UX §4.2): status glyph · title · plan n/m · (o) · (t) ·
// {del}. The status glyph is the click target upstream's checkbox was; it
// now marks done rather than deleting; {del} arms the row on the first
// click and deletes on the second, as `x x` does. Mouse and keyboard share
// one cursor.
//
// Hover is owned by a HoverHandler on the row, not by the row's MouseArea:
// a child MouseArea (the checkbox, a ghost button) takes the hover from the
// MouseArea beneath it, and a ghost that showed itself on that MouseArea's
// hover hid itself the moment the pointer reached it (the hover glitch).
// The handler stays hovered over its children. The right cluster keeps its
// geometry on hover too (View.rowActions: fixed slots, ghosts fade in), so
// nothing under the pointer moves or re-elides.
Item {
  id: row

  required property var modelData
  required property var panel
  property var itemData: modelData
  property string badge: ""
  property string streamCaption: ""
  readonly property bool prioritySlot: panel.prioritySlot === true
  readonly property bool badgeSlot: panel.badgeSlot === true
  readonly property var priorityValue: itemData.priority
  readonly property string priorityLevel: Priority.levelOf(priorityValue)
  readonly property string priorityMark: Priority.markOf(priorityValue)
  property int rowIndex: 0

  readonly property bool current: panel.ui.cursor === rowIndex
  readonly property bool armed: panel.ui.armedId === itemData.id
  readonly property bool isDone: itemData.status === "done"
  readonly property var actions: View.rowActions(itemData, { focus: panel.focusModel, pomodoro: panel.pomodoro, armed: armed })
  readonly property color fg: panel.contentForeground
  readonly property color dim: panel.dimForeground
  readonly property string family: panel.contentFontFamily
  readonly property int slotSize: Style.space(24)
  property bool checkHovered: false
  readonly property bool rowHovered: rowHoverHandler.hovered

  // The right cluster's marks and ghost buttons share one look.
  component Mark: Text {
    color: row.dim
    font.family: row.family
    font.pixelSize: Style.font.caption
  }

  // One fixed slot of the cluster: the state mark, or the ghost button that
  // fades in while the row is hovered (or while the spec holds it: the
  // armed row's {del}) and is live only then. Opacity and enabled only,
  // never visible or size, so nothing under the pointer moves.
  component Slot: Item {
    id: slot
    required property var spec
    required property string glyph
    required property string key
    property color markColor: row.dim
    property color hotColor: Color.accent
    readonly property bool lit: spec.ghost && (row.rowHovered || spec.held)
    width: row.slotSize
    height: row.slotSize
    anchors.verticalCenter: parent.verticalCenter

    Mark { anchors.centerIn: parent; visible: slot.spec.mark; text: slot.glyph; color: slot.markColor }

    PanelActionButton {
      anchors.centerIn: parent
      size: row.slotSize
      visible: !slot.spec.mark
      opacity: slot.lit ? 1 : 0
      enabled: slot.lit && !row.panel.errored
      iconText: slot.glyph
      tooltipText: slot.spec.tooltip
      foreground: slot.spec.held ? slot.hotColor : row.dim
      hoverColor: slot.hotColor
      fontFamily: row.family
      fontSize: Style.font.caption
      onClicked: row.panel.rowKey(row.itemData.id, slot.key)

      Behavior on opacity { NumberAnimation { duration: 80 } }
    }
  }

  height: Math.max(rowCheck.implicitHeight, rowTitle.implicitHeight, slotSize) + Style.spacing.lg

  Rectangle {
    anchors.fill: parent
    radius: Style.cornerRadius
    color: row.armed
      ? Util.alpha(Color.urgent, 0.18)
      : (row.current ? Style.hoverFillFor(row.fg, Color.accent) : "transparent")
  }

  // The cursor follows the pointer once per row entered; a row already
  // under the cursor dispatches nothing.
  HoverHandler {
    id: rowHoverHandler
    onHoveredChanged: if (hovered && !row.current) row.panel.hoverRow(row.rowIndex)
  }

  // Declared before the checkbox so the checkbox's own handler sits on top
  // and clicking the box ticks rather than opens.
  MouseArea {
    anchors.fill: parent
    cursorShape: Qt.PointingHandCursor
    onClicked: row.panel.openDetail(row.itemData.id)
  }

  Text {
    id: rowCheck
    anchors.left: parent.left
    anchors.leftMargin: Style.spacing.lg
    anchors.verticalCenter: parent.verticalCenter
    text: Model.statusGlyph(row.itemData.status)
    // Ticking is no longer destructive: the box uses the accent under its
    // own pointer, and doing rows carry the accent always.
    color: row.checkHovered || row.itemData.status === "doing"
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
      onClicked: if (!row.panel.errored) row.panel.tickRow(row.itemData.id)
    }
  }

  Item {
    id: priorityBox
    anchors.left: rowCheck.right
    anchors.leftMargin: row.prioritySlot ? Style.spacing.sm : 0
    anchors.verticalCenter: parent.verticalCenter
    width: row.prioritySlot ? Style.space(12) : 0
    height: Style.space(24)
    Text {
      anchors.centerIn: parent
      text: row.prioritySlot ? row.priorityMark : ""
      color: row.isDone || row.priorityLevel === "low" || row.priorityLevel === "medium" ? row.dim : row.priorityLevel === "critical" ? Color.urgent : row.fg
      font.family: row.family; font.pixelSize: Style.font.body
    }
    HoverHandler { id: priorityHover }
    PanelToolTip {
      visible: priorityHover.hovered && row.prioritySlot && row.priorityLevel !== ""
      text: "priority: " + row.priorityLevel + " (" + row.priorityValue + ")"
      fontFamily: row.family
    }
  }
  Text {
    id: rowTitle
    anchors.left: priorityBox.right
    anchors.leftMargin: Style.spacing.controlGap
    anchors.right: cluster.left
    anchors.rightMargin: Style.spacing.md
    anchors.verticalCenter: parent.verticalCenter
    text: row.itemData.name
    textFormat: Text.PlainText
    elide: Text.ElideRight
    font.strikeout: row.isDone
    color: row.isDone ? row.dim : row.fg
    font.family: row.family
    font.pixelSize: Style.font.body
  }

  // Right cluster: plan progress, then the focus, pomodoro and delete
  // slots; the armed-delete caption replaces the progress and the first
  // two, never the delete slot.
  Row {
    id: cluster
    anchors.right: parent.right
    anchors.rightMargin: Style.spacing.lg
    anchors.verticalCenter: parent.verticalCenter
    spacing: Style.spacing.sm

    Mark { anchors.verticalCenter: parent.verticalCenter; visible: row.streamCaption !== ""; text: "· " + row.streamCaption }
    Mark { anchors.verticalCenter: parent.verticalCenter; visible: row.actions.armed; text: row.actions.caption; color: Color.urgent }
    Mark { anchors.verticalCenter: parent.verticalCenter; visible: row.actions.progress !== ""; text: row.actions.progress }

    BadgeSlot {
      visible: row.badgeSlot
      panel: row.panel; badge: row.badge
      sizeValue: row.itemData.horizon === "short" ? row.itemData.size : null
      anchors.verticalCenter: parent.verticalCenter
    }
    Slot {
      visible: !row.actions.armed
      spec: row.actions.focus
      glyph: Model.G.focus
      key: "f"
      markColor: Color.accent
    }

    Slot {
      visible: !row.actions.armed
      spec: row.actions.pomodoro
      glyph: Model.G.pomodoro
      key: "p"
      markColor: row.actions.pomodoro.running ? Color.accent : row.dim
    }

    // The last, right-anchored child: it keeps its place across the arm,
    // so the second click lands where the first did.
    Slot {
      spec: row.actions.del
      glyph: Model.G.del
      key: "x"
      hotColor: Color.urgent
    }
  }
}
