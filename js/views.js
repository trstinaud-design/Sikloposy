/* =========================================================================
   SIKLOPOSY — Rendu des vues
   ========================================================================= */
const Views = (() => {

const { $, $$, esc, fmtNum, money, fmtDate, fmtShort, fmtDay, shiftDay, todayISO,
        State, emptyBlock, avatar, vehicleAvatar, vehicleBadge, statusBadge,
        kpiCard, info, phoneLink, paymentFormHTML, expenseFormHTML, syncVehicleHint } = UI;

/* ============================================================ DASHBOARD */
function dashboard() {
  const s = Store.stats.day(State.date);
  const rate = s.expected ? Math.round(s.gross / s.expected * 100) : 0;
  const productifs = s.rows.filter(r => r.active).length;

  const coffre = Store.stats.cashBalance(State.date);
  const mouvementsDuJour = Store.movements.byDate(State.date);

  $('#kpiGrid').innerHTML =
    kpiCard('Versements bruts', money(s.gross), `${s.paid.length}/${productifs} pousses · ${rate}% de l'objectif`, 'green') +
    kpiCard('Dépenses / réparations', money(s.spent), `${s.expenses.length} opération(s)`, 'red') +
    kpiCard('Recette nette du jour', money(s.net), s.net >= 0 ? 'Bénéfice' : 'Perte sur la journée', s.net >= 0 ? 'teal' : 'amber') +
    kpiCard('Reste à encaisser', money(Math.max(0, s.expected - s.gross)), `${s.unpaid.length} versement(s) manquant(s)`, 'slate') +
    /* Le solde du coffre n'est pas la recette : c'est l'argent réellement disponible. */
    kpiCard('💰 Solde du coffre', money(coffre.solde),
            mouvementsDuJour.length ? `${mouvementsDuJour.length} mouvement(s) aujourd'hui` : 'argent disponible',
            coffre.solde >= 0 ? 'teal' : 'red');

  /* --- impayés --- */
  $('#unpaidCount').textContent = s.unpaid.length;
  $('#unpaidList').innerHTML = s.unpaid.length ? s.unpaid.map(r => {
    const d = r.driver, partial = r.status === 'partiel';
    return `<div class="p-3 flex items-center gap-3 hover:bg-ink-50">
      ${vehicleAvatar(r.vehicle, 'w-10 h-10')}
      <div class="min-w-0 flex-1">
        <p class="font-bold text-sm truncate">${esc(r.vehicle.code)}</p>
        <p class="text-xs text-ink-500 truncate">${d ? esc(d.lastName) + ' ' + esc(d.firstName) : 'sans chauffeur'} · attendu ${money(r.target)}${partial ? ` · reçu ${money(r.amount)}` : ''}</p>
      </div>
      <span class="text-[10px] font-black px-2 py-1 rounded-full ${partial ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'} shrink-0">${partial ? 'PARTIEL' : 'NON VERSÉ'}</span>
      ${phoneLink(d, 'shrink-0 w-9 h-9 rounded-xl bg-emerald-600 text-white grid place-items-center hover:bg-emerald-700')}
      <button data-pay="${r.vehicle.id}" class="shrink-0 px-3 py-2 rounded-xl bg-brand-700 text-white text-xs font-bold hover:bg-brand-800">Encaisser</button>
    </div>`;
  }).join('') : emptyBlock('🎉 Tous les versements du jour sont encaissés !');

  /* --- encaissés --- */
  $('#paidCount').textContent = s.paid.length;
  $('#paidList').innerHTML = s.paid.length ? s.paid.map(r => `
    <div class="p-3 flex items-center gap-3 hover:bg-ink-50">
      ${vehicleAvatar(r.vehicle, 'w-10 h-10')}
      <div class="min-w-0 flex-1">
        <p class="font-bold text-sm truncate">${esc(r.vehicle.code)}</p>
        <p class="text-xs text-ink-500 truncate">${r.driver ? esc(r.driver.lastName) + ' ' + esc(r.driver.firstName) : '—'}${r.gap > 0 ? ` · <span class="text-emerald-600 font-bold">+${fmtNum(r.gap)}</span>` : ''}</p>
      </div>
      <span class="font-bold text-sm tabular-nums text-emerald-700">${money(r.amount)}</span>
      <button data-pay="${r.vehicle.id}" class="shrink-0 p-2 rounded-lg hover:bg-ink-100 text-ink-400" title="Modifier">✎</button>
    </div>`).join('') : emptyBlock('Aucun versement enregistré pour cette date.');

  /* --- pousses improductifs --- */
  $('#idleCount').textContent = s.idle.length;
  $('#idleList').innerHTML = s.idle.length ? s.idle.map(r => `
    <div class="p-3 flex items-center gap-3 hover:bg-ink-50 cursor-pointer" data-vdetail="${r.vehicle.id}">
      ${vehicleAvatar(r.vehicle, 'w-9 h-9')}
      <div class="min-w-0 flex-1">
        <p class="font-bold text-xs truncate">${esc(r.vehicle.code)}</p>
        <p class="text-[11px] text-ink-500 truncate">${esc(r.reason)}</p>
      </div>
      ${r.reason === 'Aucun chauffeur affecté'
        ? `<button data-assign="${r.vehicle.id}" class="text-[10px] font-black px-2 py-1 rounded-full bg-brand-100 text-brand-800 shrink-0">AFFECTER</button>`
        : vehicleBadge(r.vehicle.status)}
    </div>`).join('') : emptyBlock('Toute la flotte est productive ✅');

  /* --- dépenses du jour --- */
  $('#expenseTodayList').innerHTML = s.expenses.length ? s.expenses.map(e => {
    const c = Store.catOf(e.category), v = Store.vehicles.get(e.vehicleId);
    return `<div class="p-3 flex items-start gap-3 hover:bg-ink-50">
      <span class="text-lg leading-none mt-0.5">${c.icon}</span>
      <div class="min-w-0 flex-1">
        <p class="font-bold text-xs">${esc(c.label)}</p>
        <p class="text-[11px] text-ink-500 truncate">${esc(v ? v.code : 'pousse supprimé')}${e.repairer ? ' · ' + esc(e.repairer) : ''}</p>
      </div>
      <span class="font-bold text-xs text-red-600 tabular-nums shrink-0">−${fmtNum(e.amount)}</span>
      <button data-del-exp="${e.id}" class="text-ink-300 hover:text-red-600 shrink-0">✕</button>
    </div>`;
  }).join('') : emptyBlock('Aucune dépense — bonne journée !');

  const serie = Store.stats.range(shiftDay(State.date, -6), State.date);
  Charts.bars('sparkChart', serie.map(x => ({
    label: fmtShort(x.date), short: fmtShort(x.date).slice(0, 2), value: x.net, sub: money(x.net)
  })), { height: 130 });
}

/* =============================================================== SAISIE */
function saisie() {
  $('#paymentFormInline').innerHTML = paymentFormHTML();
  $('#expenseFormInline').innerHTML = expenseFormHTML();
  syncVehicleHint($('#paymentFormInline'));

  const s = Store.stats.day(State.date);
  $('#dayTableBody').innerHTML = s.rows.length ? s.rows.map(r => `
    <tr class="hover:bg-ink-50 ${r.status === 'inactif' ? 'opacity-60' : ''}">
      <td class="px-4 py-2.5">
        <div class="flex items-center gap-2.5">
          ${vehicleAvatar(r.vehicle, 'w-8 h-8')}
          <button data-vdetail="${r.vehicle.id}" class="font-bold text-xs hover:text-brand-700 hover:underline">${esc(r.vehicle.code)}</button>
        </div>
      </td>
      <td class="px-4 py-2.5">
        ${r.driver
          ? `<div class="flex items-center gap-2">${avatar(r.driver, 'w-7 h-7')}
               <span class="text-xs truncate">${esc(r.driver.lastName)} ${esc(r.driver.firstName)}</span></div>`
          : `<button data-assign="${r.vehicle.id}" class="text-xs font-bold text-brand-700 hover:underline">+ Affecter</button>`}
      </td>
      <td class="px-4 py-2.5 text-right tabular-nums text-ink-500">${fmtNum(r.target)}</td>
      <td class="px-4 py-2.5 text-right tabular-nums font-bold">${r.payment ? fmtNum(r.amount) : '—'}</td>
      <td class="px-4 py-2.5 text-right tabular-nums font-semibold ${r.gap < 0 ? 'text-red-600' : 'text-emerald-600'}">${r.payment ? (r.gap > 0 ? '+' : '') + fmtNum(r.gap) : '—'}</td>
      <td class="px-4 py-2.5 text-right tabular-nums ${r.expense ? 'text-red-600 font-semibold' : 'text-ink-300'}">${r.expense ? '−' + fmtNum(r.expense) : '—'}</td>
      <td class="px-4 py-2.5 text-center">${statusBadge(r.status)}${r.status === 'inactif' ? `<p class="text-[10px] text-ink-400 mt-0.5">${esc(r.reason)}</p>` : ''}</td>
      <td class="px-4 py-2.5 text-right whitespace-nowrap">
        <button data-pay="${r.vehicle.id}" class="px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-bold hover:bg-brand-100">Versement</button>
        <button data-exp="${r.vehicle.id}" class="px-2.5 py-1.5 rounded-lg bg-ink-100 text-ink-600 text-xs font-bold hover:bg-ink-200">Dépense</button>
      </td>
    </tr>`).join('')
    : `<tr><td colspan="8">${emptyBlock('Aucun cyclopousse enregistré. Commencez par créer votre flotte dans l\'onglet Cyclopousses.')}</td></tr>`;

  $('#dayTableFoot').innerHTML = `<tr>
    <td colspan="2" class="px-4 py-3">TOTAL</td>
    <td class="px-4 py-3 text-right tabular-nums">${fmtNum(s.expected)}</td>
    <td class="px-4 py-3 text-right tabular-nums text-emerald-700">${fmtNum(s.gross)}</td>
    <td class="px-4 py-3 text-right tabular-nums ${s.gross - s.expected < 0 ? 'text-red-600' : 'text-emerald-600'}">${fmtNum(s.gross - s.expected)}</td>
    <td class="px-4 py-3 text-right tabular-nums text-red-600">−${fmtNum(s.spent)}</td>
    <td colspan="2" class="px-4 py-3 text-right">Net : <span class="${s.net >= 0 ? 'text-brand-700' : 'text-red-600'}">${money(s.net)}</span></td>
  </tr>`;
}

/* ========================================================= CYCLOPOUSSES */
function fleet() {
  const all = Store.vehicles.sorted();
  const day = Store.stats.day(State.date);
  const enPanne = all.filter(v => v.status !== 'service');
  const libres = all.filter(v => !Store.assignments.driverOn(v.id, State.date));
  const m = Store.stats.maintenance();

  $('#fleetKpi').innerHTML =
    kpiCard('Cyclopousses', all.length, `${all.length - enPanne.length} en service`, 'teal') +
    kpiCard('En panne / immobilisés', enPanne.length, enPanne.map(v => v.code).join(', ') || 'Aucun', enPanne.length ? 'amber' : 'green') +
    kpiCard('Sans chauffeur', libres.length, libres.map(v => v.code).join(', ') || 'Tous affectés', libres.length ? 'red' : 'green') +
    kpiCard('Coût total des pannes', money(m.total), `${m.expenses.length} intervention(s)`, 'slate');

  const q = State.vehicleQuery.toLowerCase();
  const f = State.vehicleFilter;
  const list = all.filter(v => {
    const d = Store.assignments.driverOn(v.id, State.date);
    const hay = `${v.code} ${d ? d.lastName + ' ' + d.firstName : ''}`.toLowerCase();
    if (q && !hay.includes(q)) return false;
    if (f === 'libre') return !d;
    if (f) return v.status === f;
    return true;
  });

  $('#vehicleGrid').innerHTML = list.length ? list.map(v => {
    const d = Store.assignments.driverOn(v.id, State.date);
    const row = day.rows.find(r => r.vehicle.id === v.id);
    const exps = Store.expenses.byVehicle(v.id);
    const cost = exps.reduce((s, e) => s + e.amount, 0);
    const earned = Store.payments.byVehicle(v.id).reduce((s, p) => s + p.amount, 0);
    return `<div class="bg-white rounded-2xl border border-ink-200 overflow-hidden hover:shadow-lg transition cursor-pointer" data-vdetail="${v.id}">
      <div class="p-4 flex items-start gap-3">
        ${vehicleAvatar(v, 'w-14 h-14')}
        <div class="min-w-0 flex-1">
          <p class="font-bold truncate">${esc(v.code)}</p>
          <p class="text-xs text-ink-500 truncate">Objectif ${money(Store.vehicles.target(v))} / jour</p>
          <div class="mt-2">${vehicleBadge(v.status)}</div>
        </div>
      </div>
      <div class="px-4 pb-3">
        <div class="flex items-center gap-2 p-2 rounded-xl ${d ? 'bg-ink-50' : 'bg-amber-50 border border-amber-200'}">
          ${avatar(d, 'w-8 h-8')}
          <div class="min-w-0 flex-1">
            ${d ? `<p class="text-xs font-bold truncate">${esc(d.lastName)} ${esc(d.firstName)}</p>
                   <p class="text-[10px] text-ink-500 truncate">${esc(d.phone) || 'pas de téléphone'}</p>`
                : `<p class="text-xs font-bold text-amber-800">Aucun chauffeur</p>
                   <p class="text-[10px] text-amber-700">Ce pousse ne rapporte rien</p>`}
          </div>
          <button data-assign="${v.id}" class="shrink-0 px-2.5 py-1.5 rounded-lg bg-brand-700 text-white text-[10px] font-black hover:bg-brand-800">${d ? 'CHANGER' : 'AFFECTER'}</button>
        </div>
      </div>
      <div class="px-4 pb-3 grid grid-cols-3 gap-2 text-center">
        <div class="bg-ink-50 rounded-xl py-2">
          <p class="text-[10px] text-ink-500 font-bold">AUJOURD'HUI</p>
          <p class="text-xs font-black ${row && row.status === 'paye' ? 'text-emerald-600' : 'text-red-600'}">${row && row.payment ? fmtNum(row.amount) : 'Rien'}</p>
        </div>
        <div class="bg-ink-50 rounded-xl py-2">
          <p class="text-[10px] text-ink-500 font-bold">PANNES</p>
          <p class="text-xs font-black">${exps.length}</p>
        </div>
        <div class="bg-ink-50 rounded-xl py-2">
          <p class="text-[10px] text-ink-500 font-bold">NET CUMULÉ</p>
          <p class="text-xs font-black ${earned - cost >= 0 ? 'text-brand-700' : 'text-red-600'}">${Charts.nice(earned - cost)}</p>
        </div>
      </div>
      <div class="px-4 pb-4 flex gap-2">
        <button data-vdetail="${v.id}" class="flex-1 py-2 rounded-xl bg-ink-100 text-ink-700 text-xs font-bold hover:bg-ink-200">Fiche complète</button>
        <button data-vedit="${v.id}" class="flex-1 py-2 rounded-xl bg-brand-50 text-brand-700 text-xs font-bold hover:bg-brand-100">Modifier</button>
      </div>
    </div>`;
  }).join('') : `<div class="sm:col-span-2 xl:col-span-3 bg-white rounded-2xl border border-dashed border-ink-300 p-10 text-center">
      <p class="text-4xl mb-2">🚲</p>
      <p class="font-bold mb-1">Aucun cyclopousse</p>
      <p class="text-xs text-ink-500 mb-4">Créez vos 10 pousses ici, puis affectez-leur un chauffeur.</p>
      <button data-open="vehicle" class="px-4 py-2.5 rounded-xl bg-brand-700 text-white text-sm font-bold">+ Nouveau cyclopousse</button>
    </div>`;
}

/* ---- fiche détaillée d'un cyclopousse ---- */
function vehicleDetail(id) {
  const v = Store.vehicles.get(id);
  if (!v) return;
  const driver = Store.assignments.driverOn(v.id, State.date);
  const hist   = Store.assignments.forVehicle(v.id);
  const pays   = Store.payments.byVehicle(v.id).sort((a, b) => b.date.localeCompare(a.date));
  const exps   = Store.expenses.byVehicle(v.id).sort((a, b) => b.date.localeCompare(a.date));
  const earned = pays.reduce((s, p) => s + p.amount, 0);
  const cost   = exps.reduce((s, e) => s + e.amount, 0);

  const catCount = {};
  exps.forEach(e => catCount[e.category] = (catCount[e.category] || 0) + 1);
  const topCat = Object.entries(catCount).sort((a, b) => b[1] - a[1])[0];

  $('#detailTitle').textContent = `🚲 ${v.code}`;
  $('#detailBody').innerHTML = `
    <div class="flex flex-wrap items-start gap-4 mb-5">
      ${vehicleAvatar(v, 'w-24 h-24')}
      <div class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm flex-1 min-w-[240px]">
        ${info('État', vehicleBadge(v.status))}
        ${info('Objectif / jour', money(Store.vehicles.target(v)))}
        ${info('Acquis le', fmtDay(v.acquiredAt))}
        ${info('Chauffeur actuel', driver ? `${esc(driver.lastName)} ${esc(driver.firstName)}` : '<span class="text-amber-700">Aucun</span>')}
      </div>
      <div class="flex flex-col gap-2">
        <button data-assign="${v.id}" class="px-4 py-2.5 rounded-xl bg-brand-700 text-white text-xs font-bold hover:bg-brand-800">${driver ? '🔄 Changer de chauffeur' : '➕ Affecter un chauffeur'}</button>
        <button data-vedit="${v.id}" class="px-4 py-2.5 rounded-xl border border-ink-300 text-xs font-bold hover:bg-ink-50">✎ Modifier la fiche</button>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      ${kpiCard('Total encaissé', money(earned), `${pays.length} versement(s)`, 'green')}
      ${kpiCard('Coût des pannes', money(cost), `${exps.length} intervention(s)`, 'red')}
      ${kpiCard('Rendement net', money(earned - cost), earned - cost >= 0 ? 'Rentable' : 'À surveiller', earned - cost >= 0 ? 'teal' : 'amber')}
      ${kpiCard('Panne la + fréquente', topCat ? Store.catOf(topCat[0]).icon + ' ' + Store.catOf(topCat[0]).label.split(' ')[0] : '—', topCat ? topCat[1] + ' fois' : 'Aucune panne', 'slate')}
    </div>

    ${v.note ? `<div class="mb-5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm">📝 ${esc(v.note)}</div>` : ''}

    <h4 class="font-bold text-sm mb-2">👥 Historique des chauffeurs</h4>
    <div class="rounded-xl border border-ink-200 divide-y divide-ink-100 mb-5">
      ${hist.length ? hist.map(a => {
        const d = Store.drivers.get(a.driverId);
        const encaisse = Store.payments.byVehicle(v.id)
          .filter(p => p.date >= a.from && (!a.to || p.date <= a.to))
          .reduce((s, p) => s + p.amount, 0);
        return `<div class="px-3 py-2.5 flex items-center gap-3">
          ${avatar(d, 'w-8 h-8')}
          <div class="min-w-0 flex-1">
            <p class="text-xs font-bold truncate">${d ? esc(d.lastName) + ' ' + esc(d.firstName) : 'Chauffeur supprimé'}</p>
            <p class="text-[11px] text-ink-500">du ${fmtDay(a.from)} ${a.to ? 'au ' + fmtDay(a.to) : '— <b class="text-emerald-600">en cours</b>'}</p>
          </div>
          <span class="text-xs font-bold tabular-nums shrink-0">${fmtNum(encaisse)}</span>
          ${phoneLink(d, 'shrink-0 w-8 h-8 rounded-lg bg-emerald-600 text-white grid place-items-center')}
        </div>`;
      }).join('') : emptyBlock('Ce pousse n\'a jamais été affecté.')}
    </div>

    <div class="grid lg:grid-cols-2 gap-4">
      <div>
        <h4 class="font-bold text-sm mb-2">🔧 Historique des pannes</h4>
        <div class="rounded-xl border border-ink-200 divide-y divide-ink-100 max-h-64 overflow-y-auto">
          ${exps.slice(0, 40).map(e => {
            const d = Store.drivers.get(e.driverId);
            return `<div class="px-3 py-2 text-xs">
              <div class="flex items-center justify-between gap-2">
                <span class="font-bold">${Store.catOf(e.category).icon} ${esc(Store.catOf(e.category).label)}</span>
                <span class="font-bold text-red-600 tabular-nums shrink-0">−${fmtNum(e.amount)}</span>
              </div>
              <p class="text-ink-500 mt-0.5">${fmtShort(e.date)}${e.repairer ? ' · ' + esc(e.repairer) : ''}${d ? ' · conduit par ' + esc(d.lastName) : ''}</p>
              ${e.description ? `<p class="text-ink-400 mt-0.5">${esc(e.description)}</p>` : ''}
            </div>`;
          }).join('') || emptyBlock('Aucune panne 🎉')}
        </div>
      </div>
      <div>
        <h4 class="font-bold text-sm mb-2">💰 Derniers versements</h4>
        <div class="rounded-xl border border-ink-200 divide-y divide-ink-100 max-h-64 overflow-y-auto">
          ${pays.slice(0, 40).map(p => {
            const d = Store.drivers.get(p.driverId);
            return `<div class="px-3 py-2 flex items-center justify-between gap-2 text-xs">
              <span class="text-ink-500">${fmtShort(p.date)}</span>
              <span class="text-ink-600 truncate flex-1">${d ? esc(d.lastName) : '—'}</span>
              <span class="font-bold tabular-nums">${fmtNum(p.amount)}</span>
              <span class="text-[10px] font-black px-1.5 py-0.5 rounded-full ${p.status === 'paye' ? 'bg-emerald-100 text-emerald-700' : p.status === 'partiel' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}">${p.status.toUpperCase()}</span>
            </div>`;
          }).join('') || emptyBlock('Aucun versement')}
        </div>
      </div>
    </div>`;
  $('#modalDetail').showModal();
}

return { dashboard, saisie, fleet, vehicleDetail };
})();
