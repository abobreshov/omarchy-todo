import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { here } from './helpers.mjs';

const root = path.resolve(here, '..');
const tool = path.join(root, 'tools/reads-board.mjs');
const fixture = name => fs.readFileSync(path.join(here, 'fixtures', name), 'utf8');
const run = (input, plugin = root) => spawnSync(process.execPath, [tool, plugin], { input, encoding: 'utf8' });
function refused(result) {
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^reads-board: [^\n]+\n$/);
}

for (const [name, count] of [['contract/board.json', 2], ['contract/board-streams.json', 8], ['consumer/board-old-cli.json', 2]]) {
  test('cutover reads ' + name + ' through the tree and returns every task', () => {
    const result = run(fixture(name));
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, count + '\n');
    assert.equal(result.stderr, '');
  });
}

for (const [name, input] of [['garbage', 'not JSON'], ['empty input', ''], ['no tasks', '{"version":1}'], ['null', 'null'], ['fromCli refusal', '{"version":2,"tasks":[]}']]) {
  test('cutover refuses ' + name + ' with one stderr line', () => refused(run(input)));
}

test('cutover refuses a board when normalization drops a task', () => {
  const board = JSON.parse(fixture('contract/board.json'));
  board.tasks.push({ ...board.tasks[0], id: 99, title: '' });
  refused(run(JSON.stringify(board)));
});

// A scratch plugin has only the released API (fromCli -> ok/items/id),
// and a sibling dependency. It exercises plugin-dir resolution without
// loading or running anything from the installed plugin.
function legacyPlugin(t, substituteId = false) {
  const plugin = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-reader-'));
  t.after(() => fs.rmSync(plugin, { recursive: true, force: true }));
  fs.writeFileSync(path.join(plugin, 'Store.js'), '.pragma library\n.import "Legacy.js" as Legacy\nfunction fromCli(raw) { return Legacy.read(raw) }\n');
  fs.writeFileSync(path.join(plugin, 'Legacy.js'), '.pragma library\nfunction read(raw) { return {ok:true, items:JSON.parse(raw).tasks.map(function(t) { return {id:String(' + (substituteId ? '999' : 't.id') + ')} }).reverse()} }\n');
  return plugin;
}

test('cutover loads a plugin and its sibling imports using only the 2.0.0 API', t => {
  const result = run(fixture('contract/board-streams.json'), legacyPlugin(t));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '8\n');
  assert.equal(result.stderr, '');
});

test('cutover checks every id even when the returned count agrees', t => {
  refused(run(fixture('contract/board.json'), legacyPlugin(t, true)));
});

test('cutover reports an unreadable plugin in one stderr line', () => {
  refused(run(fixture('contract/board.json'), path.join(root, 'tests', 'no-such-plugin')));
});

test('cutover requires a plugin directory', () => {
  refused(spawnSync(process.execPath, [tool], { input: fixture('contract/board.json'), encoding: 'utf8' }));
});
