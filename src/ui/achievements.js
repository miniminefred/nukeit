import { ACHIEVEMENTS, record } from '../data/achievements.js';
import { badge } from '../sim/achieve.js';

// The Achievements panel, from the menu: every badge, earned in its metal,
// the rest grey with how to get them (a secret one stays ???).

export function openAchievements(onClick) {
  let s = document.getElementById('achievements');
  if (!s) {
    s = document.createElement('div');
    s.id = 'achievements';
    s.className = 'screen';
    s.style.zIndex = 30;
    document.body.append(s);
  }
  const tiers = ['bronze', 'silver', 'gold'];
  s.innerHTML = `<div class="panel wide" style="width:min(900px,92vw);max-width:none;max-height:86vh;overflow:auto"><b>Achievements · ${record.count} of ${ACHIEVEMENTS.length}</b>`
    + '<p style="opacity:.7;margin:0">Deconstruction only. Bronze is easy, silver hard, gold really hard.</p>'
    + tiers.map((t) => `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:8px;margin:10px 0">${ACHIEVEMENTS.filter((a) => a.tier === t).map((a) => badge(a, record.has(a.id))).join('')}</div>`).join('')
    + '<button class="go" data-close>Done</button></div>';
  s.querySelector('[data-close]').onclick = () => { onClick?.(); s.classList.remove('open'); };
  s.classList.add('open');
}
