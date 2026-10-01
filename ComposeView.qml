pragma ComponentBehavior: Bound
import "Streams.js" as Streams
import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The compose view (UX §4.3): back + title, the name and the description
// field, Cancel and Save. The fields own their text; the reducer (Keys.js)
// decides what Enter, Esc and Tab do, so every key hands the field's text
// to the panel as a `text` event first and then moves the focus to the
// field the reducer names. Tab never escapes to the neighbouring bar panel
// while typing.
Column {
  id: view

  required property var panel
  readonly property color fg: panel.contentForeground
  readonly property string family: panel.contentFontFamily
  // While a field is focused, keys belong to the field, not the key catcher.
  readonly property bool editing: nameField.activeFocus || descriptionField.activeFocus

  spacing: Style.spacing.md

  // The reducer's `composeOpened` action: `prefill` is the free-text focus
  // (Enter on F6) or "".
  function open(prefill) {
    nameField.text = prefill
    descriptionField.text = ""
    Qt.callLater(view.focusName)
  }

  function focusName() { nameField.forceActiveFocus() }

  function fieldKey(field, kind) {
    view.panel.dispatch({ type: "text", text: field.text })
    view.panel.dispatch({ type: kind })
    var ui = view.panel.ui
    if (ui.view !== "compose") {
      nameField.text = ""
      descriptionField.text = ""
      view.panel.focusKeyCatcher()
    } else if (ui.composeField === "description") descriptionField.forceActiveFocus()
    else nameField.forceActiveFocus()
  }

  function cancel() { fieldKey(nameField, "esc") }

  // The Save button and Enter in the description field: a name still on
  // the name field goes through the reducer's Enter first.
  function save() {
    view.panel.dispatch({ type: "text", text: nameField.text })
    if (view.panel.ui.composeField === "name") {
      view.panel.dispatch({ type: "enter" })
      if (view.panel.ui.composeField !== "description") { focusName(); return }
    }
    fieldKey(descriptionField, "enter")
  }

  Item {
    width: parent.width
    height: Math.max(composeTitle.implicitHeight, backFromCompose.implicitHeight)

    PanelActionButton {
      id: backFromCompose
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      iconText: Model.G.back
      tooltipText: "Back"
      foreground: view.fg
      fontFamily: view.family
      onClicked: view.cancel()
    }

    Text {
      id: composeTitle
      anchors.left: backFromCompose.right
      anchors.leftMargin: Style.spacing.md
      anchors.verticalCenter: parent.verticalCenter
      text: view.panel.metadata ? Streams.composeCaption(view.panel.tabKey, view.panel.ui.horizonFilter, view.panel.tabStripAvailable) : "New todo"
      anchors.right: parent.right
      elide: Text.ElideRight
      color: view.fg
      font.family: view.family
      font.pixelSize: Style.font.title
      font.bold: true
    }
  }

  TextField {
    id: nameField
    width: parent.width
    placeholderText: "Name"
    foreground: view.fg
    font.family: view.family

    Keys.onPressed: function(event) {
      if (event.key === Qt.Key_Escape) {
        view.cancel()
        event.accepted = true
      } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
        view.fieldKey(nameField, "enter")
        event.accepted = true
      } else if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
        view.panel.dispatch({ type: "tab", direction: 1 })
        descriptionField.forceActiveFocus()
        event.accepted = true
      }
    }
  }

  TextField {
    id: descriptionField
    width: parent.width
    placeholderText: "Description"
    foreground: view.fg
    font.family: view.family

    Keys.onPressed: function(event) {
      if (event.key === Qt.Key_Escape) {
        view.cancel()
        event.accepted = true
      } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
        view.save()
        event.accepted = true
      } else if (event.key === Qt.Key_Tab || event.key === Qt.Key_Backtab) {
        view.panel.dispatch({ type: "tab", direction: -1 })
        nameField.forceActiveFocus()
        event.accepted = true
      }
    }
  }

  Item {
    width: parent.width
    height: saveRow.implicitHeight

    Row {
      id: saveRow
      anchors.right: parent.right
      spacing: Style.spacing.md

      Button {
        text: "Cancel"
        foreground: view.fg
        fontFamily: view.family
        onClicked: view.cancel()
      }

      Button {
        text: "Save"
        bordered: true
        foreground: view.fg
        fontFamily: view.family
        onClicked: view.save()
      }
    }
  }
}
