import { SHOP } from '../data/shop.js';
import { wallet, dollars } from '../data/wallet.js';

// The shop, from the menu: what you can buy with what you have taken
// (data/shop.js), by kind; what you own marked, what you cannot afford grey.

const KINDS = [['tools', 'Tools'], ['upgrades', 'Upgrades'], ['disguises', 'Disguises'], ['fun', 'Fun']];

export function openShop(onClick, onChange) {
  let s = document.getElementById('shop');
  if (!s) {
    s = document.createElement('div');
    s.id = 'shop';
    s.className = 'screen';
    s.style.zIndex = 30;
    document.body.append(s);
  }
  const render = () => {
    const card = (i) => {
      const own = wallet.owns(i.id), can = wallet.cash >= i.price;
      return `<div style="display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:10px;background:#141210e8;border:1px solid ${own ? '#7fce7f' : can ? '#c9a043' : '#5a5650'};opacity:${own || can ? 1 : 0.6};text-align:left">`
        + `<b style="font-size:15px">${i.name}</b><span style="font-size:12px;opacity:.75">${i.desc}</span>`
        + (own ? '<em style="color:#7fce7f;font-style:normal;font-size:13px">Yours</em>'
          : `<button data-buy="${i.id}" ${can ? '' : 'disabled'} style="align-self:flex-start;padding:6px 12px;border-radius:6px;border:0;background:${can ? '#c9a043' : '#3a3a3a'};color:#15130f;font-weight:700;cursor:${can ? 'pointer' : 'default'}">Buy · ${dollars(i.price)}</button>`)
        + '</div>';
    };
    s.innerHTML = `<div class="panel wide" style="width:min(940px,94vw);max-width:none;max-height:88vh;overflow:auto"><b>Shop · ${dollars(wallet.cash)}</b>`
      + `<p style="opacity:.7;margin:0">Money comes from jobs: your fee, and on a heist your cut. Most ever taken on one job: ${dollars(wallet.record)}.</p>`
      + KINDS.map(([k, title]) => `<h3 style="margin:14px 0 6px;font-size:13px;letter-spacing:.1em;text-transform:uppercase;opacity:.7">${title}</h3><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px">${SHOP.filter((i) => i.kind === k).map(card).join('')}</div>`).join('')
      + '<button class="go" data-close style="margin-top:14px">Done</button></div>';
    for (const b of s.querySelectorAll('[data-buy]')) b.onclick = () => { if (wallet.buy(SHOP.find((i) => i.id === b.dataset.buy))) { onClick?.(); onChange?.(); render(); } };
    s.querySelector('[data-close]').onclick = () => { onClick?.(); s.classList.remove('open'); onChange?.(); };
  };
  render();
  s.classList.add('open');
}
