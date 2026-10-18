// The player's settings, kept in this browser (every access guarded, as in
// progress.js): for now, whether the crime meter and the list of laws broken
// are on screen (sim/wanted.js).

const KEY = 'nukeit.settings.v1';
const DEFAULTS = { crimeMeter: true, lawsList: true };

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch { return { ...DEFAULTS }; }
}

export const settings = read();

export function setSetting(key, value) {
  settings[key] = value;
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* nothing saved */ }
}
