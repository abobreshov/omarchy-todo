// CONTRACT-S9 revision 6, §§12.1–12.3: canonical producer bytes and permanent
// consumer inputs; historical consumer bytes survive the canonical switch.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { lib, here } from "./helpers.mjs";

const Store = lib("Store.js");
const View = lib("View.js");
const Errors = lib("Errors.js");
const root = path.join(here, "fixtures");
const read = (dir, file) => fs.readFileSync(path.join(root, dir, file), "utf8");
const json = (dir, file) => JSON.parse(read(dir, file));
const seed = json("contract", "board-streams.json");
const expected = json("consumer", "expected.json");
// The SHA-pinned old-CLI input carries the pre-D18 sync block; consumer
// fixtures retain it by §12.3, while canonical producer boards have one target.
const consumerSeed = { ...seed, sync: json("consumer", "board-old-cli.json").sync };
const OLD_CLI_SHA256 = "a2afa400e35e8094027307a76f9e4e425f8cb0f9302be1405765e8db444061da";
const NOW = "2026-09-29T09:10:11.561Z";
const defaults = { stream: "inbox", labels: [], horizon: "short", priority: null, size: null };
const taskKeys = ["id", "uid", "title", "status", "notes", "plan", "createdAt", "updatedAt", "description", "due", "completedAt", "startedAt", "source", "author", ...Object.keys(defaults)];
const streamKeys = ["uid", "key", "group", "name", "position", "system", "createdAt", "archivedAt", "open"];
const inbox = { uid: "00000000-0000-7000-8000-000000000001", key: "inbox", group: null, name: "inbox", position: 0, system: true, createdAt: "2026-09-30T00:00:00.000Z", archivedAt: null };
const files = {
  contract: [
    "board-streams.json", "board.json", "envelope-auth.json",
    "envelope-auth_unreachable.json", "envelope-busy.json", "envelope-config.json",
    "envelope-db.json", "envelope-error.json", "envelope-list_gone.json",
    "envelope-not_found.json", "envelope-offline.json", "envelope-rate_limited.json",
    "envelope-refused.json", "envelope-removals_held.json", "envelope-sync_held.json",
    "envelope-usage.json", "pomodoro-cancel.json", "pomodoro-done.json",
    "pomodoro-interrupt.json", "pomodoro-retarget.json", "pomodoro-start.json",
    "show-task.json", "sync-all.json", "write-add.json",
    "write-done.json", "write-focus-clear.json", "write-focus-task.json",
    "write-horizon.json", "write-label.json", "write-move.json",
    "write-priority.json", "write-reopen.json", "write-rm.json",
    "write-size.json", "write-start.json", "write-step.json"
  ],
  consumer: ["board-old-cli.json", "board-archived-home.json", "board-ties.json", "board-empty-stream.json", "write-failed-refused.json", "expected.json"]
};
const task = (board, id) => board.tasks.find((t) => t.id === id);
const ids = (tasks) => tasks.map((t) => t.id);
const ascending = (values) => assert.deepEqual(values, [...values].sort((a, b) => a - b));
const permutation = (actual, matching) => assert.deepEqual([...actual].sort((a, b) => a - b), ids(matching).sort((a, b) => a - b));

function checkTask(t, keys = taskKeys) {
  assert.deepEqual(Object.keys(t), keys);
  assert.equal(typeof t.stream, "string");
  assert.ok(Array.isArray(t.labels));
  assert.ok(t.labels.every((label) => typeof label === "string"));
  assert.deepEqual(t.labels, [...new Set(t.labels)].sort());
  assert.ok(["short", "mid", "yearly", "long"].includes(t.horizon));
  assert.ok(t.priority === null || (Number.isInteger(t.priority) && t.priority >= 0 && t.priority <= 100));
  assert.ok(t.size === null || ["XS", "S", "M", "L", "XL"].includes(t.size));
  if (t.size !== null) assert.equal(t.horizon, "short");
}

function checkBoard(board, countOpen) {
  assert.deepEqual(Object.keys(board), ["version", "focus", "focus_task", "tasks", "streams", "sync", "stamp"]);
  assert.equal(board.version, 1);
  board.tasks.forEach((t) => checkTask(t));
  ascending(ids(board.tasks));
  const { open, ...first } = board.streams[0];
  assert.deepEqual(first, inbox);
  assert.ok(Number.isInteger(open) && open >= 0);
  for (const s of board.streams) {
    assert.deepEqual(Object.keys(s), streamKeys);
    assert.equal(typeof s.uid, "string");
    assert.equal(typeof s.key, "string");
    assert.equal(typeof s.name, "string");
    assert.equal(typeof s.createdAt, "string");
    assert.ok(s.archivedAt === null || typeof s.archivedAt === "string");
    assert.ok(Number.isInteger(s.position));
    assert.ok(Number.isInteger(s.open) && s.open >= 0);
    assert.equal(s.system, s.key === "inbox");
    if (s.key !== "inbox") {
      assert.equal(typeof s.group, "string");
      assert.equal(s.key, s.group + ": " + s.name);
      assert.ok(s.position >= 1);
    }
    if (countOpen) assert.equal(s.open, board.tasks.filter((t) => t.stream === s.key && ["todo", "doing"].includes(t.status)).length);
  }
  const sorted = [...board.streams].sort((a, b) =>
    Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
    Number(b.system) - Number(a.system) || a.position - b.position ||
    a.createdAt.localeCompare(b.createdAt) || a.uid.localeCompare(b.uid));
  assert.deepEqual(board.streams, sorted);
  const mapped = Store.fromCli(board);
  assert.equal(mapped.ok, true);
  assert.deepEqual(mapped.items.map((t) => t.id), ids(board.tasks).map(String));
}

test("§12.3 directory lists, JSON parsing and compact one-line bytes", () => {
  for (const [dir, names] of Object.entries(files)) {
    assert.deepEqual(fs.readdirSync(path.join(root, dir)).sort(), [...names].sort());
    for (const file of names) {
      const text = read(dir, file);
      const data = JSON.parse(text);
      if (file !== "expected.json") assert.equal(text, JSON.stringify(data) + "\n", dir + "/" + file);
    }
  }
  assert.deepEqual(Object.keys(expected).sort(), files.consumer.filter((f) => f !== "expected.json").sort());
});

test("§§1–3 board schemas, task id order, catalogue order and open counts", () => {
  for (const [dir, names] of Object.entries(files)) {
    for (const file of names.filter((f) => (f === "board.json" || f.startsWith("board-")) && f !== "board-old-cli.json")) {
      // Archived-home has precisely two task edits and unchanged seed counts:
      // its inconsistency is adversarial by design (contract §12.3).
      checkBoard(json(dir, file), file !== "board-archived-home.json");
    }
  }
});

test("§3.1 seed covers zero, tuned priorities, uppercase sizes and archived done", () => {
  assert.equal(task(seed, 2).priority, 0);
  assert.equal(task(seed, 4).priority, 90);
  assert.equal(task(seed, 3).size, "XL");
  assert.equal(task(seed, 7).size, "XS");
  assert.equal(task(seed, 8).status, "done");
  assert.equal(task(seed, 8).size, "M");
  assert.equal(task(seed, 8).priority, 100);
  assert.equal(typeof seed.streams[3].archivedAt, "string");
  assert.equal(seed.focus, "Ship S9");
  assert.equal(seed.focus_task, 3);
});

test("§4.1 show carries ordered typed events with zero as an integer", () => {
  const show = json("contract", "show-task.json");
  checkTask(show, [...taskKeys, "events"]);
  assert.deepEqual(show, { ...task(seed, 2), updatedAt: NOW, priority: 75, events: show.events });
  ascending(show.events.map((e) => e.id));
  for (const e of show.events) assert.deepEqual(Object.keys(e), ["id", "kind", "from", "to", "at", "via", "actor", "detail", "inferred"]);
  const priority = show.events.find((e) => e.kind === "priority_changed");
  assert.deepEqual(priority.detail, { old: 0, new: 75 });
  assert.ok(Number.isInteger(priority.detail.old));
  assert.ok(Number.isInteger(priority.detail.new));
  assert.deepEqual(show.events.find((e) => e.kind === "labels_changed").detail, { old: [], new: ["lease"] });
  assert.equal(show.events.find((e) => e.kind === "created").detail, null);
});

test("§12.2 write replies derive from their seed task with only the stated edits", () => {
  const writes = {
    move: [1, { stream: "work: tellkin" }], horizon: [3, { horizon: "mid", size: null }],
    label: [5, { labels: ["health", "running"] }], priority: [2, { priority: 75 }], size: [7, { size: "M" }]
  };
  for (const [verb, [id, fields]] of Object.entries(writes)) {
    const reply = json("contract", "write-" + verb + ".json");
    checkTask(reply);
    assert.equal(Object.hasOwn(reply, "events"), false);
    assert.equal(reply.updatedAt, NOW);
    assert.deepEqual(reply, { ...task(seed, id), ...fields, updatedAt: NOW });
  }
});

test("§3.1 migrated-only board appends defaults and inserts the sole Inbox", () => {
  const old = json("consumer", "board-old-cli.json");
  const migrated = {
    version: old.version, focus: old.focus, focus_task: old.focus_task,
    tasks: old.tasks.map((t) => ({ ...t, ...defaults })),
    streams: [{ ...inbox, open: 1 }], sync: seed.sync, stamp: old.stamp
  };
  assert.deepEqual(json("contract", "board.json"), migrated);
});

test("§12.3 older CLI bytes stay pinned independently of future producer goldens", () => {
  const text = read("consumer", "board-old-cli.json");
  assert.equal(createHash("sha256").update(text).digest("hex"), OLD_CLI_SHA256);
  const old = JSON.parse(text);
  assert.equal(Object.hasOwn(old, "streams"), false);
  for (const t of old.tasks) for (const key of Object.keys(defaults)) assert.equal(Object.hasOwn(t, key), false);
  const mapped = Store.fromCli(text);
  assert.equal(mapped.ok, true);
  assert.deepEqual(mapped.items.map((t) => t.id), ["3", "5"]);
  assert.equal(expected["board-old-cli.json"].hasStreams, false);
});

test("§12.3 archived-home differs only in the two specified stream keys", () => {
  const board = json("consumer", "board-archived-home.json");
  const pin = expected["board-archived-home.json"];
  assert.deepEqual(board, { ...consumerSeed, tasks: seed.tasks.map((t) => ({ ...t, stream: pin.streams[t.id] ?? t.stream })) });
  assert.deepEqual(pin.orphanIds, [4, 7]);
  assert.equal(task(board, 4).stream, "work: old");
  assert.equal(task(board, 7).stream, "work: zzz");
  permutation(pin.orphanIds, board.tasks.filter((t) => ["todo", "doing"].includes(t.status) && !board.streams.some((s) => s.key === t.stream && s.archivedAt === null)));
});

test("§12.3 ties pin future permutations and today's dump order", () => {
  const board = json("consumer", "board-ties.json");
  const pin = expected["board-ties.json"];
  const specs = [["todo", "short", 50], ["doing", "mid", 50], ["todo", "short", 0], ["doing", "short", null], ["todo", "yearly", null], ["todo", "long", 100]];
  for (const [index, spec] of specs.entries()) {
    const t = task(board, index + 1);
    assert.deepEqual([t.status, t.horizon, t.priority], spec);
    assert.equal(t.stream, "work: tellkin");
    assert.equal(t.startedAt, t.status === "doing" ? "2026-09-29T08:30:00.000Z" : null);
  }
  const open = board.tasks.filter((t) => ["doing", "todo"].includes(t.status));
  permutation(pin.overviewGroup, open);
  permutation(pin.dumpOpen, open);
  permutation(pin.tabFirstBlock, open.filter((t) => t.status === "doing" || t.horizon === "short"));
  assert.deepEqual(Object.keys(pin.tabSections), ["yearly", "long"]);
  for (const [horizon, list] of Object.entries(pin.tabSections)) permutation(list, open.filter((t) => t.status === "todo" && t.horizon === horizon));
  const mapped = Store.fromCli(board);
  assert.equal(mapped.ok, true);
  assert.deepEqual(View.sortForList(mapped.items).map((t) => t.id), pin.dumpOpen.map(String));
});

test("§12.3 empty stream keeps its tab catalogue and the archived entry", () => {
  const board = json("consumer", "board-empty-stream.json");
  const pin = expected["board-empty-stream.json"];
  assert.equal(board.tasks.some((t) => t.stream === "personal: goals"), false);
  assert.equal(board.streams.find((s) => s.key === "personal: goals").open, 0);
  assert.deepEqual(board.streams.find((s) => s.key === "work: old"), seed.streams.find((s) => s.key === "work: old"));
  assert.deepEqual(board, { ...consumerSeed, tasks: seed.tasks.filter((t) => ![5, 6].includes(t.id)), streams: seed.streams.map((s) => s.key === "personal: goals" ? { ...s, open: 0 } : s) });
  assert.equal(pin.omittedGroup, "personal: goals");
  assert.equal(pin.tab, "personal: goals");
  assert.equal(pin.emptyMessage, "Nothing in personal: goals yet. Press + to add a todo.");
});

test("§12.3 refused reply preserves bytes and today's error classification", () => {
  const text = read("consumer", "write-failed-refused.json");
  assert.equal(text, read("contract", "envelope-refused.json"));
  assert.deepEqual(Errors.parseEnvelope(text), { kind: "refused", message: "Task #5 is done; reopen it first" });
  assert.deepEqual(Errors.classifyExit(1, "Task #5 is done; reopen it first", false), { kind: "failed", message: "Task #5 is done; reopen it first" });
});
