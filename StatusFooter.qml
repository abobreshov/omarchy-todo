import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The cli-mode footer (UX §4.7) and the transient message slot (UX §4.7):
// one caption line at the bottom; a message replaces the footer text for
// 4 s; in json mode the line exists only while a message shows.
Item {
  id: footer

  property var panel: null
  readonly property var model: panel ? panel.footerModel : null
  readonly property string message: panel ? panel.message : ""
  readonly property bool showingMessage: message !== ""
  readonly property bool urgent: !showingMessage && model !== null && model.urgent
  readonly property bool clickable: !showingMessage && model !== null && model.action !== null
  readonly property color fg: panel ? panel.contentForeground : Color.foreground
  readonly property color dim: panel ? panel.dimForeground : Qt.darker(Color.foreground, 1.5)
  readonly property string family: panel ? panel.contentFontFamily : Style.font.family

  height: Math.max(glyph.implicitHeight, label.implicitHeight) + Style.spacing.sm

  MouseArea {
    id: area
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: footer.clickable ? Qt.PointingHandCursor : Qt.ArrowCursor
    onClicked: if (footer.clickable && footer.panel) footer.panel.syncNow()

    PanelToolTip {
      visible: !footer.showingMessage && footer.model !== null && footer.model.tooltip !== "" && area.containsMouse
      text: footer.model ? footer.model.tooltip : ""
      fontFamily: footer.family
    }
  }

  Text {
    id: glyph
    anchors.left: parent.left
    anchors.leftMargin: Style.spacing.lg
    anchors.verticalCenter: parent.verticalCenter
    visible: !footer.showingMessage && footer.model !== null
    text: footer.model ? footer.model.glyph : ""
    color: footer.urgent ? Color.urgent : footer.dim
    font.family: footer.family
    font.pixelSize: Style.font.caption
  }

  Text {
    id: label
    anchors.left: glyph.visible ? glyph.right : parent.left
    anchors.leftMargin: glyph.visible ? Style.spacing.controlGap : Style.spacing.lg
    anchors.right: parent.right
    anchors.rightMargin: Style.spacing.lg
    anchors.verticalCenter: parent.verticalCenter
    text: footer.showingMessage ? footer.message : (footer.model ? footer.model.text : "")
    textFormat: Text.PlainText
    elide: Text.ElideRight
    color: footer.urgent ? Color.urgent : (footer.showingMessage ? footer.fg : footer.dim)
    font.family: footer.family
    font.pixelSize: Style.font.caption
  }
}
