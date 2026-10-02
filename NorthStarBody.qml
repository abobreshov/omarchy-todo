pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui
import "NorthStar.js" as NorthStar
import "NorthStarKeys.js" as NorthStarKeys

// The North Star popup's card (ADDENDUM-S11 §5.3): the todo panel's kit
// shape, a KeyboardPanel with a PanelKeyCatcher, owned by NorthStarPanel
// (ND-31). One width in every state (P1); the star and the heading never
// move, and the star sits on the heading's first line (P2); the height
// follows the content up to the cap, then the Flickable scrolls (P3).
// Nothing hovers (P4). Every text is PlainText; the heading and the
// description wrap and are never elided; the caption is one line.
KeyboardPanel {
  id: root

  required property var host

  // The kit's token groups are QtObjects that qmllint cannot see into.
  readonly property var fonts: Style.font
  readonly property var gaps: Style.spacing
  readonly property var m: host.model
  readonly property color fg: host.bar ? host.bar.foreground : Color.foreground
  readonly property color dim: Qt.darker(fg, 1.5)
  readonly property string family: host.bar ? host.bar.fontFamily : fonts.family
  readonly property alias flick: scroll

  function scrollTo(y) { scroll.contentY = y }
  function scrollState() { return { contentY: scroll.contentY, contentHeight: scroll.contentHeight, height: scroll.height, step: Style.space(NorthStarKeys.SCROLL_STEP) } }

  component Line: Text {
    width: parent.width
    visible: text !== ""
    textFormat: Text.PlainText
    wrapMode: Text.WrapAtWordBoundaryOrAnywhere
    color: root.dim
    font.family: root.family
    font.pixelSize: root.fonts.caption
  }

  objectName: "northStarBody"
  anchorItem: host.anchorItem
  owner: host
  bar: host.bar
  open: host.opened
  centerOnBar: true
  focusTarget: keyCatcher
  contentWidth: root.fittedContentWidth(Style.space(400))
  contentHeight: root.fittedContentHeight(column.implicitHeight, Style.space(520))

  PanelKeyCatcher {
    id: keyCatcher
    anchors.fill: parent

    onCloseRequested: root.host.key({ type: "esc" })
    onTabRequested: function(direction) { root.host.key({ type: "tab", direction: direction }) }
    onMoveRequested: function(dx, dy) { root.host.key({ type: "move", dx: dx, dy: dy }) }
    onActivateRequested: root.host.key({ type: "enter" })
    onDeleteRequested: root.host.key({ type: "delete" })
    onTextKey: function(t) { root.host.key({ type: "key", key: t }) }

    Flickable {
      id: scroll
      objectName: "northStarScroll"
      anchors.fill: parent
      contentWidth: width
      contentHeight: column.implicitHeight
      clip: true
      boundsBehavior: Flickable.StopAtBounds
      interactive: contentHeight > height
      flickableDirection: Flickable.VerticalFlick

      Column {
        id: column
        width: scroll.width
        spacing: root.gaps.md

        Item {
          width: parent.width
          height: heading.implicitHeight
          // The star in the heading's font and size, so its line box is the
          // heading's first line.
          Text {
            id: star
            objectName: "northStarGlyph"
            text: NorthStar.GLYPH
            textFormat: Text.PlainText
            color: root.m.set ? Color.accent : root.dim
            font.family: root.family
            font.pixelSize: root.fonts.title
          }
          Text {
            id: heading
            objectName: "northStarHeading"
            x: star.implicitWidth + root.gaps.lg
            width: parent.width - x
            text: root.m.heading
            textFormat: Text.PlainText
            wrapMode: Text.WrapAtWordBoundaryOrAnywhere
            color: root.fg
            font.family: root.family
            font.pixelSize: root.fonts.title
            font.bold: true
          }
        }
        Line { objectName: "northStarCaption"; text: root.m.caption; wrapMode: Text.NoWrap; elide: Text.ElideRight }
        PanelSeparator { foreground: root.fg }
        Line { objectName: "northStarDescription"; text: root.m.description; color: root.fg; font.pixelSize: root.fonts.body }
        Line { objectName: "northStarNoDescription"; text: root.m.noDescription; font.pixelSize: root.fonts.body }
        Line { objectName: "northStarMessage"; text: root.m.message; color: root.fg; font.pixelSize: root.fonts.body }
        Line { objectName: "northStarMessageCaption"; text: root.m.messageCaption }
        Line { objectName: "northStarEditHint"; text: root.m.editHint }
        Line { objectName: "northStarHistoryHint"; text: root.m.historyHint }
        Line { objectName: "northStarStale"; text: root.m.staleLine }
        Line { objectName: "northStarHelp"; text: root.host.help ? NorthStar.POPUP_HELP : "" }
      }
    }
  }
}
