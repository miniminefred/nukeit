import { tool } from './catalog.js';

// Which jobs are done, kept in this browser. Storage can be missing or refuse
// (a private window, blocked site data), so every access is guarded and the
// game carries on with nothing saved.

const KEY = 'nukeit.progress.v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && Array.isArray(v.done) ? v : { done: [] };
  } catch { return { done: [] }; }
}

const state = read();

export const progress = {
  done: (jobId) => state.done.includes(jobId),
  finish(jobId) {
    if (!state.done.includes(jobId)) state.done.push(jobId);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* nothing saved */ }
  },
  unlocked(toolId) {
    const t = tool(toolId);
    return !!t && !t.soon && (!t.unlockedBy || state.done.includes(t.unlockedBy));
  },
};
