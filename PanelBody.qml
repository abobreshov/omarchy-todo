pragma ComponentBehavior: Bound
import QtQuick
import qs.Commons
import qs.Ui

// The keyboard surface and views; the composition root owns their state.
KeyboardPanel {
  id: root

  required property var host

  function focusKeys() { keyCatcher.forceActiveFocus() }
  function openCompose(prefill) { compose.open(prefill) }

  anchorItem: root.host.anchorItem
  owner: root.host.barIdentity
  bar: root.host.bar
  open: root.host.opened
  centerOnBar: true
  focusTarget: keyCatcher
  contentWidth: root.fittedContentWidth(Style.space(340))
  contentHeight: root.fittedContentHeight(root.host.ui.view === "list" ? pinnedList.desiredHeight + pinnedFooter.height + Style.spacing.lg : bodyColumn.implicitHeight, Style.space(520))

  PanelKeyCatcher {
    id: keyCatcher
    anchors.fill: parent
    // While an editor field is focused, keys belong to the field.
    blocked: compose.editing

    onCloseRequested: root.host.dispatch({ type: "esc" })
    onTabRequested: function(direction) { root.host.dispatch({ type: "tab", direction: direction }) }
    onMoveRequested: function(dx, dy) { root.host.dispatch({ type: "move", dx: dx, dy: dy }) }
    // Enter emits returnRequested + activateRequested, Space only the
    // latter; both open a row or toggle a step, so one handler serves.
    onActivateRequested: root.host.dispatch({ type: "enter" })
    onDeleteRequested: root.host.dispatch({ type: "delete" })
    onTextKey: function(t) { root.host.dispatch({ type: "key", key: t }) }

    TaskList {
      id: pinnedList
      visible: root.host.ui.view === "list"
      width: parent.width
      panel: root.host
      maxHeight: keyCatcher.height - pinnedFooter.height - Style.spacing.lg
    }
    StatusFooter {
      id: pinnedFooter
      visible: root.host.ui.view === "list" && (root.host.footerModel !== null || root.host.message !== "" || root.host.ui.moving !== null)
      width: parent.width
      height: visible ? implicitHeight : 0
      anchors.bottom: parent.bottom
      panel: root.host
      implicitHeight: Style.space(24)
    }
    Flickable {
      id: scroll
      visible: root.host.ui.view !== "list"
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

        // The list and the cli error body share one header (UX §4.2, §7).
        TaskList {
          visible: root.host.ui.view === "error"
          width: parent.width
          panel: root.host
        }

        ComposeView {
          id: compose
          visible: root.host.ui.view === "compose"
          width: parent.width
          panel: root.host
        }

        DetailView {
          visible: root.host.ui.view === "detail"
          width: parent.width
          panel: root.host
        }

        StatusFooter {
          visible: root.host.ui.view !== "compose" && ((root.host.footerModel !== null && root.host.ui.view !== "error") || root.host.message !== "")
          width: parent.width
          panel: root.host
        }
      }
    }
  }
}
