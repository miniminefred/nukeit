import * as THREE from 'three';

// The time of day on the job: a working day of about twenty minutes, 08:00 to
// 20:00 at a hundred seconds an hour; the evening empties the building, night
// goes by quickly (twenty seconds an hour), dawn, and a new morning. The light
// follows it: the sun sinks and goes, the sky goes dark, the city's exposure
// comes down, and comes up again in the morning. A small clock under the job
// box says the time, and what is happening: the morning rush, lunch, going
// home, closing, night.

const RATE = (h) => (h >= 8 && h < 20 ? 100 : h >= 20 || h < 6 ? 20 : 60);   // real seconds per game hour
export const STARTS = { morning: 8, lunch: 11.75, evening: 17.25, night: 22 };

export class Clock {
  constructor({ scene, lights, renderer }) {
    this.scene = scene;
    this.lights = lights;
    this.renderer = renderer;
    this.day = scene.background;                 // the baked sky
    this.night = new THREE.Color(0x070a12);
    this.base = { sun: lights.sun.intensity, hemi: lights.hemi.intensity, exposure: renderer.toneMappingExposure, env: scene.environmentIntensity, fog: scene.fog.color.clone() };
    this.hour = 8;
    this.fog = this.base.fog.clone();
    this.on = false;
    this._dom();
  }

  start(hour) { this.hour = hour; this.on = true; this._apply(); this.el.style.display = ''; }
  stop() { this.on = false; this.hour = 12; this._apply(); this.el.style.display = 'none'; }

  update(dt) {
    if (!this.on) return;
    this.hour = (this.hour + dt / RATE(this.hour)) % 24;
    this._apply();
  }

  // 0 at night, 1 by day.
  get daylight() {
    const h = this.hour;
    if (h >= 7 && h < 18) return 1;
    if (h >= 18 && h < 20.5) return 1 - (h - 18) / 2.5;
    if (h >= 5 && h < 7) return (h - 5) / 2;
    return 0;
  }

  // Is it within the hours of [from, to)?
  within(from, to) { const h = this.hour; return from <= to ? h >= from && h < to : h >= from || h < to; }

  get rush() {
    if (this.within(7.5, 9.5)) return 'Morning rush';
    if (this.within(12, 13.5)) return 'Lunch rush';
    if (this.within(17, 18.5)) return 'Going home';
    if (this.within(18.5, 20)) return 'Closing';
    if (this.within(20, 6)) return 'Night';
    return '';
  }

  get text() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  _apply() {
    const d = this.on ? this.daylight : 1, { sun, hemi } = this.lights, B = this.base;
    sun.intensity = B.sun * d;
    hemi.intensity = B.hemi * (0.25 + 0.75 * d);
    this.renderer.toneMappingExposure = B.exposure * (0.5 + 0.5 * d);
    this.scene.environmentIntensity = B.env * (0.3 + 0.7 * d);
    this.scene.background = d > 0.3 ? this.day : this.night;
    this.fog = B.fog.clone().lerp(this.night, 1 - d);          // main.js's haze starts from this
    if (this.el && this.on) {
      const r = this.rush;
      this.el.textContent = `${this.text}${r ? ` · ${r}` : ''}`;
    }
  }

  _dom() {
    const box = document.getElementById('objective');
    const el = document.createElement('div');
    el.style.cssText = 'margin-top:8px;font:600 13px system-ui,sans-serif;color:#f2ece0;letter-spacing:.04em;display:none';
    box?.appendChild(el);
    this.el = el;
  }
}
