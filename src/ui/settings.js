import { settings, setSetting } from '../data/settings.js';

// The Settings panel, from the menu's Settings button or the pause screen:
// switches, each kept in this browser (data/settings.js).

const SWITCHES = [
  { key: 'crimeMeter', label: 'Crime meter', note: 'The thermometer of how wanted you are' },
  { key: 'lawsList', label: 'Laws broken', note: 'The list of laws you have broken, top right' },
];

export function openSettings(onClick) {
  let s = document.getElementById('settings');
  if (!s) {
    s = document.createElement('div');
    s.id = 'settings';
    s.className = 'screen';
    s.style.zIndex = 30;
    document.body.append(s);
  }
  const render = () => {
    s.innerHTML = `<div class="panel"><b>Settings</b>${SWITCHES.map((w) => `<button data-k="${w.key}" style="display:flex;justify-content:space-between;gap:24px;text-align:left"><span>${w.label}<br><span style="font-size:12px;opacity:.6;font-weight:400;letter-spacing:0;text-transform:none;color:inherit">${w.note}</span></span><b style="font-size:14px;color:${settings[w.key] ? '#7fce7f' : '#e0806a'}">${settings[w.key] ? 'On' : 'Off'}</b></button>`).join('')}<button class="go" data-close>Done</button></div>`;
    for (const b of s.querySelectorAll('[data-k]')) b.onclick = () => { setSetting(b.dataset.k, !settings[b.dataset.k]); onClick?.(); render(); };
    s.querySelector('[data-close]').onclick = () => { onClick?.(); s.classList.remove('open'); };
  };
  render();
  s.classList.add('open');
}
