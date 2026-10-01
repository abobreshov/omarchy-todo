pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui

Item {
  id: slot
  required property var panel
  property string badge: ""
  property var sizeValue: null
  readonly property bool chip: sizeValue !== null && sizeValue !== undefined
  readonly property real slotWidth: Math.max(horizonMetrics.advanceWidth, sizeMetrics.advanceWidth + 2 * Style.spacing.xxs + 2)
  width: slotWidth
  height: Style.space(24)
  TextMetrics { id: horizonMetrics; font.family: slot.panel.contentFontFamily; font.pixelSize: Style.font.caption; text: "1y+" }
  TextMetrics { id: sizeMetrics; font.family: slot.panel.contentFontFamily; font.pixelSize: Style.font.caption; text: "XL" }
  Rectangle {
    anchors.centerIn: parent
    width: parent.width
    height: label.implicitHeight + 2 * Style.spacing.xxs + 2
    color: "transparent"
    border.color: slot.panel.dimForeground
    border.width: 1
    radius: Style.spacing.xxs
    opacity: slot.chip ? 0.6 : 0
  }
  Text {
    id: label
    anchors.centerIn: parent
    text: slot.chip ? slot.sizeValue : slot.badge
    textFormat: Text.PlainText
    color: slot.panel.dimForeground
    font.family: slot.panel.contentFontFamily
    font.pixelSize: Style.font.caption
  }
  HoverHandler { id: hover }
  PanelToolTip {
    visible: hover.hovered && slot.chip
    text: slot.chip ? "size: " + slot.sizeValue : ""
    fontFamily: slot.panel.contentFontFamily
  }
}
