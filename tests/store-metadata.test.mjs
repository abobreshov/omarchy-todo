import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { lib, here } from "./helpers.mjs";

const Store = lib("Store.js");
const Model = lib("Model.js");
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

test("setSize allows values only on short tasks and clearing a non-short task queues nothing", () => {
  const doc = Store.fromCli(board);
  for (const value of ["XS", "S", "M", "L", "XL", null]) {
    const r = Store.reduce(doc, { type: "setSize", id: 3, value });
    assert.equal(r.reply, "ok");
    assert.deepEqual(get(r.doc, "3"), { ...get(doc, "3"), size: value });
    assert.deepEqual(r.action, { type: "setSize", id: "3", value }, "same value still queues");
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
  for (const type of ["move", "setPriority", "setSize"]) {
    const r = Store.reduce(doc, { type, id: "missing" });
    assert.equal(r.ok, false);
    assert.equal(r.reply, "unknown id");
    assert.equal(Store.ipcReply({ type }, r.reply), "unknown id");
  }
});

test("add defaults to Inbox but only persists optional fields when given", () => {
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
  assert.deepEqual(junk.action, { type: "add", name: "Junk", description: "", stream: "inbox", horizon: "short" });
  const cleared = Store.reduce(doc, { type: "add", name: "Plain", stream: null, horizon: null });
  assert.deepEqual(cleared.action, plain.action);
});

test("UI-30 d: every existing copy reducer keeps all metadata before the next read", () => {
  const doc = Store.fromCli(board);
  Object.assign(get(doc, "3"), { labels: ["q4"], priority: 0, size: "M" });
  for (const action of [{ type: "setStatus", id: 3, status: "done" }, { type: "focus", id: 3 }, { type: "toggleStep", id: 3, n: 1 }]) {
    const r = Store.reduce(doc, action);
    assert.equal(r.ok, true);
    assert.deepEqual(metadata(get(r.doc, "3")), { stream: "work: tellkin", labels: ["q4"], horizon: "short", priority: 0, size: "M" });
    assert.notEqual(get(r.doc, "3").labels, get(doc, "3").labels);
  }
});
