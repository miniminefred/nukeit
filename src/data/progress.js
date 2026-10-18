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
  done: (jobId, levelId) => state.done.includes(levelId ? `${jobId}:${levelId}` : jobId),
  finish(jobId, levelId) {
    if (!state.done.includes(jobId)) state.done.push(jobId);
    if (levelId && !state.done.includes(`${jobId}:${levelId}`)) state.done.push(`${jobId}:${levelId}`);
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* nothing saved */ }
  },
  // Insane is earned by finishing the job on Normal or Hard.
  earned: (jobId) => state.done.includes(`${jobId}:normal`) || state.done.includes(`${jobId}:hard`),
  unlocked(toolId) {
    const t = tool(toolId);
    return !!t && !t.soon && (!t.unlockedBy || state.done.includes(t.unlockedBy));
  },
};
