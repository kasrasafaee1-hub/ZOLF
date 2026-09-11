// Automatic block rotation.
//
// The blocks train the same muscles with different exercises, and swapping
// them is meant to happen on a schedule rather than when someone remembers to
// change a setting. Which block is live is derived from the calendar, so both
// phones agree without syncing a flag, and looking at an old date tells you
// which block you were on then.

const DAY = 86400000;

const parse = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from `startIso` to `todayIso`; negative before the start. */
export function daysSince(startIso, todayIso) {
  return Math.floor((parse(todayIso) - parse(startIso)) / DAY);
}

/**
 * Which block is live today.
 * Blocks alternate every `weeks` weeks from `startIso`. Dates before the start
 * sit in the first block rather than counting backwards into nonsense.
 */
export function activeBlockId(startIso, todayIso, blockIds, weeks = 2) {
  if (!blockIds?.length) return null;
  const elapsed = daysSince(startIso, todayIso);
  if (!Number.isFinite(elapsed) || elapsed < 0) return blockIds[0];
  const period = Math.floor(elapsed / (weeks * 7));
  return blockIds[period % blockIds.length];
}

/** Days remaining on the current block, 0 meaning it switches today. */
export function daysUntilSwitch(startIso, todayIso, weeks = 2) {
  const span = weeks * 7;
  const elapsed = daysSince(startIso, todayIso);
  if (!Number.isFinite(elapsed)) return null;
  if (elapsed < 0) return -elapsed;
  return span - (elapsed % span);
}

/** The date the current block gives way to the next. */
export function nextSwitchDate(startIso, todayIso, weeks = 2) {
  const left = daysUntilSwitch(startIso, todayIso, weeks);
  if (left == null) return null;
  return new Date(parse(todayIso) + left * DAY).toISOString().slice(0, 10);
}

/** Everything the UI needs to explain the rotation in one line. */
export function rotationStatus({ startIso, todayIso, blockIds, weeks = 2, enabled = true }) {
  if (!enabled) return { enabled: false, blockId: null, daysLeft: null, switchesOn: null };
  return {
    enabled: true,
    blockId: activeBlockId(startIso, todayIso, blockIds, weeks),
    daysLeft: daysUntilSwitch(startIso, todayIso, weeks),
    switchesOn: nextSwitchDate(startIso, todayIso, weeks),
    weeks,
  };
}
