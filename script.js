/* =========================================================
   VINTAGE ROMANCE — script.js
   1. Utilities & state      5. Cinema chrome & transitions
   2. Sound                  6. Scene manager
   3. Film shots & camera    7. Scenes 1–8
   4. Particles              8. Boot
   ========================================================= */
(() => {
  'use strict';

  /* ---------------- 1. UTILITIES & STATE ---------------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const isPortrait = () => innerHeight > innerWidth;
  const isSmall = () => innerWidth < 760;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HER_NAME = 'Yuliyana';

  const state = {
    scene: 0, token: 0, busy: false,
    name: 'Yuliyana', experience: null,
    dates: [], dateIndex: 0,
    hour: 7, minute: 0, pm: true,
    noStage: 0,
  };

  // Every cinematic timeline awaits wait(); switching scenes bumps the token and aborts it.
  class Abort extends Error {}
  const wait = (ms) => {
    const t = state.token;
    return new Promise((res, rej) => setTimeout(() => (t === state.token ? res() : rej(new Abort())), ms));
  };
  const run = (fn) => Promise.resolve().then(fn).catch((e) => { if (!(e instanceof Abort)) console.error(e); });

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const retrigger = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };

  /* ---------------- 2. SOUND (Web Audio, no files) ----------------
     A slow, never-quite-repeating romance for piano and violin, written
     note-by-note at runtime, plus a soft wind for the paper airplane.
     Nothing plays until the visitor presses "Begin the film" (autoplay rules). */
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const D_MAJOR = [1, 2, 4, 6, 7, 9, 11];                // pitch classes of D major
  const CHORDS = {                                     // bass, [voicing]
    D: [50, [62, 66, 69]], Bm: [47, [59, 62, 66]], G: [43, [59, 62, 67]], A: [45, [61, 64, 69]],
    Asus: [45, [62, 64, 69]], Fm: [42, [61, 66, 69]], Em: [40, [59, 64, 67]], DF: [42, [62, 66, 69]],
  };
  // Four eight-bar phrases: statement, the violin answers, the swell, the quiet return.
  const PROG = [
    'D', 'Bm', 'G', 'A', 'D', 'Fm', 'G', 'Asus',
    'Bm', 'G', 'D', 'A', 'Em', 'G', 'Asus', 'A',
    'G', 'A', 'Fm', 'Bm', 'Em', 'A', 'DF', 'G',
    'D', 'Bm', 'Em', 'A', 'G', 'Asus', 'D', 'D',
  ];
  const PHRASE_DYN = [0.72, 0.84, 1, 0.66];
  const RHYTHMS = [
    [[0, 2], [2, 1], [3, 1]], [[0, 1.5], [1.5, 0.5], [2, 2]], [[0, 3], [3, 1]],
    [[0, 1], [1, 1], [2, 2]], [[1, 1], [2, 1], [3, 1]], [[0, 2], [2, 2]],
  ];
  const MEL_LO = 71, MEL_HI = 86;
  const inKey = (m) => D_MAJOR.includes(((m % 12) + 12) % 12);
  const snapToKey = (m) => { for (let d = 0; d < 3; d++) { if (inKey(m + d)) return m + d; if (inKey(m - d)) return m - d; } return m; };

  const Sound = {
    ctx: null, master: null, music: null, sfx: null, on: false, timer: null,
    bar: 0, loop: 0, nextBar: 0, mel: 78, vln: 69, rand: Math.random, windStop: null, noise: null,
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC());
      this.master = c.createGain(); this.master.gain.value = 0;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.02; comp.release.value = 0.4;
      this.master.connect(comp); comp.connect(c.destination);
      // Hall reverb from a generated impulse
      const verb = c.createConvolver(); verb.buffer = this.impulse(3.4);
      const wet = c.createGain(); wet.gain.value = 0.42; verb.connect(wet); wet.connect(this.master);
      const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 5200;
      this.music = c.createGain(); this.music.gain.value = 1.2;
      this.music.connect(tone); tone.connect(this.master); tone.connect(verb);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
      const sfxSend = c.createGain(); sfxSend.gain.value = 0.25; this.sfx.connect(sfxSend); sfxSend.connect(verb);
      // 2 s of soft noise, reused for wind and paper
      const nb = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), nd = nb.getChannelData(0);
      let last = 0;
      for (let i = 0; i < nd.length; i++) { last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04; nd[i] = last * 3.2; }
      this.noise = nb;
    },
    impulse(sec) {
      const c = this.ctx, len = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = b.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8) * (i < 200 ? i / 200 : 1);
      }
      return b;
    },
    setOn(v) {
      this.init();
      if (!this.ctx) return;
      this.on = v;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(v ? 1 : 0, now, v ? 1.2 : 0.35);
      this.track(v);
      if (!v) this.stopWind();
      $('#sound-btn').setAttribute('aria-pressed', String(v));
    },
    // The score: a real recording of Elgar's "Salut d'Amour" for violin and piano.
    // It plays through a plain <audio> element (works from Live Server and file://),
    // with gentle volume fades. If it cannot load, the generated piano score takes over.
    audio: null, useSynth: false, fadeRaf: 0, vol: 0.62,
    track(v) {
      if (!this.audio && !this.useSynth) {
        const a = (this.audio = new Audio());
        a.src = 'assets/salut_damour.mp3'; a.loop = true; a.preload = 'auto'; a.volume = 0;
        a.addEventListener('error', () => { this.audio = null; this.useSynth = true; if (this.on) this.synth(true); });
      }
      if (this.useSynth) { this.synth(v); return; }
      const a = this.audio;
      if (v) { const p = a.play(); if (p && p.catch) p.catch(() => { /* waits for the next tap */ }); }
      this.fade(v ? this.vol : 0, v ? 3500 : 700, () => { if (!this.on) a.pause(); });
    },
    fade(to, ms, done) {
      const a = this.audio; if (!a) return;
      cancelAnimationFrame(this.fadeRaf);
      const from = a.volume, t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / ms);
        try { a.volume = clamp(from + (to - from) * (k * k * (3 - 2 * k)), 0, 1); } catch (e) { /* iOS: fixed volume */ }
        if (k < 1) this.fadeRaf = requestAnimationFrame(step); else if (done) done();
      };
      this.fadeRaf = requestAnimationFrame(step);
    },
    // Soften the music for a moment (e.g. under the wind of the airplane), then restore it
    duck(level, ms) {
      if (!this.on || !this.audio) return;
      this.fade(this.vol * level, 900, () => setTimeout(() => { if (this.on) this.fade(this.vol, 1800); }, ms));
    },
    synth(v) {
      const now = this.ctx.currentTime;
      if (v && !this.timer) {
        this.nextBar = now + 0.25;
        this.timer = setInterval(() => this.schedule(), 250);
        this.schedule();
      }
      if (!v && this.timer) { clearInterval(this.timer); this.timer = null; }
    },
    beat: 60 / 64,
    schedule() {
      const c = this.ctx;
      while (this.nextBar < c.currentTime + 1.2) {
        this.playBar(this.bar, this.nextBar);
        this.nextBar += this.beat * 4;
        this.bar++;
        if (this.bar % PROG.length === 0) this.loop++;
      }
    },
    piano(m, t, vel, len = 2.4) {
      const c = this.ctx, f = mtof(m);
      const decay = clamp(2.6 - (m - 48) * 0.035, 0.9, 2.6) * (len > 2 ? 1 : 0.8);
      const out = c.createGain();
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(vel, t + 0.006);
      out.gain.setTargetAtTime(vel * 0.45, t + 0.01, 0.18);
      out.gain.setTargetAtTime(0, t + 0.2, decay);
      out.connect(this.music);
      [[1, 1, 'sine'], [2, 0.32, 'sine'], [3, 0.1, 'sine'], [1.0015, 0.16, 'triangle']].forEach(([h, g, type]) => {
        const o = c.createOscillator(), og = c.createGain();
        o.type = type; o.frequency.value = f * h;
        og.gain.setValueAtTime(g, t);
        if (h > 1.5) og.gain.setTargetAtTime(g * 0.2, t + 0.02, 0.35);
        o.connect(og); og.connect(out);
        o.start(t); o.stop(t + 0.2 + decay * 5);
      });
    },
    violin(m, t, dur, vel) {
      const c = this.ctx, f = mtof(m);
      const out = c.createGain(), lp = c.createBiquadFilter(), hp = c.createBiquadFilter(), body = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2300; lp.Q.value = 0.6;
      hp.type = 'highpass'; hp.frequency.value = 220;
      body.type = 'peaking'; body.frequency.value = 1100; body.Q.value = 1.2; body.gain.value = 3;
      const atk = Math.min(1.1, dur * 0.35), rel = 1.4;
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(vel, t + atk);
      out.gain.setTargetAtTime(vel * 0.82, t + atk, dur * 0.5);
      out.gain.setTargetAtTime(0, t + dur, rel / 3);
      out.connect(this.music);
      const lfo = c.createOscillator(), lfoG = c.createGain();
      lfo.frequency.value = 5.2;
      lfoG.gain.setValueAtTime(0, t);
      lfoG.gain.linearRampToValueAtTime(f * 0.0045, t + atk + 0.3);
      lfo.connect(lfoG);
      [-5, 5].forEach((cents) => {
        const o = c.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = cents;
        lfoG.connect(o.frequency);
        o.connect(lp); o.start(t); o.stop(t + dur + rel * 2);
      });
      lp.connect(hp); hp.connect(body); body.connect(out);
      lfo.start(t); lfo.stop(t + dur + rel * 2);
    },
    playBar(n, t) {
      const i = n % PROG.length, phrase = Math.floor(i / 8), inPhrase = i % 8;
      const [bass, voicing] = CHORDS[PROG[i]], beat = this.beat;
      const dyn = PHRASE_DYN[phrase] * (this.loop === 0 && n < 4 ? 0.6 + n * 0.1 : 1);
      const r = this.rand;
      // Left hand: a slow broken chord; sparse at the start of each statement
      const arp = [bass, bass + 7, voicing[0], voicing[1], voicing[2], voicing[1], voicing[0], bass + 7];
      const sparse = phrase === 3 || (phrase === 0 && this.loop === 0);
      arp.forEach((m, k) => {
        if (sparse && k % 2) return;
        const vel = (k === 0 ? 0.075 : 0.042) * dyn * (0.9 + r() * 0.2);
        this.piano(m, t + k * beat * 0.5 + r() * 0.012, vel, k === 0 ? 3 : 1.6);
      });
      // Right hand: a melody that is improvised afresh on every pass
      const cadence = inPhrase === 7 || inPhrase === 3;
      const pool = phrase === 1 ? [RHYTHMS[2], RHYTHMS[5], [[0, 4]]] : RHYTHMS;
      const rhythm = cadence ? (r() < 0.5 ? [[0, 4]] : [[0, 3], [3, 1]]) : pool[Math.floor(r() * pool.length)];
      const tones = voicing.flatMap((v) => [v + 12, v + 24]).filter((m) => m >= MEL_LO && m <= MEL_HI);
      rhythm.forEach(([at, len]) => {
        let m;
        if (at === 0 || at === 2) {
          m = tones.reduce((best, x) => (Math.abs(x - this.mel) + r() * 3 < Math.abs(best - this.mel) ? x : best), tones[0]);
        } else {
          m = snapToKey(this.mel + [-2, -1, 1, 2][Math.floor(r() * 4)]);
        }
        m = clamp(m, MEL_LO, MEL_HI);
        this.mel = m;
        this.piano(m, t + at * beat + r() * 0.015, 0.07 * dyn * (at === 0 ? 1 : 0.85), len * beat);
      });
      // Violin: long bowed lines from the second phrase on, with smooth voice-leading
      const violinOn = phrase === 1 || phrase === 2 || (this.loop > 0 && phrase === 0 && inPhrase >= 4);
      if (violinOn) {
        const cands = voicing.flatMap((v) => [v, v + 12]).filter((m) => m >= 64 && m <= 81);
        const pick = () => cands.reduce((b, x) => (Math.abs(x - this.vln) + r() * 4 < Math.abs(b - this.vln) ? x : b), cands[0]);
        const split = !cadence && r() < 0.35;
        const v1 = pick(); this.vln = v1;
        this.violin(v1, t + 0.02, (split ? 2 : 4) * beat + 0.15, 0.05 * dyn);
        if (split) { const v2 = pick(); this.vln = v2; this.violin(v2, t + 2 * beat, 2 * beat + 0.15, 0.048 * dyn); }
      }
    },
    // A soft, in-key bell for small interactions
    chime(base = 880) {
      if (!this.on || !this.ctx) return;
      const m = snapToKey(Math.round(69 + 12 * Math.log2(base / 440)));
      const t = this.ctx.currentTime;
      [[0, 1, 0.034], [0.09, 1.5, 0.018]].forEach(([d, h, g]) => {
        const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
        o.type = 'sine'; o.frequency.value = mtof(m) * h;
        gn.gain.setValueAtTime(0, t + d); gn.gain.linearRampToValueAtTime(g, t + d + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + d + 1.6);
        o.connect(gn); gn.connect(this.sfx); o.start(t + d); o.stop(t + d + 1.7);
      });
    },
    thump() {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime;
      [[0, 0.42], [0.24, 0.26]].forEach(([d, g]) => {
        const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
        o.frequency.setValueAtTime(70, t + d); o.frequency.exponentialRampToValueAtTime(38, t + d + 0.16);
        gn.gain.setValueAtTime(0, t + d); gn.gain.linearRampToValueAtTime(g, t + d + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.22);
        o.connect(gn); gn.connect(this.sfx); o.start(t + d); o.stop(t + d + 0.3);
      });
    },
    noiseVoice(filterType, freq, q) {
      const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noise; src.loop = true;
      f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      src.connect(f); f.connect(g); g.connect(this.sfx);
      return { src, f, g };
    },
    // A quick crisp fold of paper
    paper() {
      if (!this.on || !this.ctx) return;
      const t = this.ctx.currentTime, { src, g } = this.noiseVoice('bandpass', 2600 + Math.random() * 900, 0.9);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      src.start(t, Math.random()); src.stop(t + 0.32);
    },
    // Soft gusting wind for the airplane's flight; returns nothing, stop with stopWind()
    wind(dur) {
      this.stopWind();
      if (!this.on || !this.ctx) return;
      const c = this.ctx, t = c.currentTime;
      const a = this.noiseVoice('bandpass', 600, 0.7), b = this.noiseVoice('lowpass', 420, 0.5);
      [a, b].forEach((v, k) => {
        v.g.gain.setValueAtTime(0, t);
        v.g.gain.linearRampToValueAtTime(k ? 0.11 : 0.08, t + 1.2);
        for (let s = 1.4; s < dur - 1; s += 0.6 + Math.random() * 0.6) {
          v.g.gain.linearRampToValueAtTime((k ? 0.08 : 0.05) + Math.random() * 0.08, t + s);
          v.f.frequency.linearRampToValueAtTime((k ? 300 : 450) + Math.random() * (k ? 250 : 700), t + s);
        }
        v.g.gain.linearRampToValueAtTime(0, t + dur);
        v.src.start(t, Math.random() * 1.5); v.src.stop(t + dur + 0.1);
      });
      this.windStop = () => {
        const n = c.currentTime;
        [a, b].forEach((v) => { v.g.gain.cancelScheduledValues(n); v.g.gain.setTargetAtTime(0, n, 0.25); try { v.src.stop(n + 1.2); } catch (e) { /* already stopped */ } });
      };
    },
    stopWind() { if (this.windStop) { this.windStop(); this.windStop = null; } },
  };

  /* ---------------- 3. FILM SHOTS & CAMERA ---------------- */
  // Every human-character shot is a hand-painted cel still; the "camera" is a
  // Web Animations push / pull / pan on the <img>, with per-orientation framing.
  // A realistic paper airplane folded from the letter itself (assets/s4_plane.webp)
  const planeSVG = `<img src="assets/s4_plane.webp" alt="" width="640" height="269" decoding="async" draggable="false">`;

  let shotZ = 1;
  // Bring a shot on top of the others with a crossfade (xf ms); short xf = a cut.
  function showShot(shot, xf = 1400) {
    const film = shot.parentElement;
    shot.style.transition = `opacity ${xf}ms cubic-bezier(.4,0,.2,1)`;
    shot.style.zIndex = String(++shotZ);
    void shot.offsetWidth;
    shot.classList.add('on');
    clearTimeout(film._t);
    film._t = setTimeout(() => {
      $$('.shot', film).forEach((s) => { if (s !== shot) { s.style.transition = 'none'; s.classList.remove('on'); } });
    }, xf + 60);
  }
  function resetFilm(film) {
    clearTimeout(film._t);
    $$('.shot', film).forEach((s) => {
      s.style.transition = 'none'; s.classList.remove('on');
      const img = $('img', s); img.getAnimations().forEach((a) => a.cancel()); img.style.objectPosition = '';
    });
  }
  // o: { s:[from,to] scale, o: transform-origin, pos:[from,to] object-position, t:[[x,y],[x,y]] translate %, p:{portrait overrides} }
  function cam(shot, o, dur) {
    const img = $('img', shot);
    const P = isPortrait() && o.p ? { ...o, ...o.p } : o;
    img.getAnimations().forEach((a) => a.cancel());
    const s = P.s || [1, 1.06], pos = P.pos || ['50% 30%', '50% 30%'], t = P.t || [[0, 0], [0, 0]];
    img.style.transformOrigin = P.o || '50% 50%';
    img.style.objectPosition = pos[1];
    return img.animate([
      { transform: `translate(${t[0][0]}%,${t[0][1]}%) scale(${s[0]})`, objectPosition: pos[0] },
      { transform: `translate(${t[1][0]}%,${t[1][1]}%) scale(${s[1]})`, objectPosition: pos[1] },
    ], { duration: reduceMotion ? 1 : dur, easing: P.e || 'cubic-bezier(.3,0,.45,1)', fill: 'forwards' });
  }
  function preloadImages() {
    $$('img[data-src]').forEach((img) => { img.src = img.dataset.src; img.removeAttribute('data-src'); });
    ['assets/s4_sky.webp', 'assets/paper_tex.webp', 'assets/s4_plane.webp'].forEach((src) => { const i = new Image(); i.src = src; });
  }

  /* Saved answers survive a refresh (localStorage), but the film never auto-skips. */
  const STORE_KEY = 'vintageRomance';
  function save(extra = {}) {
    try {
      const d = state.dates[state.dateIndex];
      const data = {
        name: state.name || null,
        dateChoice: state.experience || null,
        date: d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null,
        dateLabel: d ? fmtLong(d) : null,
        time: fmtTime(),
        savedAt: new Date().toISOString(),
        ...extra,
      };
      const prev = (window[STORE_KEY] || {});
      window[STORE_KEY] = { ...prev, ...data };
    } catch (e) { /* storage unavailable (private mode) — state still lives in memory */ }
  }

  /* ---------------- 4. PARTICLES ---------------- */
  function particles() {
    const small = isSmall();
    $$('.stars').forEach((el) => {
      const n = Math.round(+el.dataset.stars * (small ? 0.6 : 1)), r = rng(n * 7);
      el.innerHTML = Array.from({ length: n }, () => `<i class="star" style="left:${(r() * 100).toFixed(2)}%;top:${(r() * 100).toFixed(2)}%;animation-delay:${(r() * 3).toFixed(2)}s;opacity:${(0.3 + r() * 0.7).toFixed(2)};transform:scale(${(0.5 + r()).toFixed(2)})"></i>`).join('');
    });
    $$('.gold-dust').forEach((el) => {
      const n = Math.round(+el.dataset.dust * (small ? 0.6 : 1)), r = rng(n * 19);
      el.innerHTML = Array.from({ length: n }, () => `<i style="left:${(r() * 100).toFixed(1)}%;--drift:${((r() - 0.5) * 20).toFixed(0)}vw;animation-duration:${(10 + r() * 12).toFixed(1)}s;animation-delay:${(-r() * 20).toFixed(1)}s;opacity:${(0.4 + r() * 0.6).toFixed(2)}"></i>`).join('');
    });
  }

  // Sparse floating dust motes caught in the light, shared by every scene
  function atmosphere() {
    const el = $('#atmo-dust'), n = isSmall() ? 9 : 16, r = rng(4242);
    el.innerHTML = Array.from({ length: n }, () => {
      const size = (1.2 + r() * 2.6).toFixed(1);
      return `<i style="left:${(r() * 100).toFixed(1)}%;top:${(r() * 100).toFixed(1)}%;width:${size}px;height:${size}px;--dx:${((r() - 0.5) * 16).toFixed(1)}vw;--dy:${((r() - 0.6) * 18).toFixed(1)}vh;--o:${(0.25 + r() * 0.4).toFixed(2)};animation-duration:${(22 + r() * 22).toFixed(1)}s;animation-delay:${(-r() * 40).toFixed(1)}s"></i>`;
    }).join('');
  }

  /* ---------------- 5. CINEMA CHROME & TRANSITIONS ---------------- */
  const captionEl = $('#caption');
  let captionTimer = null;
  function caption(html) {
    clearTimeout(captionTimer);
    if (captionEl.classList.contains('show')) {
      captionEl.classList.remove('show');
      captionTimer = setTimeout(() => { captionEl.innerHTML = html; captionEl.classList.add('show'); }, 650);
    } else { captionEl.innerHTML = html; captionEl.classList.add('show'); }
  }
  function hideCaption() { clearTimeout(captionTimer); captionEl.classList.remove('show'); }
  const setSkip = (v) => $('#skip-btn').classList.toggle('show', v);

  const CHAPTERS = {
    1: ['Chapter I', 'A Moment in Time', 'Where it all began'],
    2: ['Chapter II', 'Words from the Heart', 'What he could not say aloud'],
    3: ['Chapter III', 'The Letter', 'Sealed in wax, written by hand'],
    4: ['Chapter IV', 'Her Name in the Sky', 'Carried away on the evening wind'],
    5: ['Chapter V', 'The Invitation', 'One small question'],
    6: ['Chapter VI', 'Our Date', 'Three ways to begin a story'],
    7: ['Chapter VII', 'The Day & the Hour', 'When shall we meet?'],
    8: ['Chapter VIII', 'Waiting for Her', 'Beneath the old street lamp'],
  };
  const CINEMATIC = { 1: true, 2: true, 4: true, 8: true };
  const SKIPPABLE = { 1: true, 2: true, 4: true };

  function buildProgress() {
    $('#progress').innerHTML = Object.keys(CHAPTERS).map((k) => `<li data-n="${k}" aria-label="${CHAPTERS[k][2]}"></li>`).join('');
  }
  function updateProgress(n) {
    $$('#progress li').forEach((li) => { const k = +li.dataset.n; li.classList.toggle('current', k === n); li.classList.toggle('done', k < n); });
  }

  /* ---------------- 6. SCENE MANAGER ---------------- */
  const SCENES = {};

  function enterScene(n) {
    const sc = $(`.scene[data-scene="${n}"]`);
    if (sc && !reduceMotion) retrigger(sc, 'enter');
  }
  async function goTo(n, { kind = 'card' } = {}) {
    if (state.busy) return;
    state.busy = true;
    state.token++;
    hideCaption(); setSkip(false); stopHeartbeat(); Sound.stopWind();
    if (kind === 'cut') {
      // An invisible cut between two identical frames (the letter on the table)
      $$('.scene').forEach((s) => { s.classList.remove('enter'); s.classList.toggle('is-active', +s.dataset.scene === n); });
      state.scene = n;
      document.body.dataset.scene = n;
      document.body.classList.toggle('cinema', !!CINEMATIC[n]);
      updateProgress(n);
      if (SCENES[n] && SCENES[n].setup) SCENES[n].setup({ cut: true });
      state.busy = false;
      setSkip(!!SKIPPABLE[n]);
      if (SCENES[n] && SCENES[n].play) run(() => SCENES[n].play({ cut: true }));
      return;
    }
    const veil = $('#veil'), card = $('#chapter-card');
    const flash = kind === 'flash';
    veil.style.transitionDuration = flash ? '.45s' : '';
    veil.classList.toggle('flash', flash);
    veil.classList.add('on');
    await sleep(flash ? 480 : 1000);

    $$('.scene').forEach((s) => s.classList.toggle('is-active', +s.dataset.scene === n));
    state.scene = n;
    document.body.dataset.scene = n;
    document.body.classList.toggle('cinema', !!CINEMATIC[n]);
    document.body.classList.add('started');
    updateProgress(n);
    if (SCENES[n] && SCENES[n].setup) SCENES[n].setup();

    if (!flash && CHAPTERS[n]) {
      $('#cc-num').textContent = CHAPTERS[n][0];
      $('#cc-title').textContent = CHAPTERS[n][1];
      $('#cc-sub').textContent = CHAPTERS[n][2];
      card.classList.add('show');
      await sleep(2300);
      card.classList.remove('show');
      await sleep(800);
    }
    enterScene(n);
    veil.classList.remove('on');
    await sleep(flash ? 450 : 600);
    veil.classList.remove('flash');
    veil.style.transitionDuration = '';
    state.busy = false;
    setSkip(!!SKIPPABLE[n]);
    if (SCENES[n] && SCENES[n].play) run(() => SCENES[n].play());
  }

  $('#skip-btn').addEventListener('click', () => {
    if (state.busy) return;
    const n = state.scene;
    if (n >= 1 && n < 8) goTo(n + 1);
  });
  function ensureName() { state.name = HER_NAME; }

  let heartTimer = null;
  function startHeartbeat() {
    $('#heart-pulse').classList.add('on');
    Sound.thump();
    clearInterval(heartTimer);
    heartTimer = setInterval(() => Sound.thump(), 950);
  }
  function stopHeartbeat() { clearInterval(heartTimer); heartTimer = null; $('#heart-pulse').classList.remove('on'); }

  /* Paper-airplane flight along a Catmull-Rom path */
  function pointAt(pts, t) {
    const n = pts.length - 1, f = clamp(t, 0, 1) * n, i = Math.min(Math.floor(f), n - 1), u = f - i;
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    const z = (q) => (q[2] == null ? 1 : q[2]);
    return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), cr(z(p0), z(p1), z(p2), z(p3))];
  }
  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const linear = (t) => t;
  function fly(el, pts, dur, { ease = easeInOut, onStep, puffs, puffEvery = 50 } = {}) {
    const tok = state.token;
    return new Promise((res, rej) => {
      const t0 = performance.now();
      let lastPuff = 0;
      function frame(now) {
        if (tok !== state.token) return rej(new Abort());
        const p = Math.min(1, (now - t0) / dur), e = ease(p);
        const [x, y, z] = pointAt(pts, e), [x2, y2] = pointAt(pts, Math.min(1, e + 0.004));
        const dx = x2 - x, dy = y2 - y;
        const ang = Math.atan2(dy || 0.0001, dx || 0.0001);
        el._z = z;
        el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${z.toFixed(3)}) rotate(${ang.toFixed(3)}rad)${dx < 0 ? ' scaleY(-1)' : ''}`;
        el.style.filter = `drop-shadow(0 ${(14 * z).toFixed(1)}px ${(12 * z).toFixed(1)}px rgba(40,10,20,.35)) brightness(${(0.9 + 0.12 * z).toFixed(3)})`;
        // Bank into turns and bob gently on the air
        const turn = el._ang == null ? 0 : Math.atan2(Math.sin(ang - el._ang), Math.cos(ang - el._ang));
        el._ang = ang;
        el._roll = (el._roll || 0) * 0.9 + clamp(turn * 18, -0.45, 0.45) * 0.1;
        const svg = el.firstElementChild;
        if (svg) svg.style.transform = `translate(-50%, -50%) rotate(-7deg) translateY(${(Math.sin(now / 260) * 2.2).toFixed(2)}px) scaleY(${(1 - Math.abs(el._roll)).toFixed(3)})`;
        if (onStep) onStep(x, y, e);
        if (puffs && now - lastPuff > puffEvery) {
          lastPuff = now;
          // the trail leaves from the tail, not the nose
          const back = 0.36 * el.offsetWidth * z;
          spawnPuff(puffs, x - Math.cos(ang) * back, y - Math.sin(ang) * back, false, z);
        }
        if (p < 1) requestAnimationFrame(frame); else res();
      }
      requestAnimationFrame(frame);
    });
  }
  function spawnPuff(container, x, y, big = false, z = 1) {
    if (container.childElementCount > 90) container.firstElementChild.remove();
    const d = document.createElement('i');
    d.className = 'puff';
    d.style.left = x + 'px'; d.style.top = y + 'px';
    const sz = (big ? 26 : 16) * clamp(z, 0.4, 1.6);
    d.style.width = d.style.height = sz + 'px'; d.style.margin = `${-sz / 2}px 0 0 ${-sz / 2}px`;
    d.addEventListener('animationend', () => d.remove());
    container.appendChild(d);
  }
  function fitSkyName(el, name) {
    if (el.dataset.built !== name) {
      el.innerHTML = Array.from(name).map((ch) => `<span class="ch" aria-hidden="true">${esc(ch)}</span>`).join('');
      el.dataset.built = name;
    }
    const len = Math.max(3, name.length);
    let size = Math.min((innerWidth * 0.84) / (len * 0.5), innerHeight * (isPortrait() ? 0.13 : 0.19));
    el.style.fontSize = size.toFixed(0) + 'px';
    const w = el.offsetWidth;
    if (w > innerWidth * 0.92) el.style.fontSize = (size * (innerWidth * 0.9) / w).toFixed(0) + 'px';
  }


  /* ---------------- 7. SCENES ---------------- */

  /* ===== SCENE 1 — A MOMENT IN TIME ===== */
  SCENES[1] = {
    setup() {
      const film = $('#s1-film');
      resetFilm(film);
      film.classList.remove('flare');
      $('.s1').classList.remove('lit');
    },
    async play() {
      const film = $('#s1-film'), s1 = $('.s1');
      const S = (id) => $('#' + id);
      // Black screen, then the first words
      await wait(1400);
      caption('Somewhere in old Europe — late afternoon, platform four.');
      await wait(2200);

      // 1. The station: a slow crane-down through the steam
      showShot(S('sh-station'), 2600);
      s1.classList.add('lit');
      cam(S('sh-station'), { s: [1.22, 1.04], o: '50% 30%', t: [[0, -3], [0, 0]], p: { s: [1.1, 1.02], pos: ['18% 50%', '62% 50%'] } }, 8200);
      Sound.chime(523);
      await wait(4600);
      hideCaption();
      await wait(2600);

      // 2. Him, waiting
      showShot(S('sh-man'), 1600);
      cam(S('sh-man'), { s: [1.02, 1.12], o: '24% 22%', p: { pos: ['8% 50%', '12% 50%'], s: [1, 1.1], o: '50% 30%' } }, 6400);
      caption('He was only waiting for a train.');
      await wait(5000);

      // 3. Her, stepping down
      showShot(S('sh-woman'), 1600);
      cam(S('sh-woman'), { s: [1.14, 1.02], o: '40% 30%', t: [[1.5, 0], [0, 0]], p: { pos: ['80% 50%', '76% 50%'], s: [1.1, 1] } }, 6400);
      caption('She was only stepping off one.');
      await wait(5000);

      // 4. The platform between them
      showShot(S('sh-meet'), 1800);
      cam(S('sh-meet'), { s: [1.04, 1.12], o: '50% 45%', t: [[-1.5, 0], [1.5, 0]], p: { pos: ['0% 50%', '100% 50%'], s: [1.02, 1.02] } }, 6600);
      caption('Then, across the crowded platform…');
      await wait(5200);
      hideCaption();

      // 5. Their eyes meet — quick cuts and a heartbeat
      startHeartbeat();
      showShot(S('sh-eyes-him'), 260);
      cam(S('sh-eyes-him'), { s: [1.04, 1.12], o: '50% 45%', p: { pos: ['36% 50%', '60% 50%'], s: [1, 1.06] } }, 2600);
      await wait(2300);
      showShot(S('sh-eyes-her'), 260);
      cam(S('sh-eyes-her'), { s: [1.04, 1.12], o: '62% 45%', p: { pos: ['72% 50%', '50% 50%'], s: [1, 1.06] } }, 2600);
      await wait(2300);
      showShot(S('sh-eyes-him'), 200);
      cam(S('sh-eyes-him'), { s: [1.14, 1.2], o: '50% 45%', p: { pos: ['50% 50%', '50% 50%'], s: [1.06, 1.1] } }, 1400);
      await wait(1100);

      // 6. Pull back: the two of them, the light blooming
      showShot(S('sh-meet'), 900);
      film.classList.add('flare');
      cam(S('sh-meet'), { s: [1.2, 1], o: '50% 40%', p: { pos: ['100% 50%', '0% 50%'], s: [1.06, 1] } }, 8000);
      caption('Their eyes met — and for one moment, time forgot to move.');
      await wait(4800);
      stopHeartbeat();
      await wait(2400);
      hideCaption();
      await wait(800);
      goTo(2);
    },
  };

  /* ===== SCENE 2 — WORDS FROM THE HEART ===== */
  SCENES[2] = {
    built: false,
    setup() {
      const film = $('#s2-film');
      resetFilm(film);
      if (!this.built) {
        $$('.s2-line').forEach((p) => {
          p.innerHTML = p.textContent.trim().split(/\s+/).map((w, i) => `<span class="w" style="--i:${i}">${esc(w)}</span>`).join(' ');
        });
        this.built = true;
      }
      $$('.s2-line').forEach((p) => p.classList.remove('in', 'out'));
    },
    async play() {
      const shot = $('#sh-window');
      showShot(shot, 2400);
      // One long, slow push toward him for the whole scene
      cam(shot, { s: [1.02, 1.16], o: '22% 45%', p: { pos: ['14% 50%', '6% 50%'], s: [1, 1.08], o: '50% 45%' } }, 32000);
      await wait(2600);
      const lines = $$('.s2-line');
      for (let i = 0; i < lines.length; i++) {
        const p = lines[i], words = p.querySelectorAll('.w').length;
        p.classList.remove('out');
        p.classList.add('in');
        Sound.chime([659, 587, 523, 784][i]);
        await wait(2600 + words * 230);
        if (i < lines.length - 1) {
          p.classList.add('out');
          await wait(1300);
          p.classList.remove('in');
          await wait(500);
        }
      }
      await wait(2800);
      goTo(3);
    },
  };

  /* ===== SCENE 3 — THE LETTER ===== */
  SCENES[3] = {
    setup() {
      $('#envelope').classList.remove('gone');
      const env = $('#env');
      env.classList.remove('open', 'letter-out');
      retrigger(env, 'env'); // replay entrance
      $('#seal').classList.remove('broken');
      $('#seal').disabled = false;
      const letter = $('#letter');
      letter.className = 'letter';
      $('#letter-p1').classList.remove('active');
      const btn = $('#btn-letter-continue');
      btn.disabled = false; btn.classList.remove('pressed');
      this.opened = false; this.continued = false;
    },
    async play() {
      await wait(600);
      caption('A letter, sealed in wax, has found its way to you.');
      await wait(3800);
      hideCaption();
    },
    async open() {
      if (this.opened) return;
      this.opened = true;
      hideCaption();
      const seal = $('#seal'), env = $('#env');
      seal.disabled = true;
      seal.classList.add('broken');
      Sound.chime(784); Sound.paper();
      await wait(600);
      env.classList.add('open');
      await wait(1000);
      env.classList.add('letter-out'); Sound.paper();
      await wait(1200);
      $('#envelope').classList.add('gone');
      const letter = $('#letter');
      letter.classList.add('show');
      await wait(900);
      $('#letter-p1').classList.add('active');
    },
    // Continue: the letter itself becomes the paper airplane (Scene 4 picks up the same frame)
    async next() {
      if (this.continued || state.busy) return;
      this.continued = true;
      const btn = $('#btn-letter-continue');
      btn.disabled = true; btn.classList.add('pressed');
      Sound.chime(988);
      save();
      await wait(450);
      goTo(4, { kind: 'cut' });
    },
  };

  /* ===== SCENE 4 — HER NAME IN THE SKY ===== */
  SCENES[4] = {
    setup() {
      ensureName();
      const s4 = $('.s4'), letter = $('#s4-letter');
      letter.style.transition = 'none';
      s4.classList.remove('to-sky');
      letter.className = 'letter show still';
      void letter.offsetWidth;
      letter.style.transition = '';
      const nm = $('#s4-name');
      nm.classList.remove('glow');
      $$('.ch', nm).forEach((c) => c.classList.remove('on'));
      const plane = $('#s4-plane');
      plane.classList.remove('on'); plane.style.transform = ''; plane._ang = null; plane._roll = 0;
      $('#s4-puffs').innerHTML = '';
    },
    async play({ cut = false } = {}) {
      const s4 = $('.s4'), letter = $('#s4-letter'), plane = $('#s4-plane'), name = $('#s4-name'), puffs = $('#s4-puffs');
      await wait(cut ? 250 : 900);
      caption('Some names are too beautiful to stay on paper.');
      await wait(1200);
      // Fold, crease by crease, into a paper dart
      letter.classList.add('folding'); Sound.paper();
      await wait(450);
      letter.classList.add('fold-1'); Sound.paper(); Sound.chime(660);
      await wait(750);
      letter.classList.replace('fold-1', 'fold-2'); Sound.paper(); Sound.chime(740);
      await wait(750);
      hideCaption();
      letter.classList.replace('fold-2', 'fold-3'); Sound.paper(); Sound.chime(880);
      await wait(750);
      letter.classList.replace('fold-3', 'fold-4'); Sound.paper();
      await wait(650);

      // The folded paper becomes the airplane, resting where the letter was
      const sr = s4.getBoundingClientRect(), lr = letter.getBoundingClientRect();
      const start = [lr.left - sr.left + lr.width / 2, lr.top - sr.top + lr.height / 2, 1.05];
      plane._ang = null; plane._roll = 0;
      plane.style.transform = `translate3d(${start[0]}px,${start[1]}px,0) scale(1.05) rotate(-1.5708rad)`;
      plane.classList.add('on');
      letter.classList.add('flown');
      Sound.chime(1175);
      await wait(500);

      const W = sr.width, H = sr.height, portrait = H > W;
      fitSkyName(name, state.name);
      const chars = $$('.ch', name);
      const centers = chars.map((c) => { const r = c.getBoundingClientRect(); return r.left - sr.left + r.width * 0.5; });
      // Measure against the sky layer (it is still sliding in), not the viewport
      const nr = name.getBoundingClientRect(), kr = $('.s4 .s3-sky').getBoundingClientRect();
      const left = nr.left - kr.left, cy = nr.top - kr.top + nr.height * 0.55;

      if (reduceMotion) {
        // Reduced motion: no flight, the name simply appears letter by letter
        plane.classList.remove('on');
        s4.classList.add('to-sky');
        await wait(1900);
        caption('…and wrote it slowly, letter by letter, across the clouds.');
        for (const c of chars) { c.classList.add('on'); await wait(220); }
      } else {
        const writeDur = 2800 + state.name.length * 140;
        const total = 3400 + 1300 + writeDur + 1700;
        Sound.wind(total / 1000 + 0.6);
        Sound.duck(0.55, total - 1200);
        s4.classList.add('to-sky');
        caption('It rose from the table and out into the evening sky…');
        // Lift off close to the camera, sweep up and away into the distance
        const near = portrait ? 1.25 : 1.45, far = portrait ? 0.42 : 0.5, mid = portrait ? 0.62 : 0.72;
        await fly(plane, [start, [start[0] + W * 0.02, start[1] - H * 0.16, near], [W * 0.7, H * 0.3, 1.0], [W * 0.8, H * 0.16, 0.72], [W * 0.56, H * 0.08, far], [W * 0.3, H * 0.14, 0.55]], 3400, { ease: easeInOut, puffs, puffEvery: 60 });
        await fly(plane, [[W * 0.3, H * 0.14, 0.55], [W * 0.14, H * 0.2, 0.62], [left - 40, cy - 6, mid]], 1300, { ease: linear, puffs, puffEvery: 60 });
        caption('…and wrote it slowly, letter by letter, across the clouds.');
        const pts = [];
        for (let i = 0; i <= 6; i++) pts.push([left - 40 + ((nr.width + 80) * i) / 6, cy + Math.sin(i * 1.7) * nr.height * 0.16, mid]);
        let shown = 0;
        await fly(plane, pts, writeDur, {
          ease: linear, puffs, puffEvery: 24,
          onStep: (x) => {
            while (shown < chars.length && x >= centers[shown] - 6) { chars[shown].classList.add('on'); shown++; }
          },
        });
        chars.forEach((c) => c.classList.add('on'));
        // Off over the rooftops, growing smaller toward the sunset
        await fly(plane, [pts[pts.length - 1], [W * 0.9, cy + H * 0.12, 0.5], [W * 0.8, H * 0.56, 0.22], [W * 0.74, H * 0.64, 0.08]], 1700, { ease: easeInOut, puffs, puffEvery: 70 });
        plane.classList.remove('on');
      }
      name.classList.add('glow');
      Sound.chime(1046);
      caption(`— <span class="gold-name">${esc(state.name)}</span> —`);
      await wait(3600);
      caption('The whole sky seemed to say it softly.');
      await wait(3000);
      hideCaption();
      await wait(600);
      goTo(5);
    },
  };

  /* ===== SCENE 5 — THE DATE INVITATION ===== */
  const PLEAS = [
    '',
    'Oh… are you certain? His lip has begun to tremble.',
    'Please, think once more — the tears are falling now.',
    'He is completely heartbroken. Perhaps… one more chance?',
  ];
  const NO_LABELS = ['No', 'Still no?', 'Really no?', 'No…'];
  SCENES[5] = {
    built: false,
    setup() {
      const q = $('#s5-q');
      if (!this.built) {
        const accent = ['chance', 'date?'];
        q.innerHTML = q.textContent.trim().split(/\s+/).map((w) => `<span class="w${accent.includes(w) ? ' accent' : ''}">${w}</span>`).join(' ');
        this.built = true;
      }
      $$('.w', q).forEach((w) => w.classList.remove('in'));
      $('.s5-actions').classList.remove('in');
      $('#s5-beau').classList.remove('happy');
      state.noStage = 0;
      this.applyStage();
      $('#btn-yes').disabled = false; $('#btn-no').disabled = false;
    },
    async play() {
      const words = $$('#s5-q .w');
      await wait(300);
      for (const w of words) { w.classList.add('in'); await wait(150); }
      await wait(500);
      $('.s5-actions').classList.add('in');
    },
    applyStage() {
      const n = state.noStage, beau = $('#s5-beau'), wrap = $('#s5-wrap');
      if (!beau.classList.contains('happy')) beau.dataset.mood = n ? 'cry' + n : 'hope';
      ['stage-1', 'stage-2', 'stage-3'].forEach((c) => wrap.classList.remove(c));
      if (n) wrap.classList.add('stage-' + n);
      $('#s5-plea').textContent = PLEAS[n];
      $('#btn-no').textContent = NO_LABELS[n];
      const yes = $('#btn-yes'), no = $('#btn-no');
      yes.style.setProperty('--ys', (1 + n * 0.12).toFixed(2));
      no.style.setProperty('--ns', (1 - n * 0.12).toFixed(2));
    },
    no() {
      if (state.busy) return;
      state.noStage = Math.min(3, state.noStage + 1);
      this.applyStage();
      Sound.chime(330 - state.noStage * 40);
      const wrap = $('#s5-wrap');
      wrap.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 360 });
    },
    async yes() {
      if (state.busy) return;
      const beau = $('#s5-beau');
      $('#btn-yes').disabled = true; $('#btn-no').disabled = true;
      state.noStage = 0; this.applyStage();
      beau.classList.add('happy'); beau.dataset.mood = 'happy';
      $('#s5-plea').textContent = 'He has never smiled like this before.';
      Sound.chime(1046);
      await sleep(1600);
      goTo(6);
    },
  };

  /* ===== SCENE 6 — CHOOSE YOUR DATE ===== */
  SCENES[6] = {
    setup() {
      $$('.date-card').forEach((c) => {
        const sel = c.dataset.exp === state.experience;
        c.classList.toggle('selected', sel);
        c.setAttribute('aria-checked', String(sel));
      });
      $('.date-cards').classList.toggle('has-choice', !!state.experience);
      this.updateBtn();
      $('.s6 .scene-scroll').scrollTop = 0;
    },
    pick(card) {
      state.experience = card.dataset.exp;
      save();
      $$('.date-card').forEach((c) => { const s = c === card; c.classList.toggle('selected', s); c.setAttribute('aria-checked', String(s)); });
      $('.date-cards').classList.add('has-choice');
      this.updateBtn();
      Sound.chime(784);
      if (isSmall()) setTimeout(() => $('#btn-s6-next').scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 350);
    },
    updateBtn() {
      const b = $('#btn-s6-next');
      b.disabled = !state.experience;
      b.textContent = state.experience ? `Continue with ${state.experience}` : 'Choose our date';
    },
  };

  /* ===== SCENE 7 — DATE & TIME ===== */
  const fmtLong = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fmtTime = () => `${state.hour}:${String(state.minute).padStart(2, '0')} ${state.pm ? 'PM' : 'AM'}`;
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  SCENES[7] = {
    built: false,
    build() {
      // Calendar wheel: the next 60 days
      const today = new Date(); today.setHours(12, 0, 0, 0);
      state.dates = Array.from({ length: 60 }, (_, i) => { const d = new Date(today); d.setDate(today.getDate() + i + 1); return d; });
      const wheel = $('#wheel');
      wheel.innerHTML = state.dates.map((d, i) => `<div class="wheel-item" role="option" data-i="${i}" aria-selected="false"><b>${d.getDate()}</b><span>${d.toLocaleDateString('en-GB', { weekday: 'short' })} · ${d.toLocaleDateString('en-GB', { month: 'short' })}</span></div>`).join('');
      this.items = $$('.wheel-item', wheel);
      let raf = 0, settle = 0;
      wheel.addEventListener('scroll', () => {
        if (!raf) raf = requestAnimationFrame(() => { raf = 0; this.paintWheel(); });
        clearTimeout(settle);
        settle = setTimeout(() => this.selectDate(Math.round(wheel.scrollTop / this.ih()), false), 140);
      }, { passive: true });
      wheel.addEventListener('click', (e) => { const it = e.target.closest('.wheel-item'); if (it) this.scrollToDate(+it.dataset.i); });
      wheel.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this.scrollToDate(state.dateIndex + 1); }
        if (e.key === 'ArrowUp') { e.preventDefault(); this.scrollToDate(state.dateIndex - 1); }
      });
      $('#wheel-up').addEventListener('click', () => this.scrollToDate(state.dateIndex - 1));
      $('#wheel-down').addEventListener('click', () => this.scrollToDate(state.dateIndex + 1));

      // Golden clock
      const R = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      let ticks = '', nums = '';
      for (let i = 0; i < 60; i++) {
        const a = (i * 6 * Math.PI) / 180, big = i % 5 === 0, r1 = big ? 116 : 120, r2 = 126;
        ticks += `<line x1="${(150 + r1 * Math.sin(a)).toFixed(2)}" y1="${(150 - r1 * Math.cos(a)).toFixed(2)}" x2="${(150 + r2 * Math.sin(a)).toFixed(2)}" y2="${(150 - r2 * Math.cos(a)).toFixed(2)}" stroke="${big ? '#5a3a1a' : '#9c7f55'}" stroke-width="${big ? 2.2 : 1}"/>`;
      }
      for (let h = 0; h < 12; h++) {
        const a = (h * 30 * Math.PI) / 180, x = 150 + 98 * Math.sin(a), y = 150 - 98 * Math.cos(a), hour = h === 0 ? 12 : h;
        nums += `<g class="numeral" data-h="${hour}" role="button" tabindex="0" aria-label="${hour} o'clock"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="16"/><text x="${x.toFixed(2)}" y="${(y + 6.5).toFixed(2)}" text-anchor="middle">${R[h]}</text></g>`;
      }
      $('#clock').innerHTML = `
        <svg viewBox="0 0 300 300" aria-label="Golden clock — choose an hour">
          <defs>
            <linearGradient id="cg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f7e6ae"/><stop offset=".3" stop-color="#c9a45c"/><stop offset=".55" stop-color="#f1dc9f"/><stop offset=".8" stop-color="#8a6a2f"/><stop offset="1" stop-color="#d7b46a"/></linearGradient>
            <radialGradient id="cg2" cx="45%" cy="40%" r="65%"><stop offset="0" stop-color="#fbf4e2"/><stop offset=".75" stop-color="#efe0bf"/><stop offset="1" stop-color="#d6c095"/></radialGradient>
            <linearGradient id="cg3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b2416"/><stop offset="1" stop-color="#1a0e07"/></linearGradient>
          </defs>
          <circle cx="150" cy="150" r="148" fill="url(#cg1)"/>
          <circle cx="150" cy="150" r="140" fill="#5a3f15"/>
          <circle cx="150" cy="150" r="137" fill="url(#cg1)" opacity=".85"/>
          <circle class="face" cx="150" cy="150" r="130" fill="url(#cg2)"/>
          <circle cx="150" cy="150" r="76" fill="none" stroke="#c9a45c" stroke-width=".8" opacity=".7"/>
          <text x="150" y="196" text-anchor="middle" font-family="Pinyon Script, cursive" font-size="17" fill="#7d1224" pointer-events="none">Florence</text>
          ${ticks}${nums}
          <g class="hand hand-h" id="hand-h"><path d="M150 166 L146.2 112 Q141 98 150 82 Q159 98 153.8 112 Z" fill="url(#cg3)"/><circle cx="150" cy="100" r="4.2" fill="#c9a45c"/></g>
          <g class="hand hand-m" id="hand-m"><path d="M150 172 L147.6 70 L150 44 L152.4 70 Z" fill="url(#cg3)"/></g>
          <circle cx="150" cy="150" r="8" fill="url(#cg1)"/><circle cx="150" cy="150" r="3" fill="#3b2416"/>
        </svg>`;
      const clock = $('#clock');
      clock.addEventListener('click', (e) => {
        const g = e.target.closest('.numeral');
        if (g) return this.setHour(+g.dataset.h);
        const svg = clock.querySelector('svg'), r = svg.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) > r.width * 0.46) return;
        const ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
        this.setHour(((Math.round(((ang + 360) % 360) / 30) % 12) || 12));
      });
      clock.addEventListener('keydown', (e) => { const g = e.target.closest('.numeral'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.setHour(+g.dataset.h); } });
      $$('.minute-chips .chip').forEach((c) => c.addEventListener('click', () => this.setMinute(+c.dataset.min)));
      $$('.ampm .chip').forEach((c) => c.addEventListener('click', () => { state.pm = c.dataset.pm === '1'; this.paintTime(); Sound.chime(700); }));
      this.handDeg = { h: 0, m: 0 };
      this.built = true;
    },
    ih() { return this.items[0] ? this.items[0].offsetHeight : 46; },
    paintWheel() {
      const wheel = $('#wheel'), pos = wheel.scrollTop / this.ih();
      const from = Math.max(0, Math.floor(pos) - 4), to = Math.min(this.items.length, Math.ceil(pos) + 5);
      for (let i = from; i < to; i++) {
        const off = i - pos, a = clamp(off * 22, -80, 80);
        const it = this.items[i];
        it.style.transform = `rotateX(${(-a).toFixed(1)}deg) scale(${(1 - Math.min(Math.abs(off), 3) * 0.06).toFixed(3)})`;
        it.style.opacity = (1 - Math.min(Math.abs(off), 3) * 0.26).toFixed(2);
      }
    },
    scrollToDate(i, smooth = true) {
      i = clamp(i, 0, state.dates.length - 1);
      $('#wheel').scrollTo({ top: i * this.ih(), behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
      if (!smooth) this.selectDate(i, true);
    },
    selectDate(i, silent) {
      i = clamp(i, 0, state.dates.length - 1);
      const changed = i !== state.dateIndex;
      state.dateIndex = i;
      this.items.forEach((it, k) => { it.classList.toggle('sel', k === i); it.setAttribute('aria-selected', String(k === i)); });
      const d = state.dates[i];
      $('#tc-month').textContent = MONTHS[d.getMonth()];
      $('#tc-day').textContent = d.getDate();
      $('#tc-week').textContent = d.toLocaleDateString('en-GB', { weekday: 'long' });
      $('#tc-year').textContent = d.getFullYear();
      if (changed && !silent) { retrigger($('#tear-cal'), 'flip'); Sound.chime(620); }
    },
    turn(key, target) {
      const prev = this.handDeg[key];
      const d = ((((target - prev) % 360) + 540) % 360) - 180;
      this.handDeg[key] = prev + d;
      return this.handDeg[key];
    },
    paintTime() {
      $('#hand-h').style.transform = `rotate(${this.turn('h', (state.hour % 12) * 30 + state.minute * 0.5)}deg)`;
      $('#hand-m').style.transform = `rotate(${this.turn('m', state.minute * 6)}deg)`;
      $$('#clock .numeral').forEach((g) => g.classList.toggle('sel', +g.dataset.h === state.hour));
      $$('.minute-chips .chip').forEach((c) => c.classList.toggle('sel', +c.dataset.min === state.minute));
      $$('.ampm .chip').forEach((c) => c.classList.toggle('sel', (c.dataset.pm === '1') === state.pm));
      $('#time-readout').textContent = fmtTime();
    },
    setHour(h) { state.hour = h; this.paintTime(); Sound.chime(740); },
    setMinute(m) { state.minute = m; this.paintTime(); Sound.chime(820); },
    setup() {
      if (!this.built) this.build();
      $('#review-modal').hidden = true;
      $('#stamp').classList.remove('on');
      $('#btn-confirm').disabled = false; $('#btn-edit').disabled = false;
      $('.s7 .scene-scroll').scrollTop = 0;
      requestAnimationFrame(() => { this.scrollToDate(state.dateIndex, false); this.paintWheel(); });
      this.paintTime();
    },
    review() {
      ensureName();
      $('#rv-name').textContent = state.name;
      $('#rv-exp').textContent = state.experience || 'Dinner Date';
      $('#rv-date').textContent = fmtLong(state.dates[state.dateIndex]);
      $('#rv-time').textContent = fmtTime();
      $('#stamp').classList.remove('on');
      $('#review-modal').hidden = false;
      setTimeout(() => $('#btn-confirm').focus({ preventScroll: true }), 300);
    },
    closeReview() { $('#review-modal').hidden = true; $('#btn-review').focus({ preventScroll: true }); },
    async confirm() {
      const confirmButton = $('#btn-confirm');
      const editButton = $('#btn-edit');
      const originalLabel = confirmButton.textContent;
      confirmButton.disabled = true;
      editButton.disabled = true;
      confirmButton.textContent = 'Sending confirmation…';

      const selectedDate = state.dates[state.dateIndex];
      const confirmedAt = new Date().toISOString();
      const payload = {
        name: HER_NAME,
        dateChoice: state.experience || 'Dinner Date',
        date: selectedDate ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, '0')}-${String(selectedDate.getDate()).padStart(2, '0')}` : '',
        dateLabel: selectedDate ? fmtLong(selectedDate) : '',
        time: fmtTime(),
        confirmedAt,
      };

      try {
        const response = await fetch('/.netlify/functions/confirm-date', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.ok) {
          throw new Error(result.error || 'The confirmation could not be sent.');
        }

        $('#stamp').classList.add('on');
        save({ ...payload, confirmed: true, confirmedAt });
        Sound.thump(); Sound.chime(1046);
        await sleep(1700);
        goTo(8);
      } catch (error) {
        console.error('Date confirmation failed:', error);
        confirmButton.disabled = false;
        editButton.disabled = false;
        confirmButton.textContent = originalLabel;
        alert('Your confirmation was not sent. Please check your connection and try again.');
      }
    },
  };

  /* ===== SCENE 8 — WAITING FOR HER ===== */
  SCENES[8] = {
    setup() {
      $('.s8').classList.remove('reveal');
      resetFilm($('#s8-film'));
      ensureName();
      const exp = state.experience || 'Dinner Date';
      const d = state.dates[state.dateIndex];
      $('#s8-details').innerHTML = `Waiting for <b>${esc(state.name)}</b><br><b>${esc(exp)}</b> · ${d ? esc(fmtLong(d)) : ''} · <b>${fmtTime()}</b>`;
    },
    async play() {
      const s8 = $('.s8'), S = (id) => $('#' + id);
      await wait(400);
      // Wide: the old street at dusk, the camera slowly closing in on him
      showShot(S('sh-street'), 2200);
      cam(S('sh-street'), { s: [1, 1.22], o: '73% 58%', p: { pos: ['70% 50%', '84% 50%'], s: [1, 1.12], o: '50% 58%' } }, 9000);
      caption('Beneath the old street lamp, he waits — a single red rose in his hand.');
      await wait(6200);

      // Close: he checks his wristwatch
      showShot(S('sh-watch'), 1400);
      cam(S('sh-watch'), { s: [1.02, 1.12], o: '42% 62%', p: { pos: ['30% 50%', '38% 50%'], s: [1, 1.08], o: '50% 62%' } }, 6000);
      caption('He checks his watch. Then checks it again.');
      Sound.chime(880);
      await wait(5400);

      // He looks down the street — the camera follows his gaze
      showShot(S('sh-look'), 1600);
      cam(S('sh-look'), { s: [1.12, 1.02], o: '35% 50%', t: [[-1, 0], [1.5, 0]], p: { pos: ['20% 50%', '88% 50%'], s: [1.04, 1] } }, 7000);
      caption('Every footstep on the cobblestones might be hers.');
      await wait(6200);
      hideCaption();

      // Back to him, the slowest push of the film — and the words
      showShot(S('sh-street'), 2000);
      cam(S('sh-street'), { s: [1.12, 1.42], o: '73% 34%', p: { pos: ['84% 50%', '84% 50%'], s: [1.04, 1.2], o: '50% 22%' } }, 42000);
      await wait(1600);
      s8.classList.add('reveal');
      save({ finishedFilm: true });
    },
  };

  /* ---------------- 8. BOOT ---------------- */
  function bind() {
    $('#btn-begin').addEventListener('click', () => { Sound.setOn(true); goTo(1); });
    $('#sound-btn').addEventListener('click', () => Sound.setOn(!Sound.on));
    // Pause the recording while the tab is hidden; resume where it left off
    document.addEventListener('visibilitychange', () => {
      const a = Sound.audio; if (!a || !Sound.on) return;
      if (document.hidden) a.pause(); else { const pr = a.play(); if (pr && pr.catch) pr.catch(() => {}); }
    });
    $('#seal').addEventListener('click', () => run(() => SCENES[3].open()));
    $('#btn-letter-continue').addEventListener('click', () => run(() => SCENES[3].next()));
    $('#btn-yes').addEventListener('click', () => SCENES[5].yes());
    $('#btn-no').addEventListener('click', () => SCENES[5].no());
    $$('.date-card').forEach((c) => c.addEventListener('click', () => SCENES[6].pick(c)));
    $('#btn-s6-next').addEventListener('click', () => { if (state.experience) goTo(7); });
    $('#btn-review').addEventListener('click', () => SCENES[7].review());
    $('#btn-edit').addEventListener('click', () => SCENES[7].closeReview());
    $('.modal-backdrop').addEventListener('click', () => { if (!$('#btn-confirm').disabled) SCENES[7].closeReview(); });
    $('#btn-confirm').addEventListener('click', () => SCENES[7].confirm());
    $('#btn-replay').addEventListener('click', () => {
      state.name = HER_NAME; state.experience = null; state.dateIndex = 0; state.hour = 7; state.minute = 0; state.pm = true;
      goTo(1);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#review-modal').hidden && !$('#btn-confirm').disabled) SCENES[7].closeReview();
    });
    let rt = 0;
    addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (state.scene === 4) { const el = $('#s4-name'); if (el.textContent) fitSkyName(el, state.name); }
      }, 250);
    });
  }

  function init() {
    $('#s4-plane').innerHTML = planeSVG;
    preloadImages();
    particles();
    atmosphere();
    buildProgress();
    document.body.dataset.scene = 0;
    bind();
    // Deep link for previewing a chapter, e.g. #scene=5
    const m = location.hash.match(/scene=(\d)/);
    if (m && +m[1] >= 1 && +m[1] <= 8) {
      const n = +m[1];
      if (n > 6) state.experience = 'Dinner Date';
      if (n > 7) SCENES[7].build();
      goTo(n);
    }
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(init); else init();
})();
