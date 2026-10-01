pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The cli-mode footer (UX §4.7) and the transient message slot (UX §4.7):
// one caption line at the bottom; a message replaces the footer text for
// 4 s; in json mode the line exists only while a message shows.
Item {
  id: footer

  required property var panel
  readonly property var model: panel.footerModel
  readonly property var picker: panel.ui.picker || null
  readonly property string message: panel.movePrompt !== undefined && panel.movePrompt !== "" ? panel.movePrompt : panel.message
  readonly property bool showingMessage: message !== ""
  readonly property bool urgent: !showingMessage && model !== null && model.urgent
  readonly property bool clickable: !picker && !showingMessage && model !== null && model.action !== null
  readonly property color dim: panel.dimForeground
  readonly property string family: panel.contentFontFamily

  height: Math.max(glyph.implicitHeight, label.implicitHeight, picker ? pickerLoader.implicitHeight : 0) + Style.spacing.sm

  Loader {
    id: pickerLoader
    objectName: "pickerLoader"
    anchors.left: parent.left
    anchors.verticalCenter: parent.verticalCenter
    active: footer.picker !== null
    sourceComponent: PickerRow {
      mode: footer.picker
      item: Model.findItem(footer.panel.items, mode.id)
      foreground: footer.panel.contentForeground
      fontFamily: footer.family
      onPicked: function(value) { footer.panel.dispatch({ type: "pickOption", value: value }) }
    }
  }

  MouseArea {
    id: area
    enabled: footer.picker === null
    anchors.fill: parent
    hoverEnabled: true
    cursorShape: footer.clickable ? Qt.PointingHandCursor : Qt.ArrowCursor
    onClicked: if (footer.clickable) footer.panel.syncNow()

    PanelToolTip {
      visible: !footer.picker && !footer.showingMessage && footer.model !== null && footer.model.tooltip !== "" && area.containsMouse
      text: footer.model ? footer.model.tooltip : ""
      fontFamily: footer.family
    }
  }

  Text {
    id: glyph
    anchors.left: parent.left
    anchors.leftMargin: Style.spacing.lg
    anchors.verticalCenter: parent.verticalCenter
    visible: !footer.picker && !footer.showingMessage && footer.model !== null
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
    visible: !footer.picker
    text: footer.showingMessage ? footer.message : (footer.model ? footer.model.text : "")
    textFormat: Text.PlainText
    elide: Text.ElideRight
    color: footer.urgent ? Color.urgent : (footer.showingMessage ? footer.panel.contentForeground : footer.dim)
    font.family: footer.family
    font.pixelSize: Style.font.caption
  }
}
