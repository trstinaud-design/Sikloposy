/* =========================================================================
   SIKLOPOSY — Graphiques SVG minimalistes (aucune librairie externe)
   ========================================================================= */
const Charts = (() => {

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
  const nice = v => {
    const a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.0', '') + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace('.0', '') + 'k';
    return String(Math.round(v));
  };

  /* Barres verticales (série temporelle). data: [{label, value, sub}] */
  function bars(el, data, opts = {}) {
    const node = typeof el === 'string' ? document.getElementById(el) : el;
    if (!node) return;
    if (!data.length) { node.innerHTML = empty(); return; }

    const W = 100, H = opts.height || 160, pad = 4;
    const max = Math.max(1, ...data.map(d => Math.abs(d.value)));
    const hasNeg = data.some(d => d.value < 0);
    const zeroY = hasNeg ? H / 2 : H - 18;
    const scale = (hasNeg ? (H / 2 - pad) : (H - 18 - pad)) / max;
    const bw = W / data.length;

    const rects = data.map((d, i) => {
      const h = Math.max(1.5, Math.abs(d.value) * scale);
      const y = d.value >= 0 ? zeroY - h : zeroY;
      const x = i * bw + bw * 0.18;
      const w = bw * 0.64;
      const color = d.value < 0 ? '#ef4444' : (opts.color || '#0d9488');
      return `<g>
        <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(1.2, w / 3)}" fill="${color}" opacity="${opts.dim && i < data.length - 1 ? .75 : 1}">
          <title>${esc(d.label)} — ${esc(d.sub ?? nice(d.value))}</title>
        </rect>
      </g>`;
    }).join('');

    const labels = data.map((d, i) =>
      `<text x="${i * bw + bw / 2}" y="${H - 5}" text-anchor="middle" font-size="4.2" fill="#94a3b8">${esc(d.short ?? d.label)}</text>`
    ).join('');

    node.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" class="w-full" style="height:${H}px" preserveAspectRatio="none">
        <line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="#e2e8f0" stroke-width=".4"/>
        ${rects}${labels}
      </svg>
      <div class="flex justify-between text-[10px] text-ink-400 mt-1">
        <span>min ${nice(Math.min(...data.map(d => d.value)))}</span>
        <span>max ${nice(max)}</span>
      </div>`;
  }

  /* Barres horizontales (classements, catégories). data: [{label, value, color, meta}] */
  function hbars(el, data, opts = {}) {
    const node = typeof el === 'string' ? document.getElementById(el) : el;
    if (!node) return;
    if (!data.length) { node.innerHTML = empty(); return; }
    const max = Math.max(1, ...data.map(d => d.value));
    node.innerHTML = data.map(d => `
      <div class="mb-2.5 last:mb-0">
        <div class="flex items-baseline justify-between gap-2 mb-1">
          <span class="text-xs font-semibold text-ink-700 truncate">${esc(d.label)}</span>
          <span class="text-xs font-bold tabular-nums shrink-0 ${d.value < 0 ? 'text-red-600' : 'text-ink-900'}">${esc(opts.fmt ? opts.fmt(d.value) : nice(d.value))}</span>
        </div>
        <div class="h-2 rounded-full bg-ink-100 overflow-hidden">
          <div class="h-full rounded-full transition-all" style="width:${(d.value / max * 100).toFixed(1)}%;background:${d.color || '#0d9488'}"></div>
        </div>
        ${d.meta ? `<p class="text-[10px] text-ink-400 mt-0.5">${esc(d.meta)}</p>` : ''}
      </div>`).join('');
  }

  const empty = () => `<div class="py-8 text-center text-xs text-ink-400">Aucune donnée sur cette période</div>`;

  return { bars, hbars, nice };
})();
