import test from 'node:test';
import assert from 'node:assert/strict';
import {
  daysSince,
  activeBlockId,
  daysUntilSwitch,
  nextSwitchDate,
  rotationStatus,
} from '../../src/core/rotation.js';

const BLOCKS = ['block-a', 'block-b'];
const START = '2026-09-07'; // a Monday

test('days between two dates, across a month boundary', () => {
  assert.equal(daysSince('2026-09-07', '2026-09-07'), 0);
  assert.equal(daysSince('2026-09-07', '2026-09-21'), 14);
  assert.equal(daysSince('2026-08-31', '2026-09-02'), 2);
  assert.equal(daysSince('2026-09-07', '2026-09-01'), -6);
});

test('the first fortnight runs block A', () => {
  for (const d of ['2026-09-07', '2026-09-13', '2026-09-20']) {
    assert.equal(activeBlockId(START, d, BLOCKS), 'block-a', d);
  }
});

test('the second fortnight switches to block B', () => {
  for (const d of ['2026-09-21', '2026-09-28', '2026-10-04']) {
    assert.equal(activeBlockId(START, d, BLOCKS), 'block-b', d);
  }
});

test('it alternates back and keeps alternating', () => {
  assert.equal(activeBlockId(START, '2026-10-05', BLOCKS), 'block-a');
  assert.equal(activeBlockId(START, '2026-10-19', BLOCKS), 'block-b');
  assert.equal(activeBlockId(START, '2027-03-01', BLOCKS), 'block-a');
});

test('the switch lands exactly on day 14, not 13 or 15', () => {
  assert.equal(activeBlockId(START, '2026-09-20', BLOCKS), 'block-a');
  assert.equal(activeBlockId(START, '2026-09-21', BLOCKS), 'block-b');
});

test('a date before the start sits in the first block', () => {
  assert.equal(activeBlockId(START, '2026-08-01', BLOCKS), 'block-a');
});

test('the countdown runs down to the switch day', () => {
  assert.equal(daysUntilSwitch(START, '2026-09-07'), 14);
  assert.equal(daysUntilSwitch(START, '2026-09-20'), 1);
  assert.equal(daysUntilSwitch(START, '2026-09-21'), 14, 'a fresh block starts a fresh countdown');
});

test('the switch date is reported, not just the count', () => {
  assert.equal(nextSwitchDate(START, '2026-09-07'), '2026-09-21');
  assert.equal(nextSwitchDate(START, '2026-09-20'), '2026-09-21');
});

test('a different cadence is honoured', () => {
  assert.equal(activeBlockId(START, '2026-09-14', BLOCKS, 1), 'block-b');
  assert.equal(daysUntilSwitch(START, '2026-09-07', 1), 7);
  assert.equal(activeBlockId(START, '2026-10-05', BLOCKS, 4), 'block-b');
});

test('more than two blocks cycle in order', () => {
  const three = ['a', 'b', 'c'];
  assert.equal(activeBlockId(START, '2026-09-07', three), 'a');
  assert.equal(activeBlockId(START, '2026-09-21', three), 'b');
  assert.equal(activeBlockId(START, '2026-10-05', three), 'c');
  assert.equal(activeBlockId(START, '2026-10-19', three), 'a');
});

test('no blocks is handled rather than crashing', () => {
  assert.equal(activeBlockId(START, '2026-09-07', []), null);
  assert.equal(activeBlockId(START, '2026-09-07', undefined), null);
});

test('status bundles what the screen needs', () => {
  const s = rotationStatus({ startIso: START, todayIso: '2026-09-18', blockIds: BLOCKS });
  assert.equal(s.enabled, true);
  assert.equal(s.blockId, 'block-a');
  assert.equal(s.daysLeft, 3);
  assert.equal(s.switchesOn, '2026-09-21');
});

test('status reports nothing when rotation is off', () => {
  const s = rotationStatus({ startIso: START, todayIso: '2026-09-18', blockIds: BLOCKS, enabled: false });
  assert.equal(s.enabled, false);
  assert.equal(s.blockId, null);
});
