import QtQuick
import "../../Keys.js" as Keys
import "../../Tabs.js" as Tabs
import "../../Streams.js" as Streams
import "../../Order.js" as Order

QtObject {
  id: panel
  property var ui: Keys.initialUi()
  property string backend: "cli"
  property bool metadata: true
  property bool stripShown: true
  property bool errored: false
  property bool ready: true
  property bool opened: false
  property string currentTab: "I"
  property string tabKey: currentTab
  property color contentForeground: "#ffffff"
  property color dimForeground: "#888888"
  property string contentFontFamily: "JetBrainsMono Nerd Font"
  property bool prioritySlot: true
  property bool badgeSlot: true
  property var focusLineModel: null
  property string focusCaption: ""
  property int firstRow: 0
  property var focusModel: null
  property var pomodoro: ({ phase: "idle", running: false, taskId: "" })
  property string countLabel: "50 open"
  property string emptyCopy: ""
  property string banner: ""
  property var errorModel: null
  property var catalogue: [{ uid: "I", key: "inbox", name: "inbox", group: null, system: true, archivedAt: null, open: 0 },
    { uid: "s1", key: "work: tellkin", name: "tellkin", group: "work", archivedAt: null, open: 0 },
    { uid: "s2", key: "work: leadtone", name: "leadtone", group: "work", archivedAt: null, open: 0 },
    { uid: "s3", key: "work: dataart", name: "dataart", group: "work", archivedAt: null, open: 0 },
    { uid: "s4", key: "personal: todo", name: "todo", group: "personal", archivedAt: null, open: 0 },
    { uid: "s5", key: "personal: goals", name: "goals", group: "personal", archivedAt: null, open: 0 }]
  property var tabs: Tabs.tabsOf(catalogue)
  property var items: []
  property var displayRows: []
  property var strip: null
  property double viewDayStart: Order.dayStartOf(Date.parse("2026-09-30T12:00:00+01:00"))
  property var wheelState: ({})
  signal cursorScroll(bool reset)
  function selectTab(uid) { currentTab = uid; cursorScroll(true) }
  function pickTarget(uid) { ui = Object.assign({}, ui, { moving: null }); selectTab(uid) }
  function dispatch(ev) {
    var ctx = { backend: backend, hasStreams: true, catalogue: catalogue, currentTab: currentTab, items: items, rows: displayRows }
    var r = Keys.reduceUi(ui, ev, ctx)
    ui = r.ui
    r.actions.forEach(function(a) { if (a.type === "selectTab") panel.selectTab(a.uid) })
  }
  function wheelTab(ev) {
    var r = Tabs.wheel(wheelState, ev)
    wheelState = r.state
    if (r.step !== 0) dispatch({ type: "stepTab", direction: r.step })
  }
  function fill(count) {
    var rows = [], tasks = []
    for (var i = 0; i < count; i++) {
      var it = { id: String(i+1), name: "Task " + (i+1), status: "todo", plan: [], horizon: "short", stream: "inbox", priority: null, size: null }
      tasks.push(it); rows.push({ kind: "item", item: it, badge: "", streamCaption: "" })
    }
    items = tasks; displayRows = rows
  }
  function hoverRow(i) { ui = Object.assign({}, ui, { cursor: i }) }
  function openDetail(id) {}
  function rowKey(id,k) {}
  function tickRow(id) {}
  function beginCompose() {}
}
