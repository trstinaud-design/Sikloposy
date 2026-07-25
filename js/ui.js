/* =========================================================================
   SIKLOPOSY — Briques d'interface partagées
   Helpers, état de navigation, gabarits de formulaires.
   ========================================================================= */
const UI = (() => {

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Dates en heure locale : toISOString() décalerait d'un jour hors UTC. */
const isoOf = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayISO = () => isoOf(new Date());
const shiftDay = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return isoOf(d); };

const fmtNum   = n => new Intl.NumberFormat('fr-FR').format(Math.round(n || 0));
const money    = n => `${fmtNum(n)} ${Store.settings().currency || 'Ar'}`;
const fmtDate  = iso => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
const fmtShort = iso => new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit' });
const fmtDay   = iso => iso ? new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR') : '—';

/* ---------------------------------------------------------------- état */
const State = {
  view: 'dashboard',
  date: todayISO(),
  histFrom: shiftDay(todayISO(), -6),
  histTo: todayISO(),
  histGroup: 'day',
  vehicleQuery: '', vehicleFilter: '',
  driverQuery: '',  driverFilter: ''
};

const NAV = [
  { id:'dashboard',  label:'Tableau de bord', short:'Bilan',    icon:'M3 13h4v8H3zM10 3h4v18h-4zM17 9h4v12h-4z' },
  { id:'saisie',     label:'Saisie du jour',  short:'Saisie',   icon:'M12 4.5v15m7.5-7.5h-15' },
  { id:'pousses',    label:'Cyclopousses',    short:'Pousses',  icon:'M5 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm14 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM5 15l4-7h6l3 7M9 8l1.5 7M14 6h3' },
  { id:'chauffeurs', label:'Chauffeurs',      short:'Équipe',   icon:'M15 19.1a6 6 0 0 0-12 0M12 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm9 12a6 6 0 0 0-4.5-5.8M16.5 7a3 3 0 1 1 0 6' },
  { id:'caisse',     label:'Caisse / Coffre', short:'Caisse',   icon:'M3 8.25A2.25 2.25 0 0 1 5.25 6h13.5A2.25 2.25 0 0 1 21 8.25v7.5A2.25 2.25 0 0 1 18.75 18H5.25A2.25 2.25 0 0 1 3 15.75zM3 10.5h18M7 14.5h3' },
  { id:'maintenance',label:'Maintenance',     short:'Pannes',   icon:'M11.4 15.2 6.6 20a2.1 2.1 0 0 1-3-3l4.8-4.8m3 3a5 5 0 0 0 6.6-6.3l-2.6 2.6-2.8-.8-.8-2.8 2.6-2.6a5 5 0 0 0-6.3 6.6' },
  { id:'historique', label:'Historique',      short:'Stats',    icon:'M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' }
];

const NAV_SIDE = [
  ...NAV,
  { id:'parametres', label:'Paramètres',      short:'Réglages', icon:'M10.3 4.3a1.7 1.7 0 0 1 3.4 0l.2 1a7.5 7.5 0 0 1 1.8 1l1-.4a1.7 1.7 0 0 1 2 2.4l-.5.9c.2.6.4 1.2.4 1.8s-.2 1.2-.4 1.8l.5.9a1.7 1.7 0 0 1-2 2.4l-1-.4a7.5 7.5 0 0 1-1.8 1l-.2 1a1.7 1.7 0 0 1-3.4 0l-.2-1a7.5 7.5 0 0 1-1.8-1l-1 .4a1.7 1.7 0 0 1-2-2.4l.5-.9A6 6 0 0 1 5.4 12c0-.6.2-1.2.4-1.8l-.5-.9a1.7 1.7 0 0 1 2-2.4l1 .4c.5-.4 1.1-.8 1.8-1zM14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z' }
];

/* --------------------------------------------------------------- toasts */
function toast(msg, kind = 'ok') {
  const tone = { ok:'bg-ink-900', warn:'bg-amber-600', err:'bg-red-600' }[kind] || 'bg-ink-900';
  const n = document.createElement('div');
  n.className = `${tone} text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-2xl pointer-events-auto opacity-0 translate-y-2 transition-all duration-200`;
  n.textContent = msg;
  $('#toastHost').appendChild(n);
  requestAnimationFrame(() => n.classList.remove('opacity-0','translate-y-2'));
  setTimeout(() => { n.classList.add('opacity-0','translate-y-2'); setTimeout(() => n.remove(), 220); }, 2800);
}

function confirmAction(title, msg, onOk) {
  $('#confirmTitle').textContent = title;
  $('#confirmMsg').textContent = msg;
  const dlg = $('#modalConfirm');
  const ok = $('#confirmOk');
  const clone = ok.cloneNode(true);          // purge les écouteurs précédents
  ok.replaceWith(clone);
  clone.addEventListener('click', () => { dlg.close(); onOk(); });
  dlg.showModal();
}

/* ------------------------------------------------------- petits rendus */
const emptyBlock = txt => `<div class="p-6 text-center text-xs text-ink-400">${txt}</div>`;

function avatar(d, size = 'w-10 h-10') {
  if (!d) return `<div class="${size} rounded-xl bg-ink-100 text-ink-400 grid place-items-center text-lg shrink-0">👤</div>`;
  const initials = ((d.lastName || '?')[0] + ((d.firstName || '')[0] || '')).toUpperCase();
  return d.photo
    ? `<img src="${esc(d.photo)}" class="${size} rounded-xl object-cover shrink-0 bg-ink-100" alt="">`
    : `<div class="${size} rounded-xl bg-brand-100 text-brand-800 grid place-items-center font-black text-xs shrink-0">${esc(initials)}</div>`;
}

function vehicleAvatar(v, size = 'w-12 h-12') {
  if (v && v.photo) return `<img src="${esc(v.photo)}" class="${size} rounded-xl object-cover shrink-0 bg-ink-100" alt="">`;
  const tone = { service:'bg-brand-100 text-brand-800', reparation:'bg-amber-100 text-amber-800', immobilise:'bg-red-100 text-red-700' }[v?.status] || 'bg-ink-100';
  const num = (v?.code || '').match(/\d+/);
  return `<div class="${size} rounded-xl ${tone} grid place-items-center font-black shrink-0 leading-none">
            <span class="text-[10px] opacity-60">🚲</span><span class="text-xs">${esc(num ? num[0] : '—')}</span>
          </div>`;
}

function vehicleBadge(status) {
  const m = { service:['🟢 En service','bg-emerald-100 text-emerald-700'],
              reparation:['🟠 Réparation','bg-amber-100 text-amber-700'],
              immobilise:['🔴 Immobilisé','bg-red-100 text-red-700'] }[status] || ['—','bg-ink-100 text-ink-600'];
  return `<span class="text-[10px] font-black px-2 py-1 rounded-full ${m[1]} whitespace-nowrap shrink-0">${m[0]}</span>`;
}

function statusBadge(status) {
  const m = { paye:['✅ Payé','bg-emerald-100 text-emerald-700'],
              partiel:['🟡 Partiel','bg-amber-100 text-amber-700'],
              attente:['🔴 En attente','bg-red-100 text-red-700'],
              inactif:['⏸️ Improductif','bg-ink-200 text-ink-600'] }[status];
  return `<span class="text-[10px] font-black px-2 py-1 rounded-full ${m[1]} whitespace-nowrap">${m[0]}</span>`;
}

function kpiCard(label, value, sub, tone) {
  const tones = { green:'from-emerald-500 to-emerald-600', red:'from-red-500 to-red-600',
                  teal:'from-brand-600 to-brand-800', slate:'from-ink-600 to-ink-800',
                  amber:'from-amber-500 to-amber-600' };
  return `<div class="rounded-2xl p-4 bg-gradient-to-br ${tones[tone] || tones.slate} text-white shadow-lg">
    <p class="text-[11px] font-bold uppercase tracking-wide opacity-75">${label}</p>
    <p class="text-xl lg:text-2xl font-extrabold mt-1 tabular-nums leading-tight">${value}</p>
    <p class="text-[11px] opacity-80 mt-0.5">${sub}</p>
  </div>`;
}

const info = (k, v) => `<div><p class="text-[11px] font-bold text-ink-400 uppercase">${k}</p><p class="font-semibold">${v}</p></div>`;

const phoneLink = (d, cls) => d && d.phone
  ? `<a href="tel:${esc(d.phone.replace(/\s/g,''))}" class="${cls}" title="Appeler ${esc(d.phone)}">
       <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.2.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .8-.2 1l-2.3 2.2Z"/></svg>
     </a>` : '';

/* ---------------------------------------------------------- formulaires */
const INPUT = 'w-full px-3.5 py-2.5 rounded-xl border border-ink-300 text-sm bg-white';
const field = (label, inner, cls = '') =>
  `<div class="${cls}"><label class="block text-xs font-semibold text-ink-600 mb-1.5">${label}</label>${inner}</div>`;

function vehicleOptions(selected, date = State.date) {
  return Store.vehicles.sorted().map(v => {
    const d = Store.assignments.driverOn(v.id, date);
    const who = d ? `${d.lastName} ${d.firstName}` : 'sans chauffeur';
    return `<option value="${v.id}" ${v.id === selected ? 'selected' : ''}>${esc(v.code)} · ${esc(who)}</option>`;
  }).join('');
}

function driverOptions(selected, { onlyFree = false, includeId = null } = {}) {
  const free = Store.drivers.unassigned(State.date);
  const list = onlyFree
    ? Store.drivers.sorted().filter(d => free.some(f => f.id === d.id) || d.id === includeId)
    : Store.drivers.sorted();
  return list.map(d => {
    const v = Store.assignments.vehicleOn(d.id, State.date);
    const suffix = v && d.id !== includeId ? ` (conduit ${v.code})` : '';
    return `<option value="${d.id}" ${d.id === selected ? 'selected' : ''}>${esc(d.lastName)} ${esc(d.firstName)}${esc(suffix)}</option>`;
  }).join('');
}

/* ---- versement (rattaché au POUSSE) ---- */
function paymentFormHTML(pre = {}) {
  const statuses = [['paye','✅ Payé'], ['partiel','🟡 Partiel'], ['attente','🔴 En attente']];
  return `
    ${field('Cyclopousse', `<select name="vehicleId" required class="${INPUT}"><option value="">— Sélectionner —</option>${vehicleOptions(pre.vehicleId)}</select>`)}
    <div class="px-3 py-2 rounded-xl bg-ink-50 text-xs flex items-center gap-2 flex-wrap">
      <span class="text-ink-500">Chauffeur :</span> <b data-driver-hint class="text-ink-800">—</b>
      <span class="text-ink-300">|</span>
      <span class="text-ink-500">Attendu :</span> <b data-target-hint class="text-ink-800">—</b>
      <button type="button" data-fill-target class="ml-auto px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-bold hover:bg-brand-100">Remplir</button>
    </div>
    <div class="grid grid-cols-2 gap-3">
      ${field('Date', `<input type="date" name="date" required value="${pre.date || State.date}" class="${INPUT}">`)}
      ${field('Montant versé', `<input type="number" name="amount" min="0" step="100" required value="${pre.amount ?? ''}" placeholder="0" class="${INPUT} font-bold text-right">`)}
    </div>
    <div>
      <label class="block text-xs font-semibold text-ink-600 mb-1.5">Statut du versement</label>
      <div class="grid grid-cols-3 gap-2">
        ${statuses.map(([v, l]) => `<label class="cursor-pointer">
          <input type="radio" name="status" value="${v}" ${(pre.status || 'paye') === v ? 'checked' : ''} class="peer sr-only">
          <span class="block text-center py-2 rounded-xl border border-ink-300 text-xs font-bold peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-800">${l}</span>
        </label>`).join('')}
      </div>
    </div>
    ${field('Note (facultatif)', `<input name="note" value="${esc(pre.note || '')}" placeholder="Ex : reste 2 000 Ar demain" class="${INPUT}">`)}
    <input type="hidden" name="id" value="${pre.id || ''}">
    <button class="w-full py-3 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm shadow-lg shadow-brand-700/20">Enregistrer le versement</button>`;
}

/* ---- dépense / panne (rattachée au POUSSE) ---- */
function expenseFormHTML(pre = {}) {
  return `
    ${field('Cyclopousse concerné', `<select name="vehicleId" required class="${INPUT}"><option value="">— Sélectionner —</option>${vehicleOptions(pre.vehicleId)}</select>`)}
    <div class="grid grid-cols-2 gap-3">
      ${field('Date', `<input type="date" name="date" required value="${pre.date || State.date}" class="${INPUT}">`)}
      ${field('Montant', `<input type="number" name="amount" min="0" step="100" required value="${pre.amount ?? ''}" placeholder="0" class="${INPUT} font-bold text-right">`)}
    </div>
    ${field('Type de panne / dépense', `<select name="category" required class="${INPUT}">
      ${Store.CATEGORIES.map(c => `<option value="${c.id}" ${pre.category === c.id ? 'selected' : ''}>${c.icon}  ${esc(c.label)} (${esc(c.hint)})</option>`).join('')}
    </select>`)}
    ${field('Description de la panne', `<textarea name="description" rows="2" placeholder="Ex : chambre à air arrière percée" class="${INPUT}">${esc(pre.description || '')}</textarea>`)}
    ${field('Nom du réparateur', `<input name="repairer" value="${esc(pre.repairer || '')}" placeholder="Ex : Atelier Rasoa" class="${INPUT}">`)}
    <label class="flex items-center gap-2 text-sm text-ink-700 cursor-pointer">
      <input type="checkbox" name="immobilize" class="rounded border-ink-300 text-brand-700">
      Passer ce cyclopousse en <b>« En réparation »</b>
    </label>
    <input type="hidden" name="id" value="${pre.id || ''}">
    <button class="w-full py-3 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm shadow-lg shadow-brand-700/20">Enregistrer la dépense</button>`;
}

/* ---- fiche cyclopousse ---- */
function vehicleFormHTML(v = {}) {
  return `
    <div class="flex items-center gap-4">
      <div class="w-20 h-20 rounded-2xl bg-ink-100 overflow-hidden shrink-0 grid place-items-center text-3xl" data-photo-preview>
        ${v.photo ? `<img src="${esc(v.photo)}" class="w-full h-full object-cover">` : '🚲'}
      </div>
      <div class="flex-1 space-y-2">
        <label class="inline-block px-3 py-2 rounded-xl border border-ink-300 text-xs font-bold cursor-pointer hover:bg-ink-50">
          📷 Photo du pousse
          <input type="file" accept="image/*" data-photo-input class="hidden">
        </label>
        <input name="photo" value="${esc(v.photo || '')}" placeholder="…ou coller un lien https://" class="${INPUT} text-xs">
      </div>
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      ${field('Numéro / identifiant *', `<input name="code" required value="${esc(v.code || (v.id ? '' : Store.vehicles.prochainCode()))}" placeholder="Cyclo #01" class="${INPUT}">`)}
      ${field('État du véhicule', `<select name="status" class="${INPUT}">
        <option value="service" ${!v.status || v.status === 'service' ? 'selected' : ''}>🟢 En service</option>
        <option value="reparation" ${v.status === 'reparation' ? 'selected' : ''}>🟠 En réparation</option>
        <option value="immobilise" ${v.status === 'immobilise' ? 'selected' : ''}>🔴 Immobilisé</option>
      </select>`)}
      ${field('Versement attendu / jour', `<input name="dailyTarget" type="number" min="0" step="100" value="${v.dailyTarget ?? ''}" placeholder="défaut : ${fmtNum(Store.settings().dailyTarget)}" class="${INPUT}">`)}
      ${field('Date d\'acquisition', `<input name="acquiredAt" type="date" value="${esc(v.acquiredAt || '')}" class="${INPUT}">`)}
    </div>
    ${!v.id ? field('Chauffeur à affecter (facultatif)',
        `<select name="assignDriverId" class="${INPUT}" data-driver-select>
           <option value="">— Aucun pour l'instant —</option>
           ${driverOptions(v.assignDriverId, { onlyFree: true })}
           <option value="__nouveau">➕ Créer un nouveau chauffeur…</option>
         </select>
         <p class="mt-1 text-[11px] text-ink-500">Choisissez « Créer un nouveau chauffeur » pour saisir ses informations sans quitter cette page.</p>`) : ''}
    ${field('Note interne', `<textarea name="note" rows="2" placeholder="Ex : cadre renforcé en 2024" class="${INPUT}">${esc(v.note || '')}</textarea>`)}
    <input type="hidden" name="id" value="${v.id || ''}">
    <div class="flex gap-2 pt-1">
      ${v.id ? `<button type="button" data-delete-vehicle="${v.id}" class="px-4 py-3 rounded-xl border border-red-300 text-red-700 text-sm font-bold hover:bg-red-50">Supprimer</button>` : ''}
      <button class="flex-1 py-3 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm shadow-lg shadow-brand-700/20">Enregistrer</button>
    </div>`;
}

/* ---- affectation d'un chauffeur à un pousse ---- */
function assignFormHTML(vehicle, current) {
  return `
    <div class="p-3 rounded-xl bg-ink-50 text-sm">
      <p class="font-bold">${esc(vehicle.code)}</p>
      <p class="text-xs text-ink-500 mt-0.5">${current
        ? `Conduit actuellement par <b>${esc(current.lastName)} ${esc(current.firstName)}</b>`
        : 'Aucun chauffeur affecté pour le moment'}</p>
    </div>
    ${field('Nouveau chauffeur', `<select name="driverId" required class="${INPUT}" data-driver-select>
      <option value="">— Sélectionner —</option>${driverOptions(null, { onlyFree: true })}
      <option value="__nouveau">➕ Créer un nouveau chauffeur…</option>
    </select>`)}
    <p class="text-[11px] text-ink-500 -mt-2">Seuls les chauffeurs actifs sans pousse sont proposés. Libérez d'abord l'autre pousse si nécessaire.</p>
    ${field('À partir du', `<input type="date" name="from" required value="${State.date}" class="${INPUT}">`)}
    <div class="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
      L'affectation en cours sera clôturée la veille. <b>L'historique des pannes reste attaché au cyclopousse</b>, et les versements déjà saisis restent au nom de l'ancien chauffeur.
    </div>
    <input type="hidden" name="vehicleId" value="${vehicle.id}">
    <div class="flex gap-2">
      ${current ? `<button type="button" data-release="${vehicle.id}" class="px-4 py-3 rounded-xl border border-ink-300 text-sm font-bold hover:bg-ink-50">Libérer le pousse</button>` : ''}
      <button class="flex-1 py-3 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm">Affecter</button>
    </div>`;
}

/* ---- fiche chauffeur (plus de n° de pousse : c'est l'affectation qui le dit) ---- */
function driverFormHTML(d = {}) {
  const v = d.id ? Store.assignments.vehicleOn(d.id, State.date) : null;
  return `
    <div class="flex items-center gap-4">
      <div class="w-20 h-20 rounded-2xl bg-ink-100 overflow-hidden shrink-0 grid place-items-center text-3xl" data-photo-preview>
        ${d.photo ? `<img src="${esc(d.photo)}" class="w-full h-full object-cover">` : '👤'}
      </div>
      <div class="flex-1 space-y-2">
        <label class="inline-block px-3 py-2 rounded-xl border border-ink-300 text-xs font-bold cursor-pointer hover:bg-ink-50">
          📷 Choisir une photo
          <input type="file" accept="image/*" data-photo-input class="hidden">
        </label>
        <input name="photo" value="${esc(d.photo || '')}" placeholder="…ou coller un lien https://" class="${INPUT} text-xs">
      </div>
    </div>
    <div class="grid sm:grid-cols-2 gap-3">
      ${field('Nom *', `<input name="lastName" required value="${esc(d.lastName || '')}" class="${INPUT}">`)}
      ${field('Prénom *', `<input name="firstName" required value="${esc(d.firstName || '')}" class="${INPUT}">`)}
      ${field('Numéro CIN', `<input name="cin" value="${esc(d.cin || '')}" placeholder="12 chiffres" class="${INPUT}">`)}
      ${field('Téléphone', `<input name="phone" type="tel" value="${esc(d.phone || '')}" placeholder="034 00 000 00" class="${INPUT}">`)}
      ${field('Caution versée', `<input name="caution" type="number" min="0" step="1000" value="${d.caution ?? 0}" class="${INPUT}">`)}
      ${field('Début du contrat', `<input name="contractStart" type="date" value="${esc(d.contractStart || '')}" class="${INPUT}">`)}
      ${field('Statut', `<select name="status" class="${INPUT}">
        <option value="actif" ${d.status !== 'inactif' ? 'selected' : ''}>✅ Actif</option>
        <option value="inactif" ${d.status === 'inactif' ? 'selected' : ''}>⛔ Inactif</option>
      </select>`)}
      ${field('Cyclopousse conduit', `<div class="px-3.5 py-2.5 rounded-xl bg-ink-50 border border-ink-200 text-sm font-semibold text-ink-600">
        ${v ? esc(v.code) : 'Aucun'} <span class="text-[11px] font-normal text-ink-400">— se règle depuis la fiche du pousse</span></div>`)}
    </div>
    ${field('Note interne', `<textarea name="note" rows="2" class="${INPUT}">${esc(d.note || '')}</textarea>`)}
    <input type="hidden" name="id" value="${d.id || ''}">
    <div class="flex gap-2 pt-1">
      ${d.id ? `<button type="button" data-delete-driver="${d.id}" class="px-4 py-3 rounded-xl border border-red-300 text-red-700 text-sm font-bold hover:bg-red-50">Supprimer</button>` : ''}
      <button class="flex-1 py-3 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm shadow-lg shadow-brand-700/20">Enregistrer</button>
    </div>`;
}

/* ---- mouvement de coffre : retrait ou apport ---- */
function movementFormHTML(m = {}) {
  const type = m.type || 'retrait';
  const cats = t => Store.MOVEMENT_CATEGORIES[t]
    .map(c => `<option value="${c.id}" ${m.category === c.id ? 'selected' : ''}>${c.icon}  ${esc(c.label)}</option>`).join('');
  return `
    <div>
      <label class="block text-xs font-semibold text-ink-600 mb-1.5">Sens du mouvement</label>
      <div class="grid grid-cols-2 gap-2">
        <label class="cursor-pointer">
          <input type="radio" name="type" value="retrait" ${type === 'retrait' ? 'checked' : ''} class="peer sr-only">
          <span class="block text-center py-2.5 rounded-xl border border-ink-300 text-sm font-bold peer-checked:border-red-500 peer-checked:bg-red-50 peer-checked:text-red-700">📤 Retrait du coffre</span>
        </label>
        <label class="cursor-pointer">
          <input type="radio" name="type" value="apport" ${type === 'apport' ? 'checked' : ''} class="peer sr-only">
          <span class="block text-center py-2.5 rounded-xl border border-ink-300 text-sm font-bold peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-700">📥 Apport au coffre</span>
        </label>
      </div>
    </div>
    <div class="grid grid-cols-2 gap-3">
      ${field('Date', `<input type="date" name="date" required value="${m.date || State.date}" class="${INPUT}">`)}
      ${field('Montant', `<input type="number" name="amount" min="0" step="100" required value="${m.amount ?? ''}" placeholder="0" class="${INPUT} font-bold text-right">`)}
    </div>
    ${field('Motif', `<select name="category" required class="${INPUT}" data-mov-cat>
      <optgroup label="Sorties" data-for="retrait">${cats('retrait')}</optgroup>
      <optgroup label="Entrées" data-for="apport">${cats('apport')}</optgroup>
    </select>`)}
    ${field('Bénéficiaire / provenance', `<input name="beneficiary" value="${esc(m.beneficiary || '')}" placeholder="Ex : Quincaillerie Tana" class="${INPUT}">`)}
    ${field('Note', `<textarea name="note" rows="2" placeholder="Ex : lot de 10 chambres à air" class="${INPUT}">${esc(m.note || '')}</textarea>`)}
    <div class="px-3 py-2 rounded-xl bg-ink-50 text-xs flex items-center justify-between">
      <span class="text-ink-500">Solde du coffre après ce mouvement :</span>
      <b data-solde-apres class="text-ink-900">—</b>
    </div>
    <input type="hidden" name="id" value="${m.id || ''}">
    <div class="flex gap-2">
      ${m.id ? `<button type="button" data-delete-mov="${m.id}" class="px-4 py-3 rounded-xl border border-red-300 text-red-700 text-sm font-bold hover:bg-red-50">Supprimer</button>` : ''}
      <button class="flex-1 py-3 rounded-xl bg-brand-700 hover:bg-brand-800 text-white font-bold text-sm shadow-lg shadow-brand-700/20">Enregistrer le mouvement</button>
    </div>`;
}

/* Le motif proposé doit suivre le sens choisi, et le solde projeté se recalculer. */
function syncMovementForm(form) {
  if (!form || !form.type) return;
  const type = form.querySelector('[name="type"]:checked')?.value || 'retrait';
  const sel = form.querySelector('[data-mov-cat]');
  [...sel.querySelectorAll('optgroup')].forEach(g => {
    const actif = g.dataset.for === type;
    g.hidden = !actif;
    [...g.children].forEach(o => { o.hidden = !actif; o.disabled = !actif; });
  });
  if (sel.selectedOptions[0]?.disabled) {
    const premier = [...sel.querySelectorAll('option')].find(o => !o.disabled);
    if (premier) sel.value = premier.value;
  }
  const cible = form.querySelector('[data-solde-apres]');
  if (cible) {
    const actuel = Store.stats.cashBalance(form.date.value || State.date).solde;
    const montant = Number(form.amount.value) || 0;
    const projete = actuel + (type === 'apport' ? montant : -montant);
    cible.textContent = money(projete);
    cible.className = projete < 0 ? 'text-red-600' : 'text-ink-900';
  }
}

/* Affiche le chauffeur et l'objectif du pousse choisi dans un formulaire de versement. */
function syncVehicleHint(form) {
  if (!form) return;
  const hint = form.querySelector('[data-target-hint]');
  if (!hint) return;
  const v = Store.vehicles.get(form.vehicleId?.value);
  const date = form.date?.value || State.date;
  const d = v ? Store.assignments.driverOn(v.id, date) : null;
  hint.textContent = v ? money(Store.vehicles.target(v)) : '—';
  hint.dataset.value = v ? Store.vehicles.target(v) : '';
  const dh = form.querySelector('[data-driver-hint]');
  if (dh) {
    dh.textContent = d ? `${d.lastName} ${d.firstName}` : (v ? 'aucun ⚠️' : '—');
    dh.className = d ? 'text-ink-800' : 'text-amber-700';
  }
}

/* Compression de la photo : localStorage est petit, on plafonne à 320 px. */
function readPhoto(file, cb) {
  const fr = new FileReader();
  fr.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 320, r = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => cb(fr.result);
    img.src = fr.result;
  };
  fr.readAsDataURL(file);
}

return { $, $$, esc, isoOf, todayISO, shiftDay, fmtNum, money, fmtDate, fmtShort, fmtDay,
         State, NAV, NAV_SIDE, toast, confirmAction, emptyBlock, avatar, vehicleAvatar, vehicleBadge,
         statusBadge, kpiCard, info, phoneLink, INPUT, field, vehicleOptions, driverOptions,
         paymentFormHTML, expenseFormHTML, vehicleFormHTML, assignFormHTML, driverFormHTML,
         movementFormHTML, syncMovementForm, syncVehicleHint, readPhoto };
})();
