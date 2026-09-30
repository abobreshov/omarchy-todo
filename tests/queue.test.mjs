// Queue.js: the cli ordering rules, rollback rebase and temporary ids (A34).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lib, item } from "./helpers.mjs";

const Store = lib("Store.js");
const Queue = lib("Queue.js");

test("rememberId and withRealId map an optimistic add's temporary id to the id todocli replied with (A34)", () => {
  const map = Queue.rememberId({}, "tabc", '{"id":42,"title":"x"}\n');
  assert.deepEqual(map, { tabc: "42" });
  assert.deepEqual(Queue.rememberId(map, "tdef", "not json"), map, "no id, no mapping");
  assert.deepEqual(Queue.rememberId(map, "tdef", "[]"), map);
  assert.deepEqual(Queue.rememberId(map, "tdef", '{"title":"x"}'), map);
  assert.deepEqual(Queue.rememberId(null, "t1", '{"id":"7"}'), { t1: "7" });
  assert.deepEqual(Queue.withRealId({ type: "setStatus", id: "tabc", status: "done" }, map), { type: "setStatus", id: "42", status: "done" });
  const untouched = { type: "remove", id: "7" };
  assert.equal(Queue.withRealId(untouched, map), untouched);
  assert.equal(Queue.withRealId({ type: "syncNow" }, map).type, "syncNow");
  assert.equal(Queue.withRealId(untouched, null), untouched);
});

test("readApplies: a read paints only when no write finished since it began and none is in flight or queued (A34)", () => {
  assert.equal(Queue.readApplies(3, 3, null, 0), true);
  assert.equal(Queue.readApplies(2, 3, null, 0), false, "a write finished while the read ran: it may hold the pre-write board");
  assert.equal(Queue.readApplies(3, 3, { action: {} }, 0), false, "a write in flight");
  assert.equal(Queue.readApplies(3, 3, null, 2), false, "writes queued");
});

test("rebase after a failed write keeps the later queued optimistic writes and rebases each of them", () => {
  const base = { items: [item(1, "One", "todo")], focus: { text: "", taskId: null } };
  // W1 (an add, fails) was applied first, then W2 (an add) and W3 (start #1)
  // on top of it; the queue still holds W2 and W3 with W1's optimistic
  // doc as their `before`.
  const w1 = Store.reduce(base, { type: "add", name: "Fails" });
  const w2 = Store.reduce(w1.doc, { type: "add", name: "Queued add" });
  const w3 = Store.reduce(w2.doc, { type: "setStatus", id: "1", status: "doing" });
  const queue = [
    { action: w2.action, tempId: w2.item.id, before: w1.doc, done: null },
    { action: w3.action, tempId: null, before: w2.doc, done: null },
  ];
  const r = Queue.rebase(base, queue);
  assert.deepEqual(r.doc.items.map((t) => [t.id, t.name, t.status]), [["1", "One", "doing"], [w2.item.id, "Queued add", "todo"]], "W1 gone, W2 under its own temporary id, W3 applied");
  assert.equal(r.entries.length, 2);
  assert.deepEqual(r.entries[0].before, base, "W2 is rebased onto the doc without W1");
  assert.deepEqual(r.entries[1].before.items.map((t) => t.name), ["One", "Queued add"], "W3 onto the doc with W2");
  assert.equal(r.entries[0].done, null, "the other fields ride along");
  assert.deepEqual(queue[0].before, w1.doc, "the input entries are untouched");
  // A later failure then reverts only its own change: W2 fails with W3 queued.
  const again = Queue.rebase(r.entries[0].before, [r.entries[1]]);
  assert.deepEqual(again.doc.items.map((t) => [t.id, t.status]), [["1", "doing"]], "W1 and W2 gone, W3 kept");
  // An action the rebased doc refuses (a step on the failed add) is skipped.
  const dependent = [{ action: { type: "setStatus", id: w1.item.id, status: "done" }, tempId: null, before: w1.doc, done: null }];
  assert.deepEqual(Queue.rebase(base, dependent).doc, { items: base.items, focus: base.focus });
  assert.deepEqual(Queue.rebase(base, null).doc, { items: base.items, focus: base.focus }, "nothing queued: the doc from before");
  assert.deepEqual(Queue.rebase(base, [null]).entries, [{ before: { items: base.items, focus: base.focus } }], "a hole in the queue is carried, not applied");
});
