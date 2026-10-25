import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RoleWindow} from '../core/engine.mjs';
import {SqliteStore} from '../core/sqlite-store.mjs';

test('a fresh grace timer survives SQLite reopen; preview never moderates', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'role-window-'));
  let store = new SqliteStore(join(dir, 'state.sqlite')), now = 1000000, kicks = 0;
  try {
    let engine = new RoleWindow(store, {now: () => now});
    engine.observe('fictional-alex', {hasRole: true});
    const dueAt = engine.state.timers['fictional-alex'].dueAt;
    store.close(); store = new SqliteStore(join(dir, 'state.sqlite'));
    engine = new RoleWindow(store, {now: () => now});
    engine.observe('fictional-alex', {hasRole: true});
    assert.equal(engine.state.timers['fictional-alex'].dueAt, dueAt);
    now = dueAt;
    const adapter = {fetchMember: async () => ({hasRole: true, kickable: true}), kick: async () => kicks++};
    assert.equal((await engine.sweep(adapter))[0].outcome, 'would_kick');
    await engine.sweep(adapter);
    assert.equal(kicks, 0);
    assert.equal(engine.state.audit.filter(x => x.kind === 'would_kick').length, 1);
  } finally { store.close(); rmSync(dir, {recursive: true, force: true}); }
});

test('verification during the final recheck cancels; a new role grant receives a new grace', async () => {
  const store = new SqliteStore(':memory:'); let now = 0, kicks = 0;
  try {
    const engine = new RoleWindow(store, {dryRun: false, now: () => now});
    engine.observe('fictional-bri', {hasRole: true}); now = 900000;
    await engine.sweep({fetchMember: async () => ({hasRole: false}), kick: async () => kicks++});
    assert.equal(kicks, 0); assert.equal(engine.state.timers['fictional-bri'], undefined);
    engine.observe('fictional-bri', {hasRole: true});
    assert.equal(engine.state.timers['fictional-bri'].dueAt, 1800000);
  } finally { store.close(); }
});

test('a lost kick response is retained as unknown and is not automatically replayed', async () => {
  const store = new SqliteStore(':memory:'); let now = 0, kicks = 0;
  try {
    const engine = new RoleWindow(store, {dryRun: false, now: () => now});
    engine.observe('fictional-cosmo', {hasRole: true}); now = 900000;
    const adapter = {fetchMember: async () => ({hasRole: true, kickable: true}), kick: async () => { kicks++; throw new Error('simulated lost response'); }};
    assert.equal((await engine.sweep(adapter))[0].outcome, 'unknown');
    const reopened = new RoleWindow(store, {dryRun: false, now: () => now});
    await reopened.sweep(adapter);
    assert.equal(kicks, 1); assert.equal(reopened.state.timers['fictional-cosmo'].status, 'unknown');
  } finally { store.close(); }
});

test('a role generation changed during recheck cannot expire the replacement timer', async () => {
  const store = new SqliteStore(':memory:'); let now = 0, kicks = 0;
  try {
    const engine = new RoleWindow(store, {dryRun: false, now: () => now});
    engine.observe('fictional-dana', {hasRole: true}); now = 900000;
    await engine.sweep({fetchMember: async () => { engine.observe('fictional-dana', {hasRole: false}); engine.observe('fictional-dana', {hasRole: true}); return {hasRole: true, kickable: true}; }, kick: async () => kicks++});
    assert.equal(kicks, 0); assert.equal(engine.state.timers['fictional-dana'].dueAt, 1800000);
  } finally { store.close(); }
});

test('preview reports a hierarchy block, and reviewed unknown state can receive a fresh grace', async () => {
  const store = new SqliteStore(':memory:'); let now = 0, kicks = 0;
  try {
    const engine = new RoleWindow(store, {now: () => now});
    engine.observe('fictional-eli', {hasRole: true}); now = 900000;
    assert.equal((await engine.sweep({fetchMember: async () => ({hasRole: true, kickable: false}), kick: async () => kicks++}))[0].outcome, 'blocked');
    assert.equal(kicks, 0);
    assert.equal(engine.reviewOutcome('fictional-eli', {member: {hasRole: true}, startFreshGrace: false}), 'still_held');
    assert.equal(engine.reviewOutcome('fictional-eli', {member: {hasRole: true}, startFreshGrace: true}), 'new_grace');
    assert.equal(engine.state.timers['fictional-eli'].dueAt, 1800000);
    engine.state.timers['fictional-eli'].status = 'unknown'; engine.save();
    assert.equal(engine.reviewOutcome('fictional-eli', {member: null}), 'resolved');
    assert.equal(engine.state.timers['fictional-eli'], undefined);
    assert.equal(engine.state.audit.some(x => x.kind === 'kicked'), false);
  } finally { store.close(); }
});
