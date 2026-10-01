import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { lib, here, NOW } from "./helpers.mjs";

const Store = lib("Store.js");
const Queue = lib("Queue.js");
const Model = lib("Model.js");
const Argv = lib("Argv.js");
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(here, "fixtures", name), "utf8"));
const board = fixture("provisional/board-streams.json");
const metadata = (it) => Object.fromEntries(["stream", "labels", "horizon", "priority", "size"].map((k) => [k, it[k]]));
const get = (doc, id) => Model.findItem(doc.items, id);

test("fromCli maps §3.1's five fields and catalogue without changing producer order", () => {
  const doc = Store.fromCli(board);
  assert.equal(doc.ok, true);
  assert.equal(doc.hasStreams, true);
  assert.deepEqual(doc.items.map((it) => it.id), ["1", "2", "3", "4", "5", "6", "7", "8"]);
  doc.items.forEach((it, i) => assert.deepEqual(metadata(it), metadata(board.tasks[i])));
  assert.equal(get(doc, "2").priority, 0);
  assert.equal(get(doc, "3").size, "XL");
  assert.deepEqual(metadata(get(doc, "8")), { stream: "work: old", labels: [], horizon: "short", priority: 100, size: "M" });
  assert.deepEqual(doc.streams, board.streams);
  assert.notEqual(doc.streams, board.streams);
  assert.notEqual(doc.items[1].labels, board.tasks[1].labels);
});

test("AC-ST.21: older cli defaults; migrated Inbox-only catalogue enables capabilities", () => {
  const defaults = { stream: null, labels: [], horizon: "short", priority: null, size: null };
  const old = Store.fromCli(fixture("consumer/board-old-cli.json"));
  assert.equal(old.hasStreams, false);
  assert.deepEqual(old.streams, []);
  old.items.forEach((it) => assert.deepEqual(metadata(it), defaults));
  const migrated = Store.fromCli(fixture("provisional/board-migrated.json"));
  assert.equal(migrated.hasStreams, true);
  assert.equal(migrated.streams.length, 1);
  assert.equal(migrated.streams[0].key, "inbox");
  migrated.items.forEach((it) => assert.deepEqual(metadata(it), { ...defaults, stream: "inbox" }));
  for (const streams of [undefined, null, {}]) {
    const doc = Store.fromCli({ version: 1, tasks: [], streams });
    assert.equal(doc.hasStreams, false);
    assert.deepEqual(doc.streams, []);
  }
  assert.equal(Store.fromCli({ version: 1, tasks: [], streams: [] }).hasStreams, true);
});

test("AC-ST.41: malformed document priority and lowercase size are unset", () => {
  const input = structuredClone(board);
  ["0", 101, 7.5].forEach((priority, i) => { input.tasks[i].priority = priority; });
  input.tasks[2].size = "xl";
  const doc = Store.fromCli(input);
  doc.items.slice(0, 3).forEach((it) => assert.equal(it.priority, null));
  assert.equal(doc.items[2].size, null);
});

test("move changes only the key, resolves no catalogue and treats the current home as a no-op", () => {
  const doc = Store.fromCli(board);
  const r = Store.reduce(doc, { type: "move", id: 3, stream: " work:  leadtone " });
  assert.equal(r.reply, "ok");
  assert.deepEqual(get(r.doc, "3"), { ...get(doc, "3"), stream: "work: leadtone" });
  assert.notEqual(get(r.doc, "3").labels, get(doc, "3").labels);
  assert.deepEqual(r.action, { type: "move", id: "3", stream: "work: leadtone" });
  assert.equal(get(doc, "3").stream, "work: tellkin");
  assert.deepEqual(doc.streams, board.streams);
  const noop = Store.reduce(doc, { type: "move", id: 3, stream: "work: tellkin" });
  assert.equal(noop.reply, "ok");
  assert.equal(noop.action, null);
});

test("setPriority preserves zero, clears with null, guards action values and skips the stored value", () => {
  const doc = Store.fromCli(board);
  for (const value of [0, null, 37, 100]) {
    const r = Store.reduce(doc, { type: "setPriority", id: 3, value });
    assert.equal(r.reply, "ok");
    assert.deepEqual(get(r.doc, "3"), { ...get(doc, "3"), priority: value });
    assert.deepEqual(r.action, { type: "setPriority", id: "3", value });
  }
  for (const value of ["75", "0", 150, -1, 7.5, undefined, NaN, true]) {
    const r = Store.reduce(doc, { type: "setPriority", id: 3, value });
    assert.equal(r.ok, false);
    assert.equal(r.reply, "bad priority");
    assert.deepEqual(r.doc.items, doc.items);
  }
  for (const [id, value] of [[2, 0], [1, null], [3, 75]]) {
    const r = Store.reduce(doc, { type: "setPriority", id, value });
    assert.equal(r.reply, "ok");
    assert.equal(r.action, null);
    assert.equal(r.doc.items, doc.items);
  }
});

test("move refuses empty and flag-shaped keys without changing the document or queuing an action", () => {
  const doc = Store.fromCli(board);
  const before = structuredClone(doc);
  for (const stream of ["", " ", null, undefined, "-x", " -x "]) {
    const r = Store.reduce(doc, { type: "move", id: 3, stream });
    assert.equal(r.ok, false);
    assert.equal(r.reply, "unknown stream");
    assert.equal(r.action, null);
    assert.equal(r.doc.items, doc.items);
    assert.deepEqual(doc, before);
  }
});

test("setSize allows values only on short tasks and clearing a non-short task queues nothing", () => {
  const doc = Store.fromCli(board);
  for (const value of ["XS", "S", "M", "L", "XL", null]) {
    const r = Store.reduce(doc, { type: "setSize", id: 3, value });
    assert.equal(r.reply, "ok");
    assert.deepEqual(get(r.doc, "3"), { ...get(doc, "3"), size: value });
    if (value === get(doc, "3").size) {
      assert.equal(r.action, null, "same value queues nothing");
      assert.equal(r.doc.items, doc.items);
    } else assert.deepEqual(r.action, { type: "setSize", id: "3", value });
  }
  for (const value of ["m", "XXL", undefined, 1]) {
    assert.equal(Store.reduce(doc, { type: "setSize", id: 3, value }).reply, "bad size");
  }
  for (const id of [2, 5, 6]) {
    const refused = Store.reduce(doc, { type: "setSize", id, value: "M" });
    assert.equal(refused.ok, false);
    assert.equal(refused.reply, "size is for short-term tasks only");
    const cleared = Store.reduce(doc, { type: "setSize", id, value: null });
    assert.equal(cleared.reply, "ok");
    assert.equal(cleared.action, null);
    assert.equal(cleared.doc.items, doc.items);
  }
  const unset = Store.reduce(doc, { type: "setSize", id: 1, value: null });
  assert.equal(unset.reply, "ok");
  assert.equal(unset.action, null);
  assert.equal(unset.doc.items, doc.items);
  for (const type of ["move", "setPriority", "setSize"]) {
    const r = Store.reduce(doc, { type, id: "missing" });
    assert.equal(r.ok, false);
    assert.equal(r.reply, "unknown id");
    assert.equal(Store.ipcReply({ type }, r.reply), "unknown id");
  }
});

test("add defaults to Inbox and short but persists only non-default compose fields", () => {
  const doc = Store.fromCli(board);
  const add = Store.reduce(doc, { type: "add", name: " Book  review ", stream: " work:  leadtone ", horizon: "mid" });
  assert.deepEqual(metadata(add.item), { stream: "work: leadtone", labels: [], horizon: "mid", priority: null, size: null });
  assert.deepEqual(add.action, { type: "add", name: "Book review", description: "", stream: "work: leadtone", horizon: "mid" });
  const plain = Store.reduce(doc, { type: "add", name: "Plain" });
  assert.deepEqual(metadata(plain.item), { stream: "inbox", labels: [], horizon: "short", priority: null, size: null });
  assert.deepEqual(plain.action, { type: "add", name: "Plain", description: "" });
  const junk = Store.reduce(doc, { type: "add", name: "Junk", stream: " ", horizon: "unknown" });
  assert.equal(junk.item.stream, "inbox");
  assert.equal(junk.item.horizon, "short");
  assert.deepEqual(junk.action, { type: "add", name: "Junk", description: "" });
  const cleared = Store.reduce(doc, { type: "add", name: "Plain", stream: null, horizon: null });
  assert.deepEqual(cleared.action, plain.action);
});

test("§10 compose matrix reaches argv through action normalization, including default and unknown filters", () => {
  const doc = Store.fromCli(board);
  for (const stream of [undefined, null, " ", "inbox", " work:  tellkin "]) {
    for (const horizon of [undefined, null, "unknown", "all", "short", "mid", "yearly", "long"]) {
      const r = Store.reduce(doc, { type: "add", name: "N", description: "D", stream, horizon });
      const flags = [];
      if (stream === " work:  tellkin ") flags.push("--stream=work: tellkin");
      if (["mid", "yearly", "long"].includes(horizon)) flags.push(`--horizon=${horizon}`);
      assert.deepEqual(Argv.forAction("/fake/todocli", r.action),
        ["/fake/todocli", "--source", "omarchy", "--json", "add", ...flags, "--description=D", "--", "N"]);
      assert.equal(r.item.stream, stream === " work:  tellkin " ? "work: tellkin" : "inbox");
      assert.equal(r.item.horizon, ["mid", "yearly", "long"].includes(horizon) ? horizon : "short");
    }
  }
});

test("UI-30 d: every existing copy reducer keeps all metadata before the next read", () => {
  const doc = Store.fromCli(board);
  Object.assign(get(doc, "3"), { labels: ["q4"], priority: 0, size: "M" });
  for (const action of [{ type: "setStatus", id: 3, status: "done" }, { type: "focus", id: 3 }, { type: "toggleStep", id: 3, n: 1 }]) {
    const r = Store.reduce(doc, action, NOW);
    assert.equal(r.ok, true);
    assert.deepEqual(metadata(get(r.doc, "3")), { stream: "work: tellkin", labels: ["q4"], horizon: "short", priority: 0, size: "M" });
    assert.notEqual(get(r.doc, "3").labels, get(doc, "3").labels);
  }
});


test("AC-ST.61: completedAt maps, stamps, clears, survives queue rebase and rollback", () => {
  const now = Date.parse("2026-09-30T10:00:00.000Z");
  const doc = Store.fromCli(fixture("provisional/board-streams.json"));
  assert.equal(get(doc, "8").completedAt, "2026-09-29T08:45:00.000Z");
  const before = { items: doc.items, focus: doc.focus };
  const done = Store.reduce(before, { type: "setStatus", id: "3", status: "done" }, now);
  assert.equal(get(done.doc, "3").completedAt, new Date(now).toISOString());
  assert.equal(get(before, "3").completedAt, null);
  const same = Store.reduce(done.doc, { type: "setStatus", id: "3", status: "done" }, now + 1000);
  assert.equal(get(same.doc, "3").completedAt, get(done.doc, "3").completedAt);
  for (const status of ["todo", "doing"]) assert.equal(get(Store.reduce(done.doc, { type: "setStatus", id: "3", status }, now).doc, "3").completedAt, null);
  const rebased = Queue.rebase(before, [{ action: done.action, before }]);
  assert.equal(get(rebased.doc, "3").completedAt, get(done.doc, "3").completedAt);
  assert.equal(get(Queue.rebase(before, []).doc, "3").completedAt, null);
  const copied = Model.copyItem(get(done.doc, "3"));
  assert.equal(copied.completedAt, new Date(now).toISOString());
});

test("setStatus refuses a missing clock without changing any field", () => {
  const parsed = Store.fromCli(board);
  const doc = { items: parsed.items, focus: parsed.focus };
  for (const status of ["done", "todo", "doing"]) {
    for (const at of [undefined, null]) {
      const r = Store.reduce(doc, { type: "setStatus", id: "3", status, at });
      assert.equal(r.reply, "missing clock");
      assert.deepEqual(r.doc, doc);
      assert.equal(r.action, null);
    }
  }
});
