import QtQuick
import QtTest
import "../.." as Todo

// Real CliStore, stubbed Processes/FileViews: no subprocess, config or store I/O.
Item {
  Todo.CliStore {
    id: store
    property var readSnapshots: []
    onItemsChanged: {
      if (items.length > 0) readSnapshots.push({
        stream: items[0].stream, hasStreams: hasStreams,
        home: streams.length > 0 ? streams[0].key : null
      })
    }
  }

  TestCase {
    name: "MetadataPlumbing"

    function board(key, priority, horizon, size) {
      return JSON.stringify({
        version: 1, focus: "Ship", focus_task: null,
        tasks: [{ id: 3, title: "Wire", status: "todo", stream: key,
                  labels: ["q4"], horizon: horizon, priority: priority, size: size }],
        streams: [{ uid: "s", key: key, group: "work", name: "tellkin",
                    position: 1, system: false, createdAt: "at", archivedAt: null, open: 1 }]
      })
    }

    function init() {
      store.active = false
      store.items = []
      store.focus = { text: "", taskId: null }
      store.streams = []
      store.hasStreams = false
      store.queue = []
      store.pending = null
      store.error = null
      store.readGen = 0
      store.writeGen = 0
      store.idMap = {}
      store.readSnapshots = []
    }

    function test_read_applies_catalogue_with_items() {
      store.finishRead(0, false, board("work: tellkin", 0, "short", "M"), "")
      compare(store.hasStreams, true)
      compare(store.items[0].priority, 0)
      compare(store.items[0].size, "M")
      compare(store.streams[0].key, "work: tellkin")
      var items = store.items
      var streams = store.streams
      var fresh = board("work: renamed", 75, "short", "XL")
      store.pending = { action: {} }
      store.finishRead(0, false, fresh, "")
      compare(store.items, items)
      compare(store.streams, streams)
      store.pending = null
      store.queue = [{ action: {} }]
      store.finishRead(0, false, fresh, "")
      compare(store.items, items)
      compare(store.streams, streams)
      store.queue = []
      store.writeGen = 1
      store.finishRead(0, false, fresh, "")
      compare(store.items, items)
      compare(store.streams, streams)
      store.readGen = 1
      store.finishRead(0, false, fresh, "")
      compare(store.items[0].stream, "work: renamed")
      compare(store.streams[0].key, "work: renamed")
      store.finishRead(0, false, JSON.stringify({ version: 1, tasks: [{ id: 3, title: "Old" }] }), "")
      compare(store.hasStreams, false)
      compare(store.streams.length, 0)
      compare(store.items[0].priority, null)
      compare(store.readSnapshots, [
        { stream: "work: tellkin", hasStreams: true, home: "work: tellkin" },
        { stream: "work: renamed", hasStreams: true, home: "work: renamed" },
        { stream: null, hasStreams: false, home: null }
      ])
    }

    function test_noops_skip_document_and_queue() {
      store.finishRead(0, false, board("work: tellkin", 0, "mid", null), "")
      var items = store.items
      var focus = store.focus
      var queue = store.queue
      var callbacks = 0
      var done = function(error) { compare(error, null); callbacks++ }
      compare(store.perform({ type: "setPriority", id: "3", value: 0 }, done), "ok")
      compare(store.perform({ type: "setSize", id: "3", value: null }, done), "ok")
      compare(store.perform({ type: "move", id: "3", stream: "work: tellkin" }, done), "ok")
      compare(store.items, items)
      compare(store.focus, focus)
      compare(store.queue, queue)
      compare(store.queue.length, 0)
      compare(store.pending, null)
      compare(callbacks, 0)
      tryVerify(function() { return callbacks === 3 })
      compare(store.perform({ type: "setSize", id: "3", value: "M" }, done), "size is for short-term tasks only")
      wait(0)
      compare(callbacks, 3)
      compare(store.queue.length, 0)
    }

    function test_same_short_size_calls_done_without_a_write() {
      store.finishRead(0, false, board("work: tellkin", 0, "short", "M"), "")
      var items = store.items
      var callbacks = 0
      compare(store.perform({ type: "setSize", id: "3", value: "M" }, function(error) {
        compare(error, null)
        callbacks++
      }), "ok")
      compare(store.items, items)
      compare(store.queue.length, 0)
      compare(store.pending, null)
      tryVerify(function() { return callbacks === 1 })
      compare(store.perform({ type: "setSize", id: "3", value: "M" }), "ok")
    }

    function test_bad_move_keys_never_queue_or_call_done() {
      store.finishRead(0, false, board("work: tellkin", 0, "short", "M"), "")
      var items = store.items
      var callbacks = 0
      var keys = ["", " ", null, undefined, "-x"]
      for (var i = 0; i < keys.length; i++) {
        compare(store.perform({ type: "move", id: "3", stream: keys[i] }, function() {
          callbacks++
        }), "unknown stream")
      }
      wait(0)
      compare(callbacks, 0)
      compare(store.items, items)
      compare(store.queue.length, 0)
      compare(store.pending, null)
    }

    function test_failed_priority_rebases_status_without_changing_catalogue() {
      store.finishRead(0, false, board("work: tellkin", 0, "short", "M"), "")
      var base = { items: store.items, focus: store.focus }
      var streams = store.streams
      // Hold the FIFO to inspect its whole snapshots, then simulate W1's failure.
      store.pending = { action: {} }
      compare(store.perform({ type: "setPriority", id: "3", value: 75 }), "ok")
      compare(store.perform({ type: "setStatus", id: "3", status: "doing" }), "ok")
      compare(store.queue.length, 2)
      compare(store.queue[0].before.items[0].priority, 0)
      compare(store.queue[1].before.items[0].priority, 75)
      store.pending = store.queue.shift()
      store.finishWrite(1, false, "", "refused")
      compare(store.queue.length, 1)
      compare(store.items[0].priority, 0)
      compare(store.items[0].status, "doing")
      compare(store.items[0].stream, "work: tellkin")
      compare(store.items[0].labels[0], "q4")
      compare(store.items[0].horizon, "short")
      compare(store.items[0].size, "M")
      compare(store.streams, streams)
      compare(store.queue[0].before.items, base.items)
    }
  }
}
