import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The cli-mode error view (UX §7 E4, E7, E8): replaces the list body; `r`
// retries, Esc closes. The panel never falls back to the json file.
Column {
  id: view

  property var panel: null
  readonly property var model: panel ? panel.errorModel : null
  readonly property bool hasModel: model !== null && model.title !== null
  readonly property color fg: panel ? panel.contentForeground : Color.foreground
  readonly property color dim: panel ? panel.dimForeground : Qt.darker(Color.foreground, 1.5)
  readonly property string family: panel ? panel.contentFontFamily : Style.font.family

  spacing: Style.spacing.md

  Item {
    width: parent.width
    height: Math.max(errorTitle.implicitHeight, addButton.implicitHeight)

    Text {
      id: errorTitle
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      text: "Todos"
      color: view.fg
      font.family: view.family
      font.pixelSize: Style.font.title
      font.bold: true
    }

    PanelActionButton {
      id: addButton
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      iconText: Model.G.plus
      tooltipText: "New todo (n)"
      foreground: view.fg
      fontFamily: view.family
      enabled: false
    }
  }

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

  Text {
    width: parent.width
    text: view.hasModel ? view.model.body : ""
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    color: view.fg
    font.family: view.family
    font.pixelSize: Style.font.body
  }

  Text {
    visible: view.hasModel && view.model.hint !== ""
    width: parent.width
    text: view.hasModel ? view.model.hint : ""
    textFormat: Text.PlainText
    wrapMode: Text.WrapAnywhere
    color: view.fg
    font.family: view.family
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
      onClicked: if (view.panel) view.panel.refresh()
    }

    Text {
      id: retryHint
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: "r retry · Esc"
      color: view.dim
      font.family: view.family
      font.pixelSize: Style.font.caption
    }
  }
}
