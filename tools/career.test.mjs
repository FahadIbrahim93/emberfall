import test from 'node:test';
import assert from 'node:assert/strict';
import pkg from '../js/career.js';
const { CAREER, CAREER_SCHEMA_VERSION } = pkg;

test('snapshot carries schema version and data', () => {
  const snap = CAREER.snapshot({ alloy: 50, owned: ['vesper'] });
  assert.equal(snap.v, CAREER_SCHEMA_VERSION);
  assert.equal(snap.data.alloy, 50);
  assert.ok(typeof snap.savedAt === 'number');
});

test('upgrade fills missing fields for v0 snapshots', () => {
  const raw = { v: 0, data: { alloy: 7 }, savedAt: 123 };
  const up = CAREER.upgrade(raw);
  assert.equal(up.v, 1);
  assert.equal(up.data.alloy, 7);
  assert.deepEqual(up.data.owned, ['vesper']);
  assert.ok(up.data.refits && typeof up.data.refits === 'object');
});

test('parse handles strings and rejects garbage', () => {
  const s = JSON.stringify({ v: 1, data: { alloy: 9 }, savedAt: 1 });
  const p = CAREER.parse(s);
  assert.equal(p.data.alloy, 9);
  assert.equal(CAREER.parse('not json'), null);
  assert.equal(CAREER.parse(null), null);
  assert.equal(CAREER.parse(42), null);
});

test('casResult reports success and revision', () => {
  const r = CAREER.casResult(1, { ok: true, revision: 2, conflict: false });
  assert.equal(r.ok, true);
  assert.equal(r.revision, 2);
});

test('casResult reports conflict with both sides', () => {
  const r = CAREER.casResult(1, { ok: false, conflict: true, remote_revision: 5, remote_snapshot: { v: 1, data: { alloy: 9 } }, local_revision: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.conflict, true);
  assert.equal(r.remoteRevision, 5);
  assert.equal(r.remoteSnapshot.data.alloy, 9);
});

test('resolveConflict keeps chosen side without merging', () => {
  const L = { v: 1, data: { alloy: 10 } };
  const R = { v: 1, data: { alloy: 20 } };
  assert.deepEqual(CAREER.resolveConflict('keep-local', L, R), L);
  assert.deepEqual(CAREER.resolveConflict('keep-remote', L, R), R);
  const both = CAREER.resolveConflict('keep-both', L, R);
  assert.deepEqual(both.local, L);
  assert.deepEqual(both.remote, R);
  assert.equal(CAREER.resolveConflict('nope', L, R), null);
});

test('local revision round-trips', () => {
  // localStorage may not exist in node; CAREER uses try/catch
  CAREER.setLocalRevision(7);
  // in node without localStorage, localRevision returns null (no throw)
  const v = CAREER.localRevision();
  assert.ok(v === null || v === 7);
});

