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

  property var panel: null
  readonly property var item: panel ? panel.detailItem : null
  readonly property bool hasItem: item !== null
  readonly property color fg: panel ? panel.contentForeground : Color.foreground
  readonly property color dim: panel ? panel.dimForeground : Qt.darker(Color.foreground, 1.5)
  readonly property string family: panel ? panel.contentFontFamily : Style.font.family
  readonly property bool armed: hasItem && panel.ui.armedId === item.id
  readonly property var tips: Model.actionTooltips(item, {
    focus: panel ? panel.focusModel : null, pomodoro: panel ? panel.pomodoro : null, armed: armed
  })
  readonly property bool disabled: panel !== null && panel.cliError
  readonly property string statusText: hasItem ? Model.statusLine(item, { backend: panel.backend, focus: panel.focusModel, pomodoro: panel.pomodoro }) : ""

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
      onClicked: if (view.panel) view.panel.backToList()
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

  Text {
    width: parent.width
    text: view.statusText
    textFormat: Text.PlainText
    elide: Text.ElideRight
    color: view.dim
    font.family: view.family
    font.pixelSize: Style.font.caption
  }

  Text {
    width: parent.width
    text: view.hasItem && view.item.description !== "" ? view.item.description : "No description."
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    color: view.hasItem && view.item.description !== "" ? view.fg : view.dim
    font.family: view.family
    font.pixelSize: Style.font.body
  }

  PanelSeparator { foreground: view.fg }

  PanelSectionHeader {
    text: "Plan to close"
    foreground: view.fg
    fontFamily: view.family
  }

  Text {
    visible: !view.hasItem || view.item.plan.length === 0
    width: parent.width
    text: "No steps yet. Add them with todocli plan or in Obsidian."
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    color: view.dim
    font.family: view.family
    font.pixelSize: Style.font.body
  }

  Repeater {
    model: view.hasItem ? view.item.plan : []

    delegate: Item {
      id: stepRow
      required property var modelData
      required property int index
      readonly property bool current: view.panel !== null && view.panel.ui.stepCursor === index

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
        onClicked: if (view.panel && !view.disabled) view.panel.toggleStepAt(stepRow.index + 1)
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

  PanelSectionHeader {
    text: "Notes"
    foreground: view.fg
    fontFamily: view.family
  }

  Text {
    visible: !view.hasItem || view.item.notes.length === 0
    width: parent.width
    text: "No notes."
    textFormat: Text.PlainText
    color: view.dim
    font.family: view.family
    font.pixelSize: Style.font.body
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

      Text {
        id: noteTime
        anchors.right: parent.right
        anchors.rightMargin: Style.spacing.lg
        anchors.verticalCenter: parent.verticalCenter
        text: Model.noteTime(noteRow.modelData.at, view.panel ? view.panel.clockNow : Date.now(), false)
        color: view.dim
        font.family: view.family
        font.pixelSize: Style.font.caption
      }
    }
  }

  Row {
    anchors.horizontalCenter: parent.horizontalCenter
    spacing: Style.spacing.controlGap
    topPadding: Style.spacing.md

    PanelActionButton {
      iconText: Model.G.doing
      tooltipText: view.tips.doing
      size: Style.space(24)
      foreground: view.fg
      hoverColor: Color.accent
      fontFamily: view.family
      enabled: view.hasItem && view.tips.doingEnabled && !view.disabled
      onClicked: if (view.panel) view.panel.rowKey(view.item.id, "s")
    }

    PanelActionButton {
      iconText: Model.G.done
      tooltipText: view.tips.done
      size: Style.space(24)
      foreground: view.fg
      hoverColor: Color.accent
      fontFamily: view.family
      enabled: view.hasItem && !view.disabled
      onClicked: if (view.panel) view.panel.rowKey(view.item.id, "d")
    }

    PanelActionButton {
      iconText: Model.G.focus
      tooltipText: view.tips.focus
      size: Style.space(24)
      foreground: view.fg
      hoverColor: Color.accent
      fontFamily: view.family
      enabled: view.hasItem && view.tips.focusEnabled && !view.disabled
      onClicked: if (view.panel) view.panel.rowKey(view.item.id, "f")
    }

    PanelActionButton {
      iconText: Model.G.pomodoro
      tooltipText: view.tips.pomodoro
      size: Style.space(24)
      foreground: view.fg
      hoverColor: Color.accent
      fontFamily: view.family
      enabled: view.hasItem && view.tips.pomodoroEnabled && !view.disabled
      onClicked: if (view.panel) view.panel.rowKey(view.item.id, "p")
    }

    PanelActionButton {
      iconText: Model.G.del
      tooltipText: view.tips.del
      size: Style.space(24)
      foreground: view.armed ? Color.urgent : view.fg
      hoverColor: Color.urgent
      fontFamily: view.family
      enabled: view.hasItem && !view.disabled
      onClicked: if (view.panel) view.panel.armDelete(view.item.id)
    }
  }

  Text {
    visible: view.panel !== null && view.panel.ui.help
    width: parent.width
    text: Model.helpLine("detail", view.panel ? view.panel.backend : "json")
    textFormat: Text.PlainText
    wrapMode: Text.WordWrap
    color: view.dim
    font.family: view.family
    font.pixelSize: Style.font.caption
  }
}
