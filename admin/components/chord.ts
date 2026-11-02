// The g-chord ("g t" goes to Today) spans two keydowns. The command layer arms
// it on `g`; list shortcuts stay off while it is armed, so "g d" opens the
// Insights page and never marks a task done.
const CHORD_MS = 900;
let armedAt = 0;

export function armChord(at = Date.now()) {
  armedAt = at;
}

export function chordArmed(at = Date.now()): boolean {
  return armedAt > 0 && at - armedAt < CHORD_MS;
}

export function clearChord() {
  armedAt = 0;
}
