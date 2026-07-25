/* =========================================================================
   SIKLOPOSY — Rendu des vues (suite) : chauffeurs, maintenance, historique
   ========================================================================= */
Object.assign(Views, (() => {

const { $, $$, esc, fmtNum, money, fmtShort, fmtDay, State, emptyBlock, avatar,
        vehicleAvatar, vehicleBadge, kpiCard, info, phoneLink } = UI;

/* ========================================================== CHAUFFEURS */
function drivers() {
  const q = State.driverQuery.toLowerCase();
  const f = State.driverFilter;

  const list = Store.drivers.sorted().filter(d => {
    const hay = [d.lastName, d.firstName, d.cin, d.phone].join(' ').toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (f === 'sanspousse') return !Store.assignments.vehicleOn(d.id, State.date);
    if (f) return d.status === f;
    return true;
  });

  $('#driverGrid').innerHTML = list.length ? list.map(d => {
    const v = Store.assignments.vehicleOn(d.id, State.date);
    const pays = Store.payments.byDriver(d.id);
    const total = pays.reduce((s, p) => s + p.amount, 0);
    const today = v ? Store.payments.find(v.id, State.date) : null;
    return `<div class="bg-white rounded-2xl border border-ink-200 overflow-hidden hover:shadow-lg transition">
      <div class="p-4 flex items-start gap-3">
        ${avatar(d, 'w-14 h-14')}
        <div class="min-w-0 flex-1">
          <p class="font-bold truncate">${esc(d.lastName)} ${esc(d.firstName)}</p>
          <p class="text-xs text-ink-500 truncate">${esc(d.phone) || 'pas de téléphone'}</p>
          <div class="flex flex-wrap gap-1 mt-2">
            <span class="text-[10px] font-black px-2 py-0.5 rounded-full ${d.status === 'actif' ? 'bg-emerald-100 text-emerald-700' : 'bg-ink-200 text-ink-600'}">${d.status === 'actif' ? 'ACTIF' : 'INACTIF'}</span>
            ${v ? `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">🚲 ${esc(v.code)}</span>`
                : `<span class="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">SANS POUSSE</span>`}
          </div>
        </div>
      </div>
      <div class="px-4 pb-3 grid grid-cols-3 gap-2 text-center">
        <div class="bg-ink-50 rounded-xl py-2">
          <p class="text-[10px] text-ink-500 font-bold">AUJOURD'HUI</p>
          <p class="text-xs font-black ${today ? 'text-emerald-600' : 'text-red-600'}">${today ? fmtNum(today.amount) : 'Rien'}</p>
        </div>
        <div class="bg-ink-50 rounded-xl py-2">
          <p class="text-[10px] text-ink-500 font-bold">TOTAL VERSÉ</p>
          <p class="text-xs font-black">${Charts.nice(total)}</p>
        </div>
        <div class="bg-ink-50 rounded-xl py-2">
          <p class="text-[10px] text-ink-500 font-bold">CAUTION</p>
          <p class="text-xs font-black text-brand-700">${Charts.nice(d.caution)}</p>
        </div>
      </div>
      <div class="px-4 pb-4 flex gap-2">
        ${phoneLink(d, 'flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold grid place-items-center hover:bg-emerald-100')}
        <button data-ddetail="${d.id}" class="flex-1 py-2 rounded-xl bg-ink-100 text-ink-700 text-xs font-bold hover:bg-ink-200">Fiche</button>
        <button data-dedit="${d.id}" class="flex-1 py-2 rounded-xl bg-brand-50 text-brand-700 text-xs font-bold hover:bg-brand-100">Modifier</button>
      </div>
    </div>`;
  }).join('') : `<div class="sm:col-span-2 xl:col-span-3 bg-white rounded-2xl border border-dashed border-ink-300 p-10 text-center">
      <p class="text-4xl mb-2">👤</p>
      <p class="font-bold mb-1">Aucun chauffeur trouvé</p>
      <button data-open="driver" class="mt-3 px-4 py-2.5 rounded-xl bg-brand-700 text-white text-sm font-bold">+ Nouveau chauffeur</button>
    </div>`;
}

/* ---- fiche détaillée d'un chauffeur ---- */
function driverDetail(id) {
  const d = Store.drivers.get(id);
  if (!d) return;
  const hist = Store.assignments.forDriver(id);
  const pays = Store.payments.byDriver(id).sort((a, b) => b.date.localeCompare(a.date));
  const total = pays.reduce((s, p) => s + p.amount, 0);
  const current = Store.assignments.vehicleOn(id, State.date);

  $('#detailTitle').textContent = `${d.lastName} ${d.firstName}`;
  $('#detailBody').innerHTML = `
    <div class="flex flex-wrap items-start gap-4 mb-5">
      ${avatar(d, 'w-24 h-24')}
      <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm flex-1 min-w-[240px]">
        ${info('CIN', esc(d.cin) || '—')}
        ${info('Téléphone', d.phone ? `<a href="tel:${esc(d.phone.replace(/\s/g,''))}" class="text-brand-700 font-bold">${esc(d.phone)}</a>` : '—')}
        ${info('Caution versée', money(d.caution))}
        ${info('Début de contrat', fmtDay(d.contractStart))}
        ${info('Statut', d.status === 'actif' ? '✅ Actif' : '⛔ Inactif')}
        ${info('Pousse actuel', current ? `🚲 ${esc(current.code)}` : '<span class="text-amber-700">Aucun</span>')}
      </div>
      <button data-dedit="${d.id}" class="px-4 py-2.5 rounded-xl border border-ink-300 text-xs font-bold hover:bg-ink-50">✎ Modifier</button>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      ${kpiCard('Total versé', money(total), `${pays.length} versement(s)`, 'green')}
      ${kpiCard('Pousses conduits', hist.length, hist.length > 1 ? 'A changé de véhicule' : 'Depuis le début', 'slate')}
      ${kpiCard('Versement moyen', money(pays.length ? total / pays.length : 0), 'Par jour travaillé', 'teal')}
      ${kpiCard('Caution', money(d.caution), 'Détenue en garantie', 'amber')}
    </div>

    ${d.note ? `<div class="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm">📝 ${esc(d.note)}</div>` : ''}

    <div class="grid lg:grid-cols-2 gap-4">
      <div>
        <h4 class="font-bold text-sm mb-2">🚲 Pousses conduits</h4>
        <div class="rounded-xl border border-ink-200 divide-y divide-ink-100">
          ${hist.length ? hist.map(a => {
            const v = Store.vehicles.get(a.vehicleId);
            const enc = Store.payments.byDriver(id)
              .filter(p => p.date >= a.from && (!a.to || p.date <= a.to))
              .reduce((s, p) => s + p.amount, 0);
            return `<div class="px-3 py-2.5 flex items-center gap-3 cursor-pointer hover:bg-ink-50" data-vdetail="${a.vehicleId}">
              ${vehicleAvatar(v, 'w-8 h-8')}
              <div class="min-w-0 flex-1">
                <p class="text-xs font-bold">${v ? esc(v.code) : 'Pousse supprimé'}</p>
                <p class="text-[11px] text-ink-500">du ${fmtDay(a.from)} ${a.to ? 'au ' + fmtDay(a.to) : '— <b class="text-emerald-600">en cours</b>'}</p>
              </div>
              <span class="text-xs font-bold tabular-nums">${fmtNum(enc)}</span>
            </div>`;
          }).join('') : emptyBlock('Jamais affecté à un pousse')}
        </div>
      </div>
      <div>
        <h4 class="font-bold text-sm mb-2">💰 Derniers versements</h4>
        <div class="rounded-xl border border-ink-200 divide-y divide-ink-100 max-h-64 overflow-y-auto">
          ${pays.slice(0, 40).map(p => {
            const v = Store.vehicles.get(p.vehicleId);
            return `<div class="px-3 py-2 flex items-center justify-between gap-2 text-xs">
              <span class="text-ink-500">${fmtShort(p.date)}</span>
              <span class="text-ink-600 truncate flex-1">${v ? esc(v.code) : '—'}</span>
              <span class="font-bold tabular-nums">${fmtNum(p.amount)}</span>
              <span class="text-[10px] font-black px-1.5 py-0.5 rounded-full ${p.status === 'paye' ? 'bg-emerald-100 text-emerald-700' : p.status === 'partiel' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}">${p.status.toUpperCase()}</span>
            </div>`;
          }).join('') || emptyBlock('Aucun versement')}
        </div>
      </div>
    </div>`;
  $('#modalDetail').showModal();
}

/* ========================================================= MAINTENANCE */
function maintenance() {
  const m = Store.stats.maintenance();
  const all = Store.vehicles.sorted();
  const down = all.filter(v => v.status !== 'service');
  const topCat = Object.entries(m.byCat).sort((a, b) => b[1].count - a[1].count)[0];

  $('#maintKpi').innerHTML =
    kpiCard('Coût total des pannes', money(m.total), `${m.expenses.length} intervention(s)`, 'red') +
    kpiCard('Véhicules indisponibles', `${down.length}/${all.length}`, down.map(v => v.code).join(', ') || 'Flotte complète', down.length ? 'amber' : 'green') +
    kpiCard('Panne la plus fréquente', topCat ? Store.catOf(topCat[0]).icon + ' ' + Store.catOf(topCat[0]).label : '—', topCat ? `${topCat[1].count} fois · ${money(topCat[1].total)}` : 'Aucune', 'slate') +
    kpiCard('Coût moyen / intervention', money(m.expenses.length ? m.total / m.expenses.length : 0), 'Toutes catégories', 'teal');

  const palette = ['#0d9488','#f59e0b','#ef4444','#6366f1','#ec4899','#14b8a6','#64748b'];
  Charts.hbars('catChart', Store.CATEGORIES.map((c, i) => ({
    label: `${c.icon} ${c.label}`,
    value: m.byCat[c.id]?.total || 0,
    color: palette[i % palette.length],
    meta: `${m.byCat[c.id]?.count || 0} intervention(s)`
  })).filter(x => x.value > 0).sort((a, b) => b.value - a.value), { fmt: money });

  Charts.hbars('worstVehicles', all.map(v => ({
    label: v.code,
    value: m.byVehicle[v.id]?.total || 0,
    color: '#ef4444',
    meta: `${m.byVehicle[v.id]?.count || 0} panne(s)`
  })).filter(x => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 8), { fmt: money });

  /* Le filtre pousse est reconstruit à chaque rendu (la flotte peut changer). */
  const vSel = $('#maintVehicleFilter'), cSel = $('#maintCatFilter');
  const keep = vSel.value;
  vSel.innerHTML = `<option value="">Tous les pousses</option>` +
    all.map(v => `<option value="${v.id}" ${v.id === keep ? 'selected' : ''}>${esc(v.code)}</option>`).join('');
  if (!cSel.dataset.ready) {
    cSel.innerHTML = `<option value="">Toutes catégories</option>` +
      Store.CATEGORIES.map(c => `<option value="${c.id}">${c.icon} ${esc(c.label)}</option>`).join('');
    cSel.dataset.ready = '1';
    vSel.addEventListener('change', maintTable);
    cSel.addEventListener('change', maintTable);
  }
  maintTable();
}

function maintTable() {
  const vv = $('#maintVehicleFilter').value, cv = $('#maintCatFilter').value;
  const rows = Store.expenses.all()
    .filter(e => (!vv || e.vehicleId === vv) && (!cv || e.category === cv))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  $('#maintTableBody').innerHTML = rows.length ? rows.map(e => {
    const v = Store.vehicles.get(e.vehicleId), c = Store.catOf(e.category);
    const d = Store.drivers.get(e.driverId);
    return `<tr class="hover:bg-ink-50">
      <td class="px-4 py-2.5 whitespace-nowrap text-ink-500">${fmtShort(e.date)}</td>
      <td class="px-4 py-2.5 whitespace-nowrap">
        <button data-vdetail="${e.vehicleId}" class="font-semibold hover:text-brand-700 hover:underline">${esc(v ? v.code : '—')}</button>
        ${d ? `<p class="text-[10px] text-ink-400">${esc(d.lastName)}</p>` : ''}
      </td>
      <td class="px-4 py-2.5 whitespace-nowrap">${c.icon} ${esc(c.label)}</td>
      <td class="px-4 py-2.5 text-ink-600 max-w-[280px] truncate" title="${esc(e.description)}">${esc(e.description) || '—'}</td>
      <td class="px-4 py-2.5 text-ink-600 whitespace-nowrap">${esc(e.repairer) || '—'}</td>
      <td class="px-4 py-2.5 text-right font-bold text-red-600 tabular-nums whitespace-nowrap">−${fmtNum(e.amount)}</td>
      <td class="px-4 py-2.5 text-right whitespace-nowrap">
        <button data-edit-exp="${e.id}" class="p-1.5 rounded-lg hover:bg-ink-100 text-ink-400">✎</button>
        <button data-del-exp="${e.id}" class="p-1.5 rounded-lg hover:bg-red-50 text-ink-400 hover:text-red-600">✕</button>
      </td>
    </tr>`;
  }).join('') : `<tr><td colspan="7">${emptyBlock('Aucune panne pour ce filtre.')}</td></tr>`;
}

/* ========================================================== HISTORIQUE */
function groupKey(iso, mode) {
  const d = new Date(iso + 'T00:00:00');
  if (mode === 'year')  return { key: iso.slice(0, 4), label: iso.slice(0, 4), short: iso.slice(2, 4) };
  if (mode === 'month') return { key: iso.slice(0, 7), label: d.toLocaleDateString('fr-FR', { month:'long', year:'numeric' }), short: d.toLocaleDateString('fr-FR', { month:'short' }) };
  if (mode === 'week') {
    const t = new Date(d); t.setDate(t.getDate() - ((t.getDay() + 6) % 7));   // lundi
    const k = UI.isoOf(t);
    return { key: k, label: 'Semaine du ' + t.toLocaleDateString('fr-FR', { day:'numeric', month:'short' }), short: 'S' + fmtShort(k).slice(0, 2) };
  }
  return { key: iso, label: d.toLocaleDateString('fr-FR', { weekday:'short', day:'2-digit', month:'short' }), short: fmtShort(iso).slice(0, 2) };
}

function buckets() {
  const map = new Map();
  Store.stats.range(State.histFrom, State.histTo).forEach(x => {
    const g = groupKey(x.date, State.histGroup);
    const b = map.get(g.key) || { ...g, gross: 0, spent: 0, net: 0 };
    b.gross += x.gross; b.spent += x.spent; b.net += x.net;
    map.set(g.key, b);
  });
  return [...map.values()];
}

function history() {
  $('#histFrom').value = State.histFrom;
  $('#histTo').value   = State.histTo;
  $('#histGroup').value = State.histGroup;

  const bk = buckets();
  const gross = bk.reduce((s, b) => s + b.gross, 0);
  const spent = bk.reduce((s, b) => s + b.spent, 0);
  const days  = Store.stats.range(State.histFrom, State.histTo).length;

  $('#histKpi').innerHTML =
    kpiCard('Versements encaissés', money(gross), `${days} jour(s)`, 'green') +
    kpiCard('Dépenses totales', money(spent), gross ? `${Math.round(spent / gross * 100)}% des recettes` : '—', 'red') +
    kpiCard('Recette nette', money(gross - spent), 'Sur la période', gross - spent >= 0 ? 'teal' : 'amber') +
    kpiCard('Moyenne / jour', money(days ? (gross - spent) / days : 0), 'Net journalier', 'slate');

  Charts.bars('histChart', bk.map(b => ({ label: b.label, short: b.short, value: b.net, sub: money(b.net) })), { height: 200 });

  $('#histTableBody').innerHTML = bk.length ? bk.slice().reverse().map(b => `
    <tr class="hover:bg-ink-50">
      <td class="px-4 py-2.5 font-semibold capitalize">${esc(b.label)}</td>
      <td class="px-4 py-2.5 text-right tabular-nums text-emerald-700">${fmtNum(b.gross)}</td>
      <td class="px-4 py-2.5 text-right tabular-nums text-red-600">${b.spent ? '−' + fmtNum(b.spent) : '—'}</td>
      <td class="px-4 py-2.5 text-right tabular-nums font-bold ${b.net >= 0 ? 'text-brand-700' : 'text-red-600'}">${fmtNum(b.net)}</td>
    </tr>`).join('') : `<tr><td colspan="4">${emptyBlock('Aucune donnée')}</td></tr>`;

  /* --- rendement par pousse --- */
  const pv = Store.stats.perVehicle(State.histFrom, State.histTo).sort((a, b) => b.net - a.net);
  $('#histVehicleBody').innerHTML = pv.length ? pv.map(r => `
    <tr class="hover:bg-ink-50 cursor-pointer" data-vdetail="${r.vehicle.id}">
      <td class="px-4 py-2.5">
        <p class="font-bold text-xs">${esc(r.vehicle.code)}</p>
        <p class="text-[11px] text-ink-500">${r.driver ? esc(r.driver.lastName) + ' ' + esc(r.driver.firstName) : 'sans chauffeur'}</p>
      </td>
      <td class="px-4 py-2.5 text-right tabular-nums font-semibold">${fmtNum(r.collected)}</td>
      <td class="px-4 py-2.5 text-right tabular-nums text-red-600">${r.spent ? '−' + fmtNum(r.spent) : '—'}<span class="text-[10px] text-ink-400 ml-1">(${r.breakdowns})</span></td>
      <td class="px-4 py-2.5 text-right tabular-nums font-bold ${r.net >= 0 ? 'text-brand-700' : 'text-red-600'}">${fmtNum(r.net)}</td>
    </tr>`).join('') : `<tr><td colspan="4">${emptyBlock('Aucun cyclopousse')}</td></tr>`;

  /* --- bilan par chauffeur --- */
  const pd = Store.stats.perDriver(State.histFrom, State.histTo).sort((a, b) => b.collected - a.collected);
  $('#histDriverBody').innerHTML = pd.length ? pd.map(r => `
    <tr class="hover:bg-ink-50 cursor-pointer" data-ddetail="${r.driver.id}">
      <td class="px-4 py-2.5">
        <p class="font-bold text-xs">${esc(r.driver.lastName)} ${esc(r.driver.firstName)}</p>
        <p class="text-[11px] text-ink-500">${esc(r.driver.phone) || '—'}</p>
      </td>
      <td class="px-4 py-2.5 text-xs">${r.vehicle ? '🚲 ' + esc(r.vehicle.code) : '<span class="text-amber-700">aucun</span>'}</td>
      <td class="px-4 py-2.5 text-right tabular-nums font-semibold">${fmtNum(r.collected)}</td>
      <td class="px-4 py-2.5 text-center text-xs text-ink-500">${r.workedDays}</td>
      <td class="px-4 py-2.5 text-center"><span class="text-xs font-black ${r.missedDays > 2 ? 'text-red-600' : 'text-ink-500'}">${r.missedDays}</span></td>
      <td class="px-4 py-2.5 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <div class="w-12 h-1.5 rounded-full bg-ink-100 overflow-hidden"><div class="h-full ${r.reliability >= 80 ? 'bg-emerald-500' : r.reliability >= 50 ? 'bg-amber-500' : 'bg-red-500'}" style="width:${r.reliability}%"></div></div>
          <span class="text-xs font-bold tabular-nums w-9 text-right">${r.reliability}%</span>
        </div>
      </td>
    </tr>`).join('') : `<tr><td colspan="6">${emptyBlock('Aucun chauffeur')}</td></tr>`;
}

/* ========================================================== PARAMÈTRES */
function settings() {
  const s = Store.settings();
  const f = $('#settingsForm');
  f.currency.value = s.currency;
  f.dailyTarget.value = s.dailyTarget;
  f.ownerName.value = s.ownerName || '';
  f.strictTarget.checked = !!s.strictTarget;
  if (f.lang) f.lang.value = s.lang || 'fr';

  /* --- État du code PIN --- */
  const u = Store.auth.current();
  const pinBox = $('#pinState');
  const removeBtn = $('#pinRemoveBtn');
  const lockBtn = $('#pinLockNowBtn');
  if (pinBox && u) {
    if (Store.pin.exists(u.email)) {
      pinBox.className = 'mb-3 p-3 rounded-xl text-sm bg-emerald-50 text-emerald-800';
      pinBox.innerHTML = '✅ Code PIN actif. L\'application se rouvrira par un code court à chaque fermeture.';
      removeBtn.classList.remove('hidden');
      lockBtn.classList.remove('hidden');
    } else {
      pinBox.className = 'mb-3 p-3 rounded-xl text-sm bg-ink-100 text-ink-700';
      pinBox.innerHTML = '⚪ Aucun code PIN. Créez-en un pour ouvrir l\'application plus vite.';
      removeBtn.classList.add('hidden');
      lockBtn.classList.add('hidden');
    }
  }
}

return { drivers, driverDetail, maintenance, maintTable, history, buckets, settings };
})());
