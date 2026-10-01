// CONTRACT-S9 §13: prove the installed panel reads every migrated task.
import fs from 'node:fs';
import path from 'node:path';
import { loadQmlJs } from '../tests/qml-js-loader.mjs';

try {
  const plugin = process.argv[2];
  if (!plugin) throw new Error('usage: node tools/reads-board.mjs <plugin dir>');
  const raw = fs.readFileSync(0, 'utf8');
  const board = JSON.parse(raw);
  if (!board || !Array.isArray(board.tasks)) throw new Error('the document has no tasks list');
  const Store = loadQmlJs(path.resolve(plugin, 'Store.js'));
  const result = Store.fromCli(raw);
  if (!result.ok || !Array.isArray(result.items)) throw new Error('Store.fromCli refused the document');
  const ids = new Set(result.items.map(item => String(item.id)));
  if (result.items.length !== board.tasks.length || !board.tasks.every(task => task && ids.has(String(task.id)))) {
    throw new Error('Store.fromCli did not return every task');
  }
  process.stdout.write(result.items.length + '\n');
} catch (error) {
  process.stderr.write('reads-board: ' + String(error.message).replace(/\s+/g, ' ') + '\n');
  process.exit(1);
}
