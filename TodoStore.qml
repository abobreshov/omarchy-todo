import QtQuick

// The store interface (PLAN §6.4, Strategy): JsonStore and CliStore extend
// this and answer identically, so Panel.qml binds to `store` alone and never
// asks which backend it is. Replies follow UX §10.3 and §7 ("accepted, not
// committed"); `perform(action, done)` applies one Store.js action and calls
// `done(null | {kind, message})` later, only when the action was accepted
// (cli: after the write; json: one event-loop turn later).
QtObject {
  property var items: []
  property var focus: ({ text: "", taskId: null })
  property bool loaded: false
  property var error: null      // {kind, message} | null (UX §7 E4, E5, E7, E8)
  property bool stale: false    // the list shown is the last good one
  property var sync: []         // per-target status from todocli (UX §4.7)
  property bool syncing: false
  property bool hasSync: false  // whether a sync footer exists at all
  property string banner: ""    // E5 / E14 text above the list
  property bool active: false   // the selected backend; inactive, a store spawns and watches nothing
  property bool opened: false   // the panel is open

  signal documentLoaded(var doc)
  signal failed(var error)
  signal syncFinished(var result)

  function load() {}
  function refresh() { return "ok" }
  function perform(action, done) { return "unavailable" }
  function syncNow() { return "unavailable" }
}
