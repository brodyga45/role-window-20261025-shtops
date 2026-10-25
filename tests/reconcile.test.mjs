import test from 'node:test';
import assert from 'node:assert/strict';
import {RoleWindow} from '../core/engine.mjs';
import {SqliteStore} from '../core/sqlite-store.mjs';
import {reconcileMembers} from '../bot/reconcile.mjs';

test('conservative reconnect grants fresh grace without fabricating verification or replaying unknown actions', () => {
  const store = new SqliteStore(':memory:'); let now = 0;
  try {
    const engine = new RoleWindow(store, {now: () => now});
    engine.observe('known', {hasRole: true}); engine.observe('unknown', {hasRole: true});
    engine.state.timers.unknown.status = 'unknown'; engine.save(); now = 600000;
    reconcileMembers(engine, [{id:'known',hasRole:true},{id:'unknown',hasRole:true},{id:'backlog',hasRole:true,joinedAt:0}], 'fresh_grace');
    assert.equal(engine.state.timers.known.dueAt, 1500000);
    assert.equal(engine.state.timers.unknown.status, 'unknown');
    assert.equal(engine.state.timers.backlog.startedAt, 600000);
    assert.equal(engine.state.audit.some(x => x.kind === 'verified_or_left'), false);
    assert.equal(engine.state.audit.some(x => x.kind === 'reconnect_new_grace'), true);
  } finally { store.close(); }
});

test('explicit preserve-known policy keeps an existing deadline but cancels absent and exempt members', () => {
  const store = new SqliteStore(':memory:'); let now = 0;
  try {
    const engine = new RoleWindow(store, {now: () => now});
    for (const id of ['keep','absent','exempt']) engine.observe(id, {hasRole:true});
    now = 600000;
    reconcileMembers(engine, [{id:'keep',hasRole:true},{id:'exempt',hasRole:true,excluded:true}], 'preserve_known');
    assert.equal(engine.state.timers.keep.dueAt, 900000);
    assert.equal(engine.state.timers.absent, undefined);
    assert.equal(engine.state.timers.exempt, undefined);
  } finally { store.close(); }
});
