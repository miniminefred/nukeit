// Your money, kept between jobs in this browser (every access guarded, as in
// progress.js): what you have, the most you ever took on one job, and what
// you have bought in the shop (data/shop.js), and which disguise you wear.

const KEY = 'nukeit.wallet.v1';

function read() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return { cash: +v?.cash || 0, record: +v?.record || 0, owned: Array.isArray(v?.owned) ? v.owned : [], wear: v?.wear ?? null };
  } catch { return { cash: 0, record: 0, owned: [], wear: null }; }
}

const state = read();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* nothing saved */ } };

export const wallet = {
  get cash() { return state.cash; },
  get record() { return state.record; },
  get wear() { return state.wear; },
  owns: (id) => state.owned.includes(id),
  earn(n) { state.cash += Math.max(0, Math.round(n)); save(); },
  // The most money taken on one job.
  took(n) { if (n > state.record) { state.record = n; save(); return true; } return false; },
  buy(item) {
    if (state.owned.includes(item.id) || state.cash < item.price) return false;
    state.cash -= item.price;
    state.owned.push(item.id);
    save();
    return true;
  },
  setWear(id) { state.wear = id && state.owned.includes(id) ? id : null; save(); },
};

// Money as people say it: $250k, $1.75M.
export const dollars = (n) => (n >= 1e6 ? `$${(n / 1e6).toFixed(n % 1e6 ? 2 : 0).replace(/\.?0+$/, '')}M` : n >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
