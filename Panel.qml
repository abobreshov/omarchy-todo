import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Ui
import "Model.js" as Model

// The checklist panel: a list of todos, an inline editor for new ones, and a
// read-only detail view. The panel is a nested bar-widget surface, so the
// BarWidget.qml entry point owns the IPC target and lifecycle forwarding
// while this file owns the data, the views, and the save file.
Panel {
  id: root

  moduleName: "tathagat11.checklist-todo"
  ipcTarget: "tathagat11.checklist-todo"
  manageIpc: false

  property var anchorItem: null
  property var hostWidget: null
  readonly property var barIdentity: hostWidget || root

  readonly property color contentForeground: bar ? bar.foreground : Color.foreground
  readonly property string contentFontFamily: bar ? bar.fontFamily : Style.font.family
  readonly property color dimForeground: Qt.darker(contentForeground, 1.5)

  // ---- state. `items` is replaced wholesale on every mutation so bindings
  //      in the views re-evaluate without a model class.
  property var items: []
  property string view: "list"
  property string selectedId: ""
  property bool loaded: false

  readonly property var selectedItem: {
    for (var i = 0; i < items.length; i++)
      if (items[i] && items[i].id === selectedId) return items[i]
    return null
  }
  readonly property var detailItem: selectedItem || ({})
  readonly property string countLabel: items.length + " item" + (items.length === 1 ? "" : "s")

  // Coming back to a shut panel always lands on the list, whatever tab was
  // left showing.
  onOpenedChanged: {
    if (!opened) {
      view = "list"
      selectedId = ""
    }
  }

  function focusNameField() {
    if (nameField) nameField.forceActiveFocus()
  }

  function focusKeyCatcher() {
    Qt.callLater(function() { if (keyCatcher) keyCatcher.forceActiveFocus() })
  }

  // ---- persistence. Same FileView + atomicWrites + guarded-before-write
  //      pattern the first-party notifications service uses.
  readonly property string stateDir: Quickshell.env("HOME") + "/.local/state/tathagat11.checklist-todo/"
  readonly property string savePath: stateDir + "todos.json"

  function applyLoaded(raw) {
    var next = Model.parse(raw)
    // Skip no-op updates so this instance's own write (and the directory
    // reload it provokes) does not churn the views on every save.
    if (loaded && Model.serialize(next) === Model.serialize(items)) return
    items = next
    loaded = true
  }

  function saveNow() {
    // Never write before reading: a save issued in the gap between
    // construction and the file landing would clobber the list we are
    // about to restore.
    if (!loaded) return
    saveFile.setText(Model.serialize(items))
  }

  function scheduleSave() { saveTimer.restart() }

  function reloadFromDisk() {
    saveFile.reload()
    // Start (or restart) the directory watch now the directory exists.
    stateDirWatch.reload()
  }

  Process {
    id: ensureDirProc
    command: ["mkdir", "-p", root.stateDir]
    onExited: Qt.callLater(root.reloadFromDisk)
  }

  FileView {
    id: saveFile
    path: root.savePath
    watchChanges: false
    atomicWrites: true
    printErrors: false
    onLoaded: root.applyLoaded(text())
    // First run: no file yet. FileView reports that as a load failure, and
    // without this branch `loaded` stays false forever and saving is a no-op.
    onLoadFailed: if (!root.loaded) root.applyLoaded("")
  }

  // Watch the directory rather than the file: the file does not exist on the
  // first run, and atomic writes replace its inode, so a file watch would go
  // quiet after the first write. The directory always exists and sees every
  // rewrite, which is what keeps both monitors' panels in step.
  FileView {
    id: stateDirWatch
    path: root.stateDir
    watchChanges: true
    printErrors: false
    onFileChanged: dirReloadTimer.restart()
  }

  Timer {
    id: dirReloadTimer
    interval: 150
    repeat: false
    onTriggered: if (root.loaded) saveFile.reload()
  }

  Timer {
    id: saveTimer
    interval: 300
    repeat: false
    onTriggered: root.saveNow()
  }

  Component.onCompleted: ensureDirProc.running = true

  // ---- operations
  function addItem(name, description) {
    var cleanName = Model.squish(name)
    if (cleanName === "") return "empty"
    var next = items.slice()
    next.push({ id: Model.makeId(), name: cleanName, description: Model.squish(description) })
    items = next
    scheduleSave()
    return cleanName
  }

  function deleteItem(id) {
    var next = []
    for (var i = 0; i < items.length; i++)
      if (items[i] && items[i].id !== id) next.push(items[i])
    items = next
    if (selectedId === id) selectedId = ""
    scheduleSave()
  }

  function openDetail(id) {
    selectedId = id
    view = "detail"
  }

  function beginCompose() {
    if (nameField) nameField.text = ""
    if (descriptionField) descriptionField.text = ""
    view = "compose"
    Qt.callLater(root.focusNameField)
  }

  function cancelCompose() {
    view = "list"
    focusKeyCatcher()
  }

  function saveCompose() {
    if (addItem(nameField.text, descriptionField.text) === "empty") {
      focusNameField()
      return
    }
    nameField.text = ""
    descriptionField.text = ""
    view = "list"
    focusKeyCatcher()
  }

  function backToList() {
    view = "list"
    focusKeyCatcher()
  }

  KeyboardPanel {
    id: panel
    anchorItem: root.anchorItem
    owner: root.barIdentity
    bar: root.bar
    open: root.opened
    centerOnBar: true
    focusTarget: keyCatcher
    contentWidth: panel.fittedContentWidth(Style.space(340))
    contentHeight: panel.fittedContentHeight(bodyColumn.implicitHeight, Style.space(520))

    PanelKeyCatcher {
      id: keyCatcher
      anchors.fill: parent
      // While an editor field is focused, keys belong to the field.
      blocked: nameField.activeFocus || descriptionField.activeFocus

      onCloseRequested: {
        if (root.view === "list") root.close()
        else if (root.view === "compose") root.cancelCompose()
        else root.backToList()
      }

      // `n` (or `+`) starts a new todo without reaching for the mouse.
      onTextKey: function(t) {
        if (root.view === "list" && (t === "n" || t === "N" || t === "+"))
          root.beginCompose()
      }

      Flickable {
        id: scroll
        anchors.fill: parent
        contentWidth: width
        contentHeight: bodyColumn.implicitHeight
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        interactive: contentHeight > height

        Column {
          id: bodyColumn
          width: scroll.width
          spacing: Style.spacing.lg

          // ============================================================ LIST
          Column {
            visible: root.view === "list"
            width: parent.width
            spacing: Style.spacing.md

            Item {
              width: parent.width
              height: Math.max(listTitle.implicitHeight, addButton.implicitHeight)

              Text {
                id: listTitle
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                text: "Todos"
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.title
                font.bold: true
              }

              Text {
                id: listCount
                anchors.right: addButton.left
                anchors.rightMargin: Style.spacing.lg
                anchors.verticalCenter: parent.verticalCenter
                text: root.countLabel
                color: root.dimForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.caption
              }

              PanelActionButton {
                id: addButton
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                iconText: "󰐕"
                tooltipText: "New todo"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                onClicked: root.beginCompose()
              }
            }

            Text {
              visible: root.items.length === 0
              width: parent.width
              text: "Nothing here yet. Press + to add a todo."
              textFormat: Text.PlainText
              wrapMode: Text.WordWrap
              topPadding: Style.spacing.md
              bottomPadding: Style.spacing.md
              color: root.dimForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
            }

            Repeater {
              model: root.items

              delegate: Item {
                id: rowItem
                required property var modelData

                width: bodyColumn.width
                height: Math.max(rowCheck.implicitHeight, rowTitle.implicitHeight) + Style.spacing.lg
                property bool checkHovered: false
                readonly property bool rowHovered: rowHover.containsMouse

                Rectangle {
                  anchors.fill: parent
                  radius: Style.cornerRadius
                  color: rowItem.rowHovered
                    ? Style.hoverFillFor(root.contentForeground, Color.accent)
                    : "transparent"
                }

                // Declared before the checkbox so the checkbox's own handler
                // sits on top and clicking the box deletes rather than opens.
                MouseArea {
                  id: rowHover
                  anchors.fill: parent
                  hoverEnabled: true
                  cursorShape: Qt.PointingHandCursor
                  onClicked: root.openDetail(rowItem.modelData.id)
                }

                Text {
                  id: rowCheck
                  anchors.left: parent.left
                  anchors.leftMargin: Style.spacing.lg
                  anchors.verticalCenter: parent.verticalCenter
                  text: "󰄱"
                  // Ticking is destructive here, so the box warns in the
                  // urgent colour only under its own pointer.
                  color: rowItem.checkHovered
                    ? Color.urgent
                    : (rowItem.rowHovered ? root.contentForeground : root.dimForeground)
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.subtitle

                  Behavior on color { ColorAnimation { duration: 80 } }

                  MouseArea {
                    anchors.fill: parent
                    anchors.margins: -Style.spacing.sm
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onContainsMouseChanged: rowItem.checkHovered = containsMouse
                    onClicked: root.deleteItem(rowItem.modelData.id)
                  }
                }

                Text {
                  id: rowTitle
                  anchors.left: rowCheck.right
                  anchors.leftMargin: Style.spacing.controlGap
                  anchors.right: parent.right
                  anchors.rightMargin: Style.spacing.lg
                  anchors.verticalCenter: parent.verticalCenter
                  text: modelData.name
                  textFormat: Text.PlainText
                  elide: Text.ElideRight
                  color: root.contentForeground
                  font.family: root.contentFontFamily
                  font.pixelSize: Style.font.body
                }
              }
            }
          }

          // ========================================================= COMPOSE
          Column {
            visible: root.view === "compose"
            width: parent.width
            spacing: Style.spacing.md

            Item {
              width: parent.width
              height: Math.max(composeTitle.implicitHeight, backFromCompose.implicitHeight)

              PanelActionButton {
                id: backFromCompose
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                iconText: "󰁍"
                tooltipText: "Back"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                onClicked: root.cancelCompose()
              }

              Text {
                id: composeTitle
                anchors.left: backFromCompose.right
                anchors.leftMargin: Style.spacing.md
                anchors.verticalCenter: parent.verticalCenter
                text: "New todo"
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.title
                font.bold: true
              }
            }

            TextField {
              id: nameField
              width: parent.width
              placeholderText: "Name"
              foreground: root.contentForeground
              font.family: root.contentFontFamily

              Keys.onPressed: function(event) {
                if (event.key === Qt.Key_Escape) {
                  root.cancelCompose()
                  event.accepted = true
                } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                  descriptionField.forceActiveFocus()
                  event.accepted = true
                }
              }
            }

            TextField {
              id: descriptionField
              width: parent.width
              placeholderText: "Description"
              foreground: root.contentForeground
              font.family: root.contentFontFamily

              Keys.onPressed: function(event) {
                if (event.key === Qt.Key_Escape) {
                  root.cancelCompose()
                  event.accepted = true
                } else if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
                  root.saveCompose()
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
                  foreground: root.contentForeground
                  fontFamily: root.contentFontFamily
                  onClicked: root.cancelCompose()
                }

                Button {
                  text: "Save"
                  bordered: true
                  foreground: root.contentForeground
                  fontFamily: root.contentFontFamily
                  onClicked: root.saveCompose()
                }
              }
            }
          }

          // ========================================================== DETAIL
          Column {
            visible: root.view === "detail"
            width: parent.width
            spacing: Style.spacing.md

            Item {
              width: parent.width
              height: Math.max(detailTitle.implicitHeight, backFromDetail.implicitHeight)

              PanelActionButton {
                id: backFromDetail
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                iconText: "󰁍"
                tooltipText: "Back"
                foreground: root.contentForeground
                fontFamily: root.contentFontFamily
                onClicked: root.backToList()
              }

              Text {
                id: detailTitle
                anchors.left: backFromDetail.right
                anchors.leftMargin: Style.spacing.md
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: root.detailItem.name || ""
                textFormat: Text.PlainText
                elide: Text.ElideRight
                color: root.contentForeground
                font.family: root.contentFontFamily
                font.pixelSize: Style.font.title
                font.bold: true
              }
            }

            Text {
              width: parent.width
              text: (root.detailItem.description && root.detailItem.description !== "")
                ? root.detailItem.description
                : "No description."
              textFormat: Text.PlainText
              wrapMode: Text.WordWrap
              color: (root.detailItem.description && root.detailItem.description !== "")
                ? root.contentForeground
                : root.dimForeground
              font.family: root.contentFontFamily
              font.pixelSize: Style.font.body
            }
          }
        }
      }
    }
  }
}
