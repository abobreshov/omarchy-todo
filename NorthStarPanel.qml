import QtQuick
import qs.Ui
import "NorthStar.js" as NorthStar
import "NorthStarKeys.js" as NorthStarKeys

// The North Star popup's composition root (ADDENDUM-S11 §5.3–§5.6): a kit
// Panel with IPC off that is its own popout owner (ND-31), so the bar's
// single-popout coordinator keeps it and the todo panel apart with no code
// of ours. Read-only: it reads the todo panel's TodoStore (no second read),
// keeps the scroll across a read whose text is the same (NorthStar.sameText),
// starts each open at the top with the help hidden, and executes what
// NorthStarKeys.popupKey decides.
Panel {
  id: root

  property var hostWidget: null // the BarWidget: Tab's owner and the flip's target
  property var anchorItem: null
  property var store: null
  property string backend: "json"
  property var clock: function() { return Date.now() }
  property double now: Date.now()
  property bool help: false
  property var lastText: null

  readonly property var northStarState: ({
    backend: root.backend, loaded: root.store ? root.store.loaded : false, hasNorthStar: root.store ? root.store.hasNorthStar : false,
    northStar: root.store ? root.store.northStar : null, error: root.store ? root.store.error : null
  })
  readonly property var model: NorthStar.popupModel(northStarState, now)
  readonly property var shownText: model.set ? northStarState.northStar : null

  objectName: "northStarPanel"
  manageIpc: false
  visible: false

  onShownTextChanged: {
    if (!NorthStar.sameText(lastText, shownText)) body.scrollTo(0)
    lastText = shownText
  }
  // The caption's clock is sampled at each open, as the todo panel's view day.
  onOpenedChanged: if (opened) { now = clock(); help = false; body.scrollTo(0) }

  function key(ev) {
    var d = NorthStarKeys.popupKey(ev, body.scrollState())
    if (!d) return
    switch (d.type) {
      case "close": root.close(); break
      case "flip": if (hostWidget) hostWidget.open(); break
      case "scroll": body.scrollTo(d.contentY); break
      case "reload": if (store) store.refresh(); break
      case "help": help = !help; break
      case "switchPanel": if (hostWidget && hostWidget.bar) hostWidget.bar.switchPanelFrom(hostWidget, d.direction); break
      default: break
    }
  }

  NorthStarBody {
    id: body
    host: root
  }
}
