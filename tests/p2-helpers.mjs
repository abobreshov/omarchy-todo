import fs from 'node:fs';
import path from 'node:path';
import { here, item, lib } from './helpers.mjs';
export const streams = [
  { uid: 'I', key: 'inbox', group: null, name: 'inbox', system: true, archivedAt: null, open: 1 },
  { uid: 's1', key: 'work: tellkin', group: 'work', name: 'tellkin', system: false, archivedAt: null, open: 2 },
  { uid: 's8', key: 'work: leadtone', group: 'work', name: 'leadtone', system: false, archivedAt: null, open: 0 },
  { uid: 's9', key: 'personal: goals', group: 'personal', name: 'goals', system: false, archivedAt: null, open: 0 },
  { uid: 'old', key: 'work: old', group: 'work', name: 'old', system: false, archivedAt: '2026-09-20', open: 0 }
];
export const task = (id, over = {}) => item(id, 'Task ' + id, 'todo', { stream: 'work: tellkin', ...over });
export const ids = rows => rows.filter(r => r.kind === 'item').map(r => Number(r.item.id));
export const fixture = name => JSON.parse(fs.readFileSync(path.join(here, 'fixtures/consumer', name), 'utf8'));
export const expected = fixture('expected.json');
export const from = name => lib('Store.js').fromCli(fixture(name));
