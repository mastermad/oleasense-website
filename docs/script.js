const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const SVG_NS = 'http://www.w3.org/2000/svg';

/* Navigation */
const toggle = document.querySelector('.nav-toggle');
const menu = document.getElementById('menu-principal');
const header = document.getElementById('entete');

function setMenu(open) {
  toggle.setAttribute('aria-expanded', String(open));
  menu.classList.toggle('is-open', open);
}

/* Méga-menu « Solutions » : sans JavaScript, le lien #solutions reste actif */
document.documentElement.classList.add('js');
const mega = document.querySelector('.has-mega');
const megaButton = document.getElementById('solutions-bouton');
const megaPanel = document.getElementById('mega-solutions');
const hoverQuery = window.matchMedia('(hover: hover) and (min-width: 1101px)');
let megaByHover = false;

function setMega(open) {
  megaButton.setAttribute('aria-expanded', String(open));
  megaPanel.hidden = !open;
  mega.classList.toggle('is-open', open);
  if (!open) megaByHover = false;
}
if (mega && megaButton && megaPanel && window.OleaMenu) {
  const isMegaOpen = () => megaButton.getAttribute('aria-expanded') === 'true';
  megaButton.addEventListener('click', () => {
    if (megaByHover) { megaByHover = false; return; }
    setMega(OleaMenu.nextState(isMegaOpen(), 'toggle'));
  });
  mega.addEventListener('mouseenter', () => {
    if (!hoverQuery.matches || isMegaOpen()) return;
    setMega(OleaMenu.nextState(false, 'open'));
    megaByHover = true;
  });
  mega.addEventListener('mouseleave', () => {
    if (hoverQuery.matches && isMegaOpen()) setMega(OleaMenu.nextState(true, 'close'));
  });
  mega.addEventListener('focusout', event => {
    if (isMegaOpen() && event.relatedTarget && OleaMenu.isOutside(event.relatedTarget, mega)) setMega(OleaMenu.nextState(true, 'focusout'));
  });
  document.addEventListener('click', event => {
    if (isMegaOpen() && OleaMenu.isOutside(event.target, mega)) setMega(OleaMenu.nextState(true, 'outside'));
  });
  megaPanel.addEventListener('click', event => { if (event.target.closest('a')) setMega(false); });
}

toggle.addEventListener('click', () => setMenu(toggle.getAttribute('aria-expanded') !== 'true'));
menu.addEventListener('click', event => { if (event.target.closest('a')) setMenu(false); });
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  if (megaButton && megaButton.getAttribute('aria-expanded') === 'true') { setMega(false); megaButton.focus(); return; }
  if (toggle.getAttribute('aria-expanded') === 'true') { setMenu(false); toggle.focus(); }
});
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* Apparition au défilement */
const revealables = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !reduceMotion) {
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); observer.unobserve(entry.target); }
  }, { threshold: 0.15 });
  revealables.forEach(element => observer.observe(element));
} else {
  revealables.forEach(element => element.classList.add('is-visible'));
}

/* Ondes spectrales animées (héro et appel à l'action) */
function startWaves(canvas, { lines = 16, amplitude = 0.08, speed = 0.0006, center = 0.55 } = {}) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let visible = true;
  let frame = 0;

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  const draw = time => {
    ctx.clearRect(0, 0, width, height);
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, '#6F963F');
    gradient.addColorStop(0.35, '#079A79');
    gradient.addColorStop(0.7, '#087C91');
    gradient.addColorStop(1, '#D9AA36');
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < lines; i++) {
      const offset = (i - lines / 2) * (height * 0.018);
      const base = height * center + offset;
      const amp = height * amplitude * (0.55 + 0.45 * Math.sin(i * 0.5));
      ctx.globalAlpha = 0.2 + 0.7 * (1 - Math.abs(i - lines / 2) / (lines / 2));
      ctx.beginPath();
      for (let x = 0; x <= width + 8; x += 8) {
        const k = x / width;
        const y = base
          + amp * Math.sin(k * 6.2 + time * speed + i * 0.32)
          + amp * 0.5 * Math.sin(k * 11 - time * speed * 0.7 + i * 0.2);
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  const loop = time => {
    if (visible && !document.hidden) draw(time);
    frame = requestAnimationFrame(loop);
  };

  resize();
  new ResizeObserver(() => { resize(); if (reduceMotion) draw(2000); }).observe(canvas);
  new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(canvas);
  if (reduceMotion) draw(2000); else frame = requestAnimationFrame(loop);
  return () => cancelAnimationFrame(frame);
}

startWaves(document.querySelector('.hero-canvas'), { lines: 18, amplitude: 0.09, center: 0.58 });
startWaves(document.querySelector('.cta-canvas'), { lines: 12, amplitude: 0.1, speed: 0.0004, center: 0.5 });

/* Vidéo d'ambiance facultative : affichée seulement si assets/hero.mp4 existe */
const video = document.querySelector('.hero-video');
if (video && !reduceMotion) {
  video.addEventListener('canplay', () => { video.classList.add('is-ready'); video.play().catch(() => {}); }, { once: true });
  video.preload = 'auto';
  video.load();
}

/* Jauge du héro */
const gauge = document.querySelector('.gauge');
if (gauge) setTimeout(() => gauge.classList.add('is-on'), 400);

/* Spectre interactif (illustration) */
(function spectrum() {
  const svg = document.getElementById('spectre-svg');
  const slider = document.getElementById('spectre-stress');
  const badge = document.getElementById('spectre-etat');
  const message = document.getElementById('spectre-message');
  if (!svg || !slider) return;

  const W = 640; const H = 320; const L = 46; const R = 16; const T = 26; const B = 38;
  const wavelengths = [400, 450, 500, 550, 600, 650, 670, 700, 720, 750, 800, 900, 950, 970, 1000, 1100];
  const healthy = [0.04, 0.05, 0.07, 0.12, 0.07, 0.05, 0.045, 0.10, 0.30, 0.46, 0.50, 0.49, 0.45, 0.43, 0.46, 0.47];
  const stressed = [0.06, 0.08, 0.10, 0.16, 0.14, 0.12, 0.12, 0.18, 0.26, 0.33, 0.36, 0.35, 0.34, 0.33, 0.34, 0.35];
  const x = wavelength => L + ((wavelength - 400) / 700) * (W - L - R);
  const y = value => T + (1 - value / 0.6) * (H - T - B);

  const el = (name, attributes = {}, parent = svg) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    parent.appendChild(node);
    return node;
  };

  const smoothPath = values => {
    const points = wavelengths.map((wavelength, index) => [x(wavelength), y(values[index])]);
    let d = `M${points[0][0]} ${points[0][1]}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[Math.min(i + 2, points.length - 1)];
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)}, ${c2[0].toFixed(1)} ${c2[1].toFixed(1)}, ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };

  const defs = el('defs');
  const area = el('linearGradient', { id: 'spectre-aire', x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
  el('stop', { offset: 0, 'stop-color': '#D9AA36', 'stop-opacity': 0.35 }, area);
  el('stop', { offset: 1, 'stop-color': '#D9AA36', 'stop-opacity': 0 }, area);

  for (const value of [0, 0.2, 0.4, 0.6]) {
    el('line', { x1: L, x2: W - R, y1: y(value), y2: y(value), class: value === 0 ? 'axis' : 'grid' });
    el('text', { x: L - 8, y: y(value) + 4, 'text-anchor': 'end' }).textContent = value.toFixed(1);
  }
  for (let wavelength = 400; wavelength <= 1100; wavelength += 100) {
    el('text', { x: x(wavelength), y: y(0) + 17, 'text-anchor': 'middle' }).textContent = wavelength;
  }
  el('text', { x: (L + W - R) / 2, y: H - 3, 'text-anchor': 'middle' }).textContent = 'Longueur d\'onde (nm)';
  el('text', { x: L, y: 12 }).textContent = 'Réflectance';

  const bands = [
    { from: 650, to: 690, label: 'Chlorophylle', color: 'rgba(7,154,121,.28)' },
    { from: 950, to: 990, label: 'Eau', color: 'rgba(8,124,145,.35)' }
  ];
  for (const band of bands) {
    el('rect', { x: x(band.from), y: T, width: x(band.to) - x(band.from), height: H - T - B, fill: band.color });
    el('text', { x: (x(band.from) + x(band.to)) / 2, y: T + 14, 'text-anchor': 'middle' }).textContent = band.label;
  }

  el('path', { d: smoothPath(healthy), fill: 'none', stroke: '#8fd1bd', 'stroke-width': 2, 'stroke-dasharray': '6 5' });
  const live = el('path', { fill: 'none', stroke: '#D9AA36', 'stroke-width': 3, 'stroke-linecap': 'round' });
  const liveArea = el('path', { fill: 'url(#spectre-aire)' });

  const states = [
    { max: 33, text: 'Végétation saine', css: '', message: 'Forte absorption de la chlorophylle dans le rouge et plateau élevé dans le proche infrarouge : l\'arbre est en bonne santé.' },
    { max: 66, text: 'Stress modéré', css: 'is-moderate', message: 'La chlorophylle absorbe moins et le plateau infrarouge s\'abaisse : les premiers signes apparaissent, invisibles à l\'œil nu.' },
    { max: 100, text: 'Stress sévère', css: 'is-severe', message: 'La signature s\'aplatit : moins de chlorophylle, moins d\'eau. Il est temps d\'agir sur cette parcelle.' }
  ];

  const update = () => {
    const t = Number(slider.value) / 100;
    const values = healthy.map((value, index) => value + (stressed[index] - value) * t);
    const path = smoothPath(values);
    live.setAttribute('d', path);
    liveArea.setAttribute('d', `${path} L${x(1100)} ${y(0)} L${x(400)} ${y(0)} Z`);
    const state = states.find(item => Number(slider.value) <= item.max);
    badge.textContent = state.text;
    badge.className = `badge ${state.css}`.trim();
    message.textContent = state.message;
    slider.setAttribute('aria-valuetext', state.text);
  };

  slider.addEventListener('input', update);
  update();
})();

/* Paysage d'oliveraie (décor) */
(function landscape() {
  const svg = document.querySelector('.landscape');
  if (!svg) return;
  const el = (name, attributes = {}, parent = svg) => {
    const node = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    parent.appendChild(node);
    return node;
  };
  let seed = 42;
  const random = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const defs = el('defs');
  const glow = el('radialGradient', { id: 'soleil' }, defs);
  el('stop', { offset: 0, 'stop-color': '#f6d878', 'stop-opacity': 0.95 }, glow);
  el('stop', { offset: 0.4, 'stop-color': '#D9AA36', 'stop-opacity': 0.35 }, glow);
  el('stop', { offset: 1, 'stop-color': '#D9AA36', 'stop-opacity': 0 }, glow);

  el('circle', { cx: 1280, cy: 225, r: 170, fill: 'url(#soleil)' });
  el('circle', { cx: 1280, cy: 225, r: 42, fill: '#f3d27a' });

  el('path', { d: 'M0 250 C200 190 420 230 640 200 S1080 170 1320 215 S1520 210 1600 200 V460 H0Z', fill: '#1f5f47', opacity: 0.9 });
  el('path', { d: 'M0 300 C260 250 480 300 760 270 S1200 240 1600 280 V460 H0Z', fill: '#26704f' });
  el('path', { d: 'M0 350 C300 320 560 360 860 335 S1300 310 1600 340 V460 H0Z', fill: '#2d8157' });

  const rows = [{ y: 318, s: 0.45 }, { y: 350, s: 0.6 }, { y: 386, s: 0.8 }, { y: 428, s: 1 }];
  for (const row of rows) {
    const gap = 150 * row.s + 36;
    for (let px = -30 + random() * 40; px < 1650; px += gap) {
      const g = el('g', { transform: `translate(${px.toFixed(0)} ${row.y}) scale(${row.s})` });
      el('rect', { x: -3, y: -22, width: 6, height: 24, rx: 2, fill: '#4a3b2a' }, g);
      el('ellipse', { cx: 0, cy: -40, rx: 30 + random() * 6, ry: 22, fill: '#6f963f', opacity: 0.95 }, g);
      el('ellipse', { cx: -8, cy: -46, rx: 20, ry: 14, fill: '#9bbd6a', opacity: 0.8 }, g);
      el('ellipse', { cx: 9, cy: -36, rx: 16, ry: 11, fill: '#4f7a2e', opacity: 0.8 }, g);
    }
  }
})();
