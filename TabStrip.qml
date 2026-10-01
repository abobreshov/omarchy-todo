pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui
import "Tabs.js" as Tabs

Item {
  id: strip
  required property var panel
  readonly property var tabs: panel.tabs
  readonly property var windowTabs: tabs.slice(1)
  readonly property real iconWidth: Style.space(Tabs.ICON_TAB_WIDTH)
  readonly property real indicatorWidth: Style.space(Tabs.INDICATOR_WIDTH)
  readonly property var widths: {
    metrics.font.family; metrics.font.pixelSize
    return windowTabs.map(function(t) { return tabWidth(t) })
  }
  readonly property alias fontMetrics: metrics
  readonly property real tabPadding: Style.space(8)
  readonly property string highlighted: panel.ui.moving ? panel.ui.moving.targetUid : panel.currentTab
  readonly property int highlightedIndex: windowTabs.map(function(t) { return t.uid }).indexOf(highlighted)
  readonly property var layout: Tabs.stripLayout(widths, 1, highlightedIndex, windowBudget(), panel.stripFirst)
  height: Style.space(28)
  onLayoutChanged: {
    if (panel.stripFirst !== layout.first) panel.stripFirst = layout.first
    panel.strip = layout
  }
  FontMetrics { id: metrics; font.family: strip.panel.contentFontFamily; font.pixelSize: Style.font.caption }
  function tabWidth(t) {
    if (t.key === "inbox" || t.key === "done") return iconWidth
    return metrics.advanceWidth(t.label) + 2 * tabPadding + (t.boundary ? 1 + 2 * Style.spacing.sm : 0)
  }
  function windowBudget() {
    var available = width - 2 * iconWidth
    var total = widths.slice(1).reduce(function(a, b) { return a + b }, 0)
    return Math.max(0, available - (total > available ? 2 * indicatorWidth : 0))
  }
  function choose(t) {
    if (panel.ui.moving) panel.pickTarget(t.uid)
    else panel.selectTab(t.uid)
  }
  function hiddenTip(left) {
    var hidden = left ? windowTabs.slice(1, layout.first) : windowTabs.slice(layout.last + 1)
    return "Hidden: " + hidden.map(function(t) { return t.label }).join(", ")
  }
  component TabBox: Item {
    id: box
    required property var tab
    objectName: "tab_" + tab.uid
    property bool boundary: false
    readonly property bool inert: strip.panel.ui.moving !== null && (tab.key === "overview" || tab.key === "done")
    readonly property color labelColor: current && !inert ? Color.accent : strip.panel.dimForeground
    readonly property bool current: strip.panel.currentTab === tab.uid
    readonly property real ruleWidth: boundary ? 1 + 2 * Style.spacing.sm : 0
    height: strip.height
    Accessible.name: tab.label
    Accessible.role: Accessible.PageTab
    Rectangle {
      width: 1; height: Style.space(12)
      x: Style.spacing.sm; anchors.verticalCenter: parent.verticalCenter
      color: strip.panel.dimForeground; opacity: box.boundary ? 0.4 : 0
    }
    Rectangle {
      x: box.ruleWidth; width: parent.width - x; height: parent.height
      radius: Style.cornerRadius
      color: hover.hovered && !box.inert ? Style.hoverFillFor(strip.panel.contentForeground, Color.accent) : "transparent"
      border.width: 1
      border.color: strip.panel.ui.moving && strip.panel.ui.moving.targetUid === box.tab.uid ? Color.accent : "transparent"
    }
    Text {
      x: box.ruleWidth; width: parent.width - x; height: parent.height
      horizontalAlignment: Text.AlignHCenter; verticalAlignment: Text.AlignVCenter
      text: box.tab.key === "overview" ? "\udb86\udc60" : box.tab.key === "inbox" ? "\udb81\ude87" : box.tab.key === "done" ? "\udb80\udd2d" : box.tab.label
      textFormat: Text.PlainText
      color: box.labelColor
      font.family: strip.panel.contentFontFamily; font.pixelSize: Style.font.caption
    }
    Rectangle {
      x: box.ruleWidth; width: parent.width - x; height: 2; anchors.bottom: parent.bottom
      color: Color.accent; opacity: box.current ? 1 : 0
    }
    HoverHandler { id: hover }
    MouseArea { objectName: "tabClick_" + box.tab.uid; anchors.fill: parent; enabled: !box.inert; onClicked: strip.choose(box.tab) }
    PanelToolTip {
      visible: hover.hovered
      text: Tabs.tooltipOf(box.tab, strip.panel.items, strip.panel.viewDayStart, strip.panel.catalogue)
      fontFamily: strip.panel.contentFontFamily
    }
  }
  component Indicator: Item {
    id: indicator
    required property bool toLeft
    objectName: toLeft ? "indicatorLeft" : "indicatorRight"
    readonly property string label: toLeft ? "‹" + (hidden ? hidden : "") : (hidden ? hidden : "") + "›"
    readonly property int hidden: toLeft ? strip.layout.hiddenLeft : strip.layout.hiddenRight
    width: strip.indicatorWidth; height: strip.height
    Text {
      anchors.centerIn: parent
      text: indicator.label
      color: indicator.hidden > 0 ? strip.panel.contentForeground : strip.panel.dimForeground
      font.family: strip.panel.contentFontFamily; font.pixelSize: Style.font.caption
    }
    HoverHandler { id: indicatorHover }
    MouseArea {
      anchors.fill: parent; enabled: indicator.hidden > 0
      onClicked: {
        var t = strip.windowTabs[indicator.toLeft ? strip.layout.first - 1 : strip.layout.last + 1]
        if (strip.panel.ui.moving && t.stream !== undefined) strip.panel.dispatch({ type: "highlightTab", uid: t.uid })
        else if (!strip.panel.ui.moving) strip.choose(t)
      }
    }
    PanelToolTip { visible: indicatorHover.hovered && indicator.hidden > 0; text: strip.hiddenTip(indicator.toLeft); fontFamily: strip.panel.contentFontFamily }
  }
  Row {
    height: parent.height
    TabBox { width: strip.iconWidth; tab: strip.tabs[0] }
    TabBox { width: strip.iconWidth; tab: strip.tabs[1] }
    Indicator { toLeft: true; visible: strip.layout.reserve > 0 }
    Repeater {
      model: strip.windowTabs.slice(strip.layout.first, strip.layout.last + 1)
      delegate: TabBox {
        required property var modelData
        tab: modelData; boundary: tab.boundary
        width: strip.widths[strip.windowTabs.map(function(t) { return t.uid }).indexOf(tab.uid)]
      }
    }
    Indicator { toLeft: false; visible: strip.layout.reserve > 0 }
  }
}
