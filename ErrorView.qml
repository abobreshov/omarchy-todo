pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The cli-mode error body (UX §7 E4, E7, E8) under the panel's list
// header: `r` retries, Esc closes. The panel never falls back to the json
// file.
Column {
  id: view

  required property var panel
  readonly property var model: panel.errorModel
  readonly property bool hasModel: model !== null && model.title !== null
  readonly property color fg: panel.contentForeground
  readonly property string family: panel.contentFontFamily

  component Body: Text {
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    color: view.fg
    font.family: view.family
    font.pixelSize: Style.font.body
  }

  spacing: Style.spacing.md

  Row {
    width: parent.width
    spacing: Style.spacing.controlGap

    Text {
      text: view.hasModel ? view.model.glyph : Model.G.alert
      color: Color.urgent
      font.family: view.family
      font.pixelSize: Style.font.subtitle
    }

    Text {
      text: view.hasModel ? view.model.title : ""
      textFormat: Text.PlainText
      color: view.fg
      font.family: view.family
      font.pixelSize: Style.font.subtitle
      font.bold: true
    }
  }

  Body { text: view.hasModel ? view.model.body : "" }

  Body {
    visible: view.hasModel && view.model.hint !== ""
    text: view.hasModel ? view.model.hint : ""
    wrapMode: Text.WrapAnywhere
    font.pixelSize: Style.font.bodySmall
  }

  Item {
    width: parent.width
    height: Math.max(retryButton.implicitHeight, retryHint.implicitHeight)

    Button {
      id: retryButton
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      iconText: Model.G.refresh
      text: "Retry"
      foreground: view.fg
      fontFamily: view.family
      onClicked: view.panel.refresh()
    }

    Text {
      id: retryHint
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: "r retry · Esc"
      color: view.panel.dimForeground
      font.family: view.family
      font.pixelSize: Style.font.caption
    }
  }
}
