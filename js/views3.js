/* =========================================================================
   SIKLOPOSY — Vue Caisse / Coffre
   Le registre de caisse réunit tous les flux d'argent : versements encaissés,
   réparations payées, retraits du propriétaire et apports. Le solde qui en
   ressort est l'argent réellement disponible dans le coffre.
   ========================================================================= */
Object.assign(Views, (() => {

const { $, $$, esc, fmtNum, money, fmtShort, fmtDay, State, emptyBlock, kpiCard } = UI;

function cash() {
  const iso = State.date;
  const b = Store.stats.cashBalance(iso);
  const from = State.histFrom, to = State.histTo;
  const reg = Store.stats.cashLedger(from, to);

  /* --- indicateurs --- */
  $('#cashKpi').innerHTML =
    kpiCard('Solde du coffre', money(b.solde),
            `au ${fmtDay(iso)}`, b.solde >= 0 ? 'teal' : 'red') +
    kpiCard('Encaissé (période)', money(reg.encaisse), 'versements des chauffeurs', 'green') +
    kpiCard('Sorties (période)', money(reg.reparations + reg.retraits),
            `${fmtNum(reg.reparations)} réparations · ${fmtNum(reg.retraits)} retraits`, 'red') +
    kpiCard('Apports (période)', money(reg.apports), 'argent remis au coffre', 'amber');

  /* --- décomposition du solde : d'où vient le chiffre --- */
  const ligne = (libelle, valeur, signe, couleur) => `
    <div class="flex items-center justify-between py-2 border-b border-ink-100 last:border-0">
      <span class="text-sm text-ink-600">${libelle}</span>
      <span class="text-sm font-bold tabular-nums ${couleur}">${signe}${fmtNum(valeur)}</span>
    </div>`;
  $('#cashBreakdown').innerHTML =
    ligne('Versements encaissés', b.encaisse, '+', 'text-emerald-600') +
    ligne('Apports au coffre', b.apports, '+', 'text-emerald-600') +
    ligne('Réparations payées', b.reparations, '−', 'text-red-600') +
    ligne('Retraits effectués', b.retraits, '−', 'text-red-600') +
    `<div class="flex items-center justify-between pt-3 mt-1 border-t-2 border-ink-200">
       <span class="font-bold">Solde disponible</span>
       <span class="text-lg font-extrabold tabular-nums ${b.solde >= 0 ? 'text-brand-700' : 'text-red-600'}">${money(b.solde)}</span>
     </div>
     ${b.solde < 0 ? `<p class="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl p-2">
        ⚠️ Solde négatif : vous avez sorti plus d'argent que le coffre n'en a reçu. Vérifiez vos saisies ou ajoutez un apport.</p>` : ''}`;

  /* --- où part l'argent --- */
  const par = Store.stats.withdrawalsByCategory(from, to);
  const palette = ['#ef4444','#f59e0b','#6366f1','#ec4899','#0d9488','#64748b','#a855f7','#0ea5e9'];
  Charts.hbars('withdrawChart', Object.entries(par).map(([id, v], i) => {
    const c = Store.movCatOf(id);
    return { label: `${c.icon} ${c.label}`, value: v.total,
             color: palette[i % palette.length], meta: `${v.count} retrait(s)` };
  }).sort((a, b2) => b2.value - a.value), { fmt: money });

  /* --- registre --- */
  const genres = { versement:['Versement','bg-emerald-100 text-emerald-700'],
                   reparation:['Réparation','bg-red-100 text-red-700'],
                   retrait:['Retrait','bg-amber-100 text-amber-800'],
                   apport:['Apport','bg-brand-100 text-brand-800'] };
  const filtre = State.cashFilter;
  const lignes = reg.lignes.filter(l => !filtre || l.genre === filtre);

  $('#cashLedgerBody').innerHTML = lignes.length ? lignes.map(l => `
    <tr class="hover:bg-ink-50">
      <td class="px-4 py-2.5 whitespace-nowrap text-ink-500">${fmtShort(l.date)}</td>
      <td class="px-4 py-2.5"><span class="text-[10px] font-black px-2 py-1 rounded-full ${genres[l.genre][1]} whitespace-nowrap">${genres[l.genre][0]}</span></td>
      <td class="px-4 py-2.5"><span class="mr-1">${l.icon}</span>${esc(l.libelle)}</td>
      <td class="px-4 py-2.5 text-ink-500 max-w-[240px] truncate" title="${esc(l.detail)}">${esc(l.detail) || '—'}</td>
      <td class="px-4 py-2.5 text-right font-bold tabular-nums whitespace-nowrap ${l.sens > 0 ? 'text-emerald-600' : 'text-red-600'}">${l.sens > 0 ? '+' : '−'}${fmtNum(l.montant)}</td>
      <td class="px-4 py-2.5 text-right whitespace-nowrap">
        ${l.modifiable ? `<button data-edit-mov="${l.id}" class="p-1.5 rounded-lg hover:bg-ink-100 text-ink-400">✎</button>
                          <button data-delete-mov="${l.id}" class="p-1.5 rounded-lg hover:bg-red-50 text-ink-400 hover:text-red-600">✕</button>`
                       : `<span class="text-[10px] text-ink-300">auto</span>`}
      </td>
    </tr>`).join('') : `<tr><td colspan="6">${emptyBlock('Aucun mouvement sur cette période.')}</td></tr>`;

  $('#cashLedgerFoot').innerHTML = `<tr>
    <td colspan="4" class="px-4 py-3">VARIATION SUR LA PÉRIODE</td>
    <td class="px-4 py-3 text-right tabular-nums ${reg.variation >= 0 ? 'text-emerald-700' : 'text-red-600'}">${reg.variation >= 0 ? '+' : '−'}${fmtNum(Math.abs(reg.variation))}</td>
    <td></td>
  </tr>`;

  $('#cashPeriodLabel').textContent = `du ${fmtDay(from)} au ${fmtDay(to)}`;
  $$('.cash-filter').forEach(b => {
    const on = (b.dataset.cashFilter || '') === (filtre || '');
    b.classList.toggle('bg-white', on);
    b.classList.toggle('shadow', on);
    b.classList.toggle('text-brand-700', on);
  });
}

return { cash };
})());
