pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui
import "Model.js" as Model

// Read-only detail view (UX §4.4): back + title, the status line, the
// description, the plan (steps tick with Enter/Space/click), the notes and
// the icon-only action buttons whose tooltips carry the key.
Column {
  id: view

  required property var panel
  readonly property var item: panel.detailItem
  readonly property bool hasItem: item !== null
  readonly property bool usable: hasItem && !panel.errored
  readonly property color fg: panel.contentForeground
  readonly property color dim: panel.dimForeground
  readonly property string family: panel.contentFontFamily
  readonly property bool armed: hasItem && panel.ui.armedId === item.id
  readonly property var tips: Model.actionTooltips(item, { focus: panel.focusModel, pomodoro: panel.pomodoro, armed: armed })
  readonly property string statusText: hasItem ? Model.statusLine(item, { backend: panel.backend, focus: panel.focusModel, pomodoro: panel.pomodoro }) : ""

  component Body: Text {
    width: parent.width
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    color: view.fg
    font.family: view.family
    font.pixelSize: Style.font.body
  }

  component Caption: Text {
    textFormat: Text.PlainText
    elide: Text.ElideRight
    color: view.dim
    font.family: view.family
    font.pixelSize: Style.font.caption
  }

  component Heading: PanelSectionHeader {
    foreground: view.fg
    fontFamily: view.family
  }

  component ActionButton: PanelActionButton {
    size: Style.space(24)
    foreground: view.fg
    hoverColor: Color.accent
    fontFamily: view.family
    enabled: view.usable
  }

  spacing: Style.spacing.md

  Item {
    width: parent.width
    height: Math.max(detailTitle.implicitHeight, backFromDetail.implicitHeight)

    PanelActionButton {
      id: backFromDetail
      anchors.left: parent.left
      anchors.verticalCenter: parent.verticalCenter
      iconText: Model.G.back
      tooltipText: "Back"
      foreground: view.fg
      fontFamily: view.family
      onClicked: view.panel.backToList()
    }

    Text {
      id: detailTitle
      anchors.left: backFromDetail.right
      anchors.leftMargin: Style.spacing.md
      anchors.right: parent.right
      anchors.verticalCenter: parent.verticalCenter
      text: view.hasItem ? view.item.name : ""
      textFormat: Text.PlainText
      elide: Text.ElideRight
      color: view.fg
      font.family: view.family
      font.pixelSize: Style.font.title
      font.bold: true
    }
  }

  Caption { width: parent.width; text: view.statusText }

  Body {
    text: view.hasItem && view.item.description !== "" ? view.item.description : "No description."
    color: view.hasItem && view.item.description !== "" ? view.fg : view.dim
  }

  PanelSeparator { foreground: view.fg }
  Heading { text: "Plan to close" }

  Body {
    visible: !view.hasItem || view.item.plan.length === 0
    text: "No steps yet. Add them with todocli plan or in Obsidian."
    color: view.dim
  }

  Repeater {
    model: view.hasItem ? view.item.plan : []

    delegate: Item {
      id: stepRow
      required property var modelData
      required property int index
      readonly property bool current: view.panel.ui.stepCursor === index

      width: view.width
      height: Math.max(stepCheck.implicitHeight, stepText.implicitHeight) + Style.spacing.md

      Rectangle {
        anchors.fill: parent
        radius: Style.cornerRadius
        color: stepRow.current ? Style.hoverFillFor(view.fg, Color.accent) : "transparent"
      }

      MouseArea {
        anchors.fill: parent
        cursorShape: Qt.PointingHandCursor
        onClicked: if (view.usable) view.panel.toggleStepAt(stepRow.index + 1)
      }

      Text {
        id: stepCheck
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.lg
        anchors.verticalCenter: parent.verticalCenter
        text: stepRow.modelData.done ? Model.G.done : Model.G.todo
        color: stepRow.modelData.done ? view.dim : view.fg
        font.family: view.family
        font.pixelSize: Style.font.subtitle
      }

      Text {
        id: stepText
        anchors.left: stepCheck.right
        anchors.leftMargin: Style.spacing.controlGap
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.lg
        anchors.verticalCenter: parent.verticalCenter
        text: (stepRow.index + 1) + ". " + stepRow.modelData.text
        textFormat: Text.PlainText
        elide: Text.ElideRight
        font.strikeout: stepRow.modelData.done
        color: stepRow.modelData.done ? view.dim : view.fg
        font.family: view.family
        font.pixelSize: Style.font.body
      }
    }
  }

  PanelSeparator { foreground: view.fg }
  Heading { text: "Notes" }

  Body {
    visible: !view.hasItem || view.item.notes.length === 0
    text: "No notes."
    color: view.dim
  }

  Repeater {
    model: view.hasItem ? view.item.notes : []

    delegate: Item {
      id: noteRow
      required property var modelData

      width: view.width
      height: Math.max(noteText.implicitHeight, noteTime.implicitHeight) + Style.spacing.sm

      Text {
        id: noteText
        anchors.left: parent.left
        anchors.leftMargin: Style.spacing.lg
        anchors.right: noteTime.left
        anchors.rightMargin: Style.spacing.md
        anchors.verticalCenter: parent.verticalCenter
        text: "• " + noteRow.modelData.text
        textFormat: Text.PlainText
        elide: Text.ElideRight
        color: view.fg
        font.family: view.family
        font.pixelSize: Style.font.body
      }

      Caption {
        id: noteTime
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.lg
        anchors.verticalCenter: parent.verticalCenter
        text: Model.noteTime(noteRow.modelData.at, view.panel.clockNow, false)
      }
    }
  }

  Row {
    anchors.horizontalCenter: parent.horizontalCenter
    spacing: Style.spacing.controlGap
    topPadding: Style.spacing.md

    ActionButton {
      iconText: Model.G.doing
      tooltipText: view.tips.doing
      enabled: view.usable && view.tips.doingEnabled
      onClicked: view.panel.rowKey(view.item.id, "s")
    }

    ActionButton {
      iconText: Model.G.done
      tooltipText: view.tips.done
      onClicked: view.panel.rowKey(view.item.id, "d")
    }

    ActionButton {
      iconText: Model.G.focus
      tooltipText: view.tips.focus
      enabled: view.usable && view.tips.focusEnabled
      onClicked: view.panel.rowKey(view.item.id, "f")
    }

    ActionButton {
      iconText: Model.G.pomodoro
      tooltipText: view.tips.pomodoro
      enabled: view.usable && view.tips.pomodoroEnabled
      onClicked: view.panel.rowKey(view.item.id, "p")
    }

    ActionButton {
      iconText: Model.G.del
      tooltipText: view.tips.del
      foreground: view.armed ? Color.urgent : view.fg
      hoverColor: Color.urgent
      onClicked: view.panel.armDelete(view.item.id)
    }
  }

  Caption {
    visible: view.panel.ui.help
    width: parent.width
    text: Model.helpLine("detail", view.panel.backend)
    wrapMode: Text.WordWrap
    elide: Text.ElideNone
  }
}
