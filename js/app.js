/* =========================================================================
   SIKLOPOSY — Contrôleur : navigation, actions, export, PWA, démarrage
   ========================================================================= */
(() => {
'use strict';

/* Store.settings est un objet { get, update } ; on l'expose aussi comme
   fonction pour écrire simplement Store.settings().currency dans les vues. */
(function exposeSettingsAsFunction() {
  const api = Store.settings;
  const fn = () => api.get();
  fn.get = api.get;
  /* Tous les arguments sont transmis : le second (`silencieux`) évite de
     redater l'espace, sans quoi chaque synchronisation se croirait suivie
     d'une modification locale et repartirait en boucle. */
  fn.update = (...args) => api.update(...args);
  Store.settings = fn;
})();

const { $, $$, esc, todayISO, shiftDay, fmtNum, money, fmtDate, fmtShort, fmtDay,
        State, NAV, NAV_SIDE, toast, confirmAction, readPhoto, syncVehicleHint, syncMovementForm,
        paymentFormHTML, expenseFormHTML, vehicleFormHTML, driverFormHTML, assignFormHTML,
        movementFormHTML } = UI;

State.cashFilter = '';

/* ============================================================ NAVIGATION */
function buildNav() {
  $('#sideNav').innerHTML = NAV_SIDE.map(n => `
    <button data-nav="${n.id}" class="nav-link w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold hover:bg-white/5 hover:text-white transition">
      <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${n.icon}"/></svg>
      ${n.label}
    </button>`).join('');

  const bottom = $('#bottomNav');
  bottom.style.gridTemplateColumns = `repeat(${NAV.length},minmax(0,1fr))`;
  bottom.innerHTML = NAV.map(n => `
    <button data-nav="${n.id}" class="nav-bottom py-2 flex flex-col items-center gap-0.5 text-[9px] font-bold text-ink-400">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="${n.icon}"/></svg>
      ${n.short}
    </button>`).join('');
}

function go(view) {
  State.view = view;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  $$('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.nav === view));
  $$('.nav-bottom').forEach(b => {
    const on = b.dataset.nav === view;
    b.classList.toggle('text-brand-700', on);
    b.classList.toggle('text-ink-400', !on);
  });
  $('#pageTitle').textContent = (NAV_SIDE.find(n => n.id === view) || {}).label || '';
  render();
  window.scrollTo({ top: 0 });
}

function render() {
  $('#pageSub').textContent = State.view === 'historique'
    ? `Du ${fmtShort(State.histFrom)} au ${fmtShort(State.histTo)}`
    : fmtDate(State.date);

  ({ dashboard: Views.dashboard, saisie: Views.saisie, pousses: Views.fleet,
     chauffeurs: Views.drivers, caisse: Views.cash, maintenance: Views.maintenance,
     historique: Views.history, parametres: Views.settings })[State.view]?.();

  if (State.view === 'parametres') { afficherEtatSauvegarde(); afficherEtatStockage(); afficherEtatSync(); }
  copieDeSecoursDifferee();
}

/* La copie de secours est écrite au plus une fois toutes les 20 s, pour ne pas
   solliciter IndexedDB à chaque redessin. */
let minuteurSecours = null;
function copieDeSecoursDifferee() {
  if (minuteurSecours) return;
  minuteurSecours = setTimeout(() => { minuteurSecours = null; Secours.ecrire(); }, 20000);
}

/* =============================================================== MODALES */
function openPayment(vehicleId) {
  const existing = vehicleId ? Store.payments.find(vehicleId, State.date) : null;
  $('#paymentForm').innerHTML = paymentFormHTML(existing || { vehicleId, date: State.date });
  syncVehicleHint($('#paymentForm'));
  $('#modalPayment').showModal();
}
function openExpense(pre) {
  $('#expenseForm').innerHTML = expenseFormHTML(pre || { date: State.date });
  $('#modalExpense').showModal();
}
function openVehicle(id) {
  const v = id ? Store.vehicles.get(id) : null;
  $('#modalVehicleTitle').textContent = v ? `Modifier — ${v.code}` : 'Nouveau cyclopousse';
  $('#vehicleForm').innerHTML = vehicleFormHTML(v || {});
  $('#modalVehicle').showModal();
}
function openDriver(id) {
  const d = id ? Store.drivers.get(id) : null;
  $('#modalDriverTitle').textContent = d ? `Modifier — ${d.lastName} ${d.firstName}` : 'Nouveau chauffeur';
  $('#driverForm').innerHTML = driverFormHTML(d || {});
  $('#modalDriver').showModal();
}
function openMovement(pre) {
  const m = typeof pre === 'string' ? Store.movements.get(pre) : (pre || { date: State.date });
  $('#modalMovementTitle').textContent = m && m.id ? '✎ Modifier le mouvement' : '💰 Mouvement de coffre';
  const form = $('#movementForm');
  form.innerHTML = movementFormHTML(m || {});
  syncMovementForm(form);
  $('#modalMovement').showModal();
}
function openAssign(vehicleId, preDriverId) {
  const v = Store.vehicles.get(vehicleId);
  if (!v) return;
  const current = Store.assignments.driverOn(vehicleId, State.date);
  $('#modalAssignTitle').textContent = current ? `Changer le chauffeur de ${v.code}` : `Affecter un chauffeur à ${v.code}`;
  $('#assignForm').innerHTML = assignFormHTML(v, current);
  if (preDriverId) $('#assignForm').driverId.value = preDriverId;
  $('#modalAssign').showModal();
}

/* ---- création d'un chauffeur sans quitter le formulaire en cours ----
   On met le formulaire d'origine en attente, on ouvre la fiche chauffeur,
   puis on revient exactement où l'on était avec le nouveau chauffeur choisi. */
function creerChauffeurDepuis(select) {
  const form = select.closest('form');
  const origine = form.getAttribute('id');

  if (origine === 'vehicleForm') {
    const fd = new FormData(form);
    State.retourChauffeur = { modale: 'vehicle', brouillon: Object.fromEntries(fd.entries()) };
    $('#modalVehicle').close();
  } else if (origine === 'assignForm') {
    State.retourChauffeur = { modale: 'assign', vehicleId: form.vehicleId.value, from: form.from.value };
    $('#modalAssign').close();
  } else {
    State.retourChauffeur = null;
  }
  select.value = '';
  openDriver();
  toast('Renseignez le chauffeur : vous reviendrez ensuite au cyclopousse.', 'warn');
}

/* Reprise du formulaire mis en attente, une fois le chauffeur enregistré. */
function reprendreApresChauffeur(nouveauId) {
  const r = State.retourChauffeur;
  State.retourChauffeur = null;
  if (!r) return false;

  if (r.modale === 'vehicle') {
    const brouillon = { ...r.brouillon, assignDriverId: nouveauId };
    delete brouillon.id;
    $('#modalVehicleTitle').textContent = 'Nouveau cyclopousse';
    $('#vehicleForm').innerHTML = UI.vehicleFormHTML(brouillon);
    $('#vehicleForm').assignDriverId.value = nouveauId;
    $('#modalVehicle').showModal();
    return true;
  }
  if (r.modale === 'assign') {
    openAssign(r.vehicleId, nouveauId);
    if (r.from) $('#assignForm').from.value = r.from;
    return true;
  }
  return false;
}

/* ============================================================ SOUMISSIONS */
function submitPayment(form) {
  const fd = new FormData(form);
  const vehicleId = fd.get('vehicleId');
  if (!vehicleId) return toast('Sélectionnez un cyclopousse.', 'err');
  Store.payments.save({
    id: fd.get('id') || undefined, vehicleId,
    date: fd.get('date'), amount: fd.get('amount'),
    status: fd.get('status'), note: fd.get('note')
  });
  toast('Versement enregistré ✅');
  form.closest('dialog')?.close();
  if (form.getAttribute('id') === 'paymentFormInline') {
    form.innerHTML = paymentFormHTML();
    syncVehicleHint(form);
  }
  render();
}

function submitExpense(form) {
  const fd = new FormData(form);
  if (!fd.get('vehicleId')) return toast('Sélectionnez un cyclopousse.', 'err');
  Store.expenses.save({
    id: fd.get('id') || undefined,
    vehicleId: fd.get('vehicleId'), date: fd.get('date'), amount: fd.get('amount'),
    category: fd.get('category'), description: fd.get('description'),
    repairer: fd.get('repairer'), immobilize: fd.get('immobilize') === 'on'
  });
  toast('Dépense enregistrée 🔧');
  form.closest('dialog')?.close();
  if (form.getAttribute('id') === 'expenseFormInline') form.innerHTML = expenseFormHTML();
  render();
}

function submitVehicle(form) {
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  const assignTo = data.assignDriverId === '__nouveau' ? '' : data.assignDriverId;
  delete data.assignDriverId;
  data.dailyTarget = data.dailyTarget === '' ? null : Number(data.dailyTarget);
  if (!data.id) delete data.id;

  const code = (data.code || '').trim();
  const clash = Store.vehicles.all().find(v => v.code.trim().toLowerCase() === code.toLowerCase() && v.id !== data.id);
  if (clash) return toast(`Le numéro « ${code} » est déjà utilisé.`, 'err');

  const saved = Store.vehicles.save(data);
  if (assignTo) Store.assignments.assign(saved.id, assignTo, State.date);
  toast(data.id ? 'Cyclopousse mis à jour ✅' : 'Cyclopousse ajouté 🚲');
  $('#modalVehicle').close();
  render();
}

function submitDriver(form) {
  const fd = new FormData(form);
  const data = Object.fromEntries(fd.entries());
  data.caution = Number(data.caution) || 0;
  const creation = !data.id;
  if (creation) delete data.id;
  const enregistre = Store.drivers.save(data);
  toast(creation ? 'Chauffeur ajouté 👤' : 'Chauffeur mis à jour ✅');
  $('#modalDriver').close();
  /* Si l'on venait d'un cyclopousse, on y retourne avec ce chauffeur choisi. */
  if (!creation || !reprendreApresChauffeur(enregistre.id)) render();
}

function submitMovement(form) {
  const fd = new FormData(form);
  const montant = Number(fd.get('amount')) || 0;
  if (montant <= 0) return toast('Indiquez un montant supérieur à zéro.', 'err');
  const type = fd.get('type');

  const enregistrer = () => {
    Store.movements.save({
      id: fd.get('id') || undefined, type, date: fd.get('date'), amount: montant,
      category: fd.get('category'), beneficiary: fd.get('beneficiary'), note: fd.get('note')
    });
    toast(type === 'apport' ? 'Apport enregistré 📥' : 'Retrait enregistré 📤');
    $('#modalMovement').close();
    render();
  };

  /* Un retrait qui ferait passer le coffre en négatif mérite une confirmation. */
  const apres = Store.stats.cashBalance(fd.get('date')).solde + (type === 'apport' ? montant : -montant);
  if (apres < 0) {
    return confirmAction('Le coffre passerait en négatif',
      `Après ce retrait le solde serait de ${money(apres)}. Cela signifie généralement qu'un versement ou un apport n'a pas été saisi. Enregistrer quand même ?`,
      enregistrer);
  }
  enregistrer();
}

function submitAssign(form) {
  const fd = new FormData(form);
  const vehicleId = fd.get('vehicleId'), driverId = fd.get('driverId'), from = fd.get('from');
  if (!driverId || driverId === '__nouveau') return toast('Sélectionnez un chauffeur.', 'err');
  Store.assignments.assign(vehicleId, driverId, from);
  const d = Store.drivers.get(driverId), v = Store.vehicles.get(vehicleId);
  toast(`${d.lastName} conduit désormais ${v.code} 🚲`);
  $('#modalAssign').close();
  render();
}

/* ============================================================== EXPORT */
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ============================================ DATE SUIVIE SUR LE TÉLÉPHONE
   L'application peut rester ouverte plusieurs jours (surtout installée sur
   l'écran d'accueil). On surveille le passage de minuit et le retour depuis
   l'arrière-plan pour que « aujourd'hui » reste vraiment aujourd'hui. */
function surveillerChangementDeJour() {
  let jourConnu = todayISO();

  const verifier = () => {
    const maintenant = todayISO();
    if (maintenant === jourConnu) return;
    const etaitSurAujourdhui = State.date === jourConnu;
    jourConnu = maintenant;
    if (etaitSurAujourdhui) {                 // on ne déplace pas une date choisie exprès
      State.date = maintenant;
      $('#globalDate').value = maintenant;
      if (State.periode) appliquerPeriode(State.periode);
      render();
      toast(`Nouvelle journée : ${fmtDate(maintenant)}`);
    } else {
      render();                               // les bornes « aujourd'hui » ont bougé
    }
  };

  setInterval(verifier, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) verifier(); });
  window.addEventListener('focus', verifier);
}

/* ================================================== PÉRIODES D'ANALYSE
   Toutes les bornes sont calées sur la date du téléphone, pas sur une durée
   glissante : « Mois » signifie le mois en cours, pas les 30 derniers jours. */

/* Date de la plus ancienne opération enregistrée. */
function premiereOperation() {
  const dates = [
    ...Store.payments.all().map(p => p.date),
    ...Store.expenses.all().map(e => e.date),
    ...Store.movements.all().map(m => m.date)
  ].filter(Boolean).sort();
  return dates[0] || todayISO();
}

function bornesPeriode(nom) {
  const auj = todayISO();
  const d = new Date(auj + 'T00:00:00');
  switch (nom) {
    case 'jour':
      return { from: auj, to: auj, group: 'day' };
    case 'semaine': {                                   // depuis lundi
      const lundi = new Date(d);
      lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
      return { from: UI.isoOf(lundi), to: auj, group: 'day' };
    }
    case 'mois':
      return { from: auj.slice(0, 8) + '01', to: auj, group: 'day' };
    case 'annee':
      return { from: auj.slice(0, 4) + '-01-01', to: auj, group: 'month' };
    case 'tout': {
      const debut = premiereOperation();
      const ans = Number(auj.slice(0, 4)) - Number(debut.slice(0, 4));
      return { from: debut, to: auj, group: ans >= 2 ? 'year' : 'month' };
    }
    default:
      return { from: shiftDay(auj, -6), to: auj, group: 'day' };
  }
}

function appliquerPeriode(nom) {
  const b = bornesPeriode(nom);
  State.periode = nom;
  State.histFrom = b.from;
  State.histTo   = b.to;
  State.histGroup = b.group;
  $$('.period-btn').forEach(x => {
    const on = x.dataset.period === nom;
    x.classList.toggle('bg-white', on);
    x.classList.toggle('shadow', on);
    x.classList.toggle('text-brand-700', on);
  });
  if (State.view === 'historique') Views.history();
  else if (State.view === 'caisse') Views.cash();
  $('#pageSub').textContent = `Du ${fmtShort(State.histFrom)} au ${fmtShort(State.histTo)}`;
}

/* ======================================================== SYNCHRONISATION */

function afficherEtatSync() {
  const boite = $('#syncState');
  if (!boite) return;
  const { etat, message, derniere } = Sync.etat();
  const tons = {
    pret:      ['bg-emerald-50 border border-emerald-200 text-emerald-800', '✅'],
    envoi:     ['bg-brand-50 border border-brand-200 text-brand-800', '⬆️'],
    reception: ['bg-brand-50 border border-brand-200 text-brand-800', '⬇️'],
    'hors-ligne': ['bg-amber-50 border border-amber-200 text-amber-900', '📴'],
    conflit:   ['bg-amber-50 border border-amber-300 text-amber-900', '⚖️'],
    erreur:    ['bg-red-50 border border-red-200 text-red-800', '⚠️'],
    inactif:   ['bg-ink-100 text-ink-600', '💤']
  };
  const [classe, icone] = tons[etat] || tons.inactif;
  const quand = derniere ? `Dernière synchronisation : ${new Date(derniere).toLocaleString('fr-FR')}` : 'Jamais synchronisé';
  const libelles = { pret:'À jour', envoi:'Envoi en cours…', reception:'Réception en cours…',
                     'hors-ligne':'Hors ligne — reprise automatique', conflit:'Deux versions différentes',
                     erreur:'Erreur', inactif:'Désactivée' };
  boite.className = 'mb-4 p-3 rounded-xl text-sm ' + classe;

  const c = Sync.conflit();
  boite.innerHTML = `${icone} <b>${libelles[etat] || etat}</b>${message ? ' — ' + esc(message) : ''}
    <span class="block text-xs opacity-80 mt-0.5">${quand}</span>` +
    (c ? `<div class="mt-3 pt-3 border-t border-amber-300">
        <p class="text-xs mb-2">Cet appareil et le serveur ont chacun des saisies que l'autre n'a pas.
        <b>Rien n'a été effacé.</b> Choisissez la version à conserver — l'autre sera remplacée.</p>
        <p class="text-xs mb-2">Cet appareil : modifié le <b>${new Date(c.majLocale).toLocaleString('fr-FR')}</b><br>
        Serveur : modifié le <b>${new Date(c.majDistante).toLocaleString('fr-FR')}</b></p>
        <p class="text-xs mb-3">💡 Exportez d'abord une sauvegarde si vous hésitez.</p>
        <div class="flex flex-wrap gap-2">
          <button id="conflitLocal" class="px-3 py-2 rounded-lg bg-brand-700 text-white text-xs font-bold">Garder cet appareil</button>
          <button id="conflitServeur" class="px-3 py-2 rounded-lg border border-amber-400 text-xs font-bold">Prendre le serveur</button>
        </div>
      </div>` : '');

  if (c) {
    $('#conflitLocal').addEventListener('click', async () => {
      const r = await Sync.resoudreConflit('local');
      afficherEtatSync();
      toast(r.fait ? 'Votre version a été publiée ⬆️' : (r.erreur || 'Échec'), r.fait ? 'ok' : 'err');
    });
    $('#conflitServeur').addEventListener('click', () => confirmAction(
      'Adopter la version du serveur',
      'Les saisies présentes seulement sur cet appareil seront remplacées. Une copie de secours interne est conservée.',
      async () => {
        const r = await Sync.resoudreConflit('serveur');
        if (r.fait) { await Secours.ecrire(); render(); }
        afficherEtatSync();
        toast(r.fait ? 'Version du serveur adoptée ⬇️' : (r.erreur || 'Échec'), r.fait ? 'ok' : 'err');
      }));
  }

  const srv = Store.serveur.get();
  if ($('#syncUrl') && document.activeElement !== $('#syncUrl')) $('#syncUrl').value = srv.url;
  if ($('#syncKey') && document.activeElement !== $('#syncKey')) $('#syncKey').value = srv.cle;

  afficherRepriseLocale();
}

/* Propose de récupérer les données d'un ancien compte local vers le compte
   en ligne — sinon elles resteraient invisibles après le passage au serveur. */
function afficherRepriseLocale() {
  const bloc = $('#importLocalBloc');
  if (!bloc) return;
  const s = Store.auth.current();
  const espaces = (s && s.mode === 'enligne') ? Store.auth.espacesLocaux() : [];
  bloc.classList.toggle('hidden', espaces.length === 0);
  if (!espaces.length) return;

  $('#importLocalListe').innerHTML = espaces.map(e => `
    <div class="flex items-center gap-2 flex-wrap">
      <span class="text-xs flex-1 min-w-0">${esc(e.nom || e.email)} — <b>${e.elements}</b> élément(s)</span>
      <button data-import-local="${e.id}" class="px-3 py-1.5 rounded-lg bg-brand-700 text-white text-xs font-bold">Reprendre</button>
    </div>`).join('');
}

/* =================================================== SAUVEGARDE & SÉCURITÉ */

const nomSauvegarde = () => {
  const qui = (Store.settings().ownerName || Store.auth.current().email)
    .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return `sikloposy_${qui || 'sauvegarde'}_${todayISO()}.json`;
};

/* Le navigateur peut effacer le stockage s'il manque de place : on demande
   explicitement qu'il soit conservé. Attention, la demande peut être REFUSÉE :
   Chrome ne l'accorde qu'aux applications installées ou très utilisées. On
   affiche donc l'état réel plutôt que de supposer la protection acquise. */
async function demanderStockagePersistant() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return null; }
}

async function afficherEtatStockage() {
  const boite = $('#storageStatus');
  if (!boite) return;
  if (!navigator.storage?.persisted) {
    boite.className = 'p-3 rounded-xl text-sm bg-ink-100 text-ink-600 mb-3';
    boite.textContent = 'Ce navigateur ne permet pas de connaître l\'état du stockage.';
    return;
  }
  const persistant = await navigator.storage.persisted();
  const est = navigator.storage.estimate ? await navigator.storage.estimate() : null;
  const place = est ? ` · ${(est.usage/1024).toFixed(0)} Ko utilisés sur ${(est.quota/1048576).toFixed(0)} Mo` : '';

  boite.className = 'p-3 rounded-xl text-sm mb-3 ' + (persistant
    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
    : 'bg-amber-50 border border-amber-200 text-amber-900');
  boite.innerHTML = persistant
    ? `✅ <b>Stockage protégé.</b> Le navigateur ne supprimera pas vos données pour libérer de la place.${place}`
    : `⚠️ <b>Stockage non protégé.</b> Le navigateur s'autorise à effacer vos données s'il manque de place sur l'appareil.
       <span class="block mt-1">Pour obtenir la protection : <b>installez l'application</b> sur l'écran d'accueil. En attendant, la sauvegarde par e-mail reste votre filet de sécurité.${place}</span>`;
}

/* Copie de secours dans IndexedDB : un second support, indépendant de
   localStorage. Ne protège pas d'un effacement complet du navigateur. */
const Secours = (() => {
  const ouvrir = () => new Promise((res, rej) => {
    const r = indexedDB.open('sikloposy_secours', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('copies');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const cle = () => 'espace_' + (Store.auth.current()?.userId || 'anonyme');

  return {
    async ecrire() {
      try {
        const db = await ouvrir();
        await new Promise((res, rej) => {
          const tx = db.transaction('copies', 'readwrite');
          tx.objectStore('copies').put({ quand: Date.now(), contenu: Store.backup.export() }, cle());
          tx.oncomplete = res; tx.onerror = () => rej(tx.error);
        });
        db.close();
        return true;
      } catch { return false; }
    },
    async lire() {
      try {
        const db = await ouvrir();
        const val = await new Promise((res, rej) => {
          const q = db.transaction('copies', 'readonly').objectStore('copies').get(cle());
          q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
        });
        db.close();
        return val || null;
      } catch { return null; }
    }
  };
})();

/* Envoi de la sauvegarde : partage natif sur téléphone, fichier + messagerie
   sur ordinateur. Aucun serveur, donc rien à héberger ni à payer. */
async function sauvegarderParEmail() {
  const contenu = Store.backup.export();
  const nom = nomSauvegarde();
  const dest = Store.settings().backupEmail || '';
  const s = Store.stats.cashBalance();
  const resume = [
    `Sauvegarde SIKLOPOSY — ${Store.settings().ownerName || Store.auth.current().email}`,
    `Date : ${fmtDate(todayISO())}`,
    ``,
    `Cyclopousses : ${Store.vehicles.all().length}`,
    `Chauffeurs : ${Store.drivers.all().length}`,
    `Versements enregistrés : ${Store.payments.all().length}`,
    `Solde du coffre : ${money(s.solde)}`,
    ``,
    `Le fichier joint (${nom}) permet de tout restaurer :`,
    `Paramètres → Restaurer une sauvegarde.`
  ].join('\n');

  const fichier = new File([contenu], nom, { type: 'application/json' });

  /* 1. Téléphone : le menu de partage natif accepte les pièces jointes. */
  if (navigator.canShare?.({ files: [fichier] })) {
    try {
      await navigator.share({ files: [fichier], title: 'Sauvegarde SIKLOPOSY', text: resume });
      Store.backup.markSaved();
      Views.settings();
      toast('Sauvegarde partagée ✅');
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;          // partage annulé par l'utilisateur
    }
  }

  /* 2. Ordinateur : on enregistre le fichier puis on ouvre la messagerie. */
  download(nom, contenu, 'application/json');
  Store.backup.markSaved();
  Views.settings();
  const sujet = encodeURIComponent(`Sauvegarde SIKLOPOSY — ${todayISO()}`);
  const corps = encodeURIComponent(resume + `\n\n⚠️ Joignez le fichier ${nom} qui vient d'être enregistré (dossier Téléchargements).`);
  window.location.href = `mailto:${encodeURIComponent(dest)}?subject=${sujet}&body=${corps}`;
  toast('Fichier enregistré — joignez-le à l\'e-mail 📎', 'warn');
}

/* Bandeau d'état de la sauvegarde, dans les Paramètres. */
function afficherEtatSauvegarde() {
  const jours = Store.backup.daysSinceBackup();
  const enRetard = Store.backup.backupOverdue();
  const boite = $('#backupState');
  if (!boite) return;
  boite.className = 'mb-4 p-3 rounded-xl text-sm ' +
    (enRetard ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-emerald-50 border border-emerald-200 text-emerald-800');
  boite.innerHTML = jours === null
    ? '⚠️ <b>Aucune sauvegarde n\'a jamais été faite.</b> Si vous perdez ce téléphone, tout est perdu.'
    : (enRetard
        ? `⚠️ <b>Dernière sauvegarde il y a ${jours} jour(s).</b> Pensez à en refaire une.`
        : `✅ Dernière sauvegarde il y a ${jours} jour(s).`);
  $('#backupEmail').value = Store.settings().backupEmail || '';

  Secours.lire().then(c => {
    const el = $('#localCopyState');
    if (el) el.textContent = c ? `Copie du ${new Date(c.quand).toLocaleString('fr-FR')}` : 'Aucune copie pour l\'instant.';
  });
}

function exportCsv() {
  const sep = ';';
  const lines = [['Date','Cyclopousse','Chauffeur','Type','Categorie','Montant','Statut','Description','Reparateur'].join(sep)];
  const inRange = d => d >= State.histFrom && d <= State.histTo;
  const clean = s => (s || '').replace(/[\r\n;]/g, ' ');
  const who = id => { const d = Store.drivers.get(id); return d ? `${d.lastName} ${d.firstName}` : ''; };
  const code = id => { const v = Store.vehicles.get(id); return v ? v.code : ''; };

  Store.payments.all().filter(p => inRange(p.date)).forEach(p =>
    lines.push([p.date, code(p.vehicleId), who(p.driverId), 'Versement', '', p.amount, p.status, clean(p.note), ''].join(sep)));
  Store.expenses.all().filter(e => inRange(e.date)).forEach(e =>
    lines.push([e.date, code(e.vehicleId), who(e.driverId), 'Depense', Store.catOf(e.category).label,
                -e.amount, '', clean(e.description), clean(e.repairer)].join(sep)));

  download(`sikloposy_${State.histFrom}_${State.histTo}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  toast('Export CSV téléchargé ⬇');
}

function printReport() {
  const bk = Views.buckets();
  const pv = Store.stats.perVehicle(State.histFrom, State.histTo);
  const pd = Store.stats.perDriver(State.histFrom, State.histTo);
  const gross = bk.reduce((s, b) => s + b.gross, 0);
  const spent = bk.reduce((s, b) => s + b.spent, 0);
  const s = Store.settings();
  const td = 'padding:5px;border:1px solid #cbd5e1';

  $('#printArea').innerHTML = `
    <div style="font-family:Segoe UI,sans-serif;color:#0f172a">
      <h1 style="margin:0;font-size:20px">Rapport d'exploitation — ${esc(s.ownerName || 'SIKLOPOSY')}</h1>
      <p style="color:#64748b;font-size:12px;margin:4px 0 16px">Période du ${fmtDate(State.histFrom)} au ${fmtDate(State.histTo)} · édité le ${new Date().toLocaleString('fr-FR')}</p>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:18px"><tr>
        <td style="${td}"><b>Total versements</b></td><td style="${td};text-align:right">${money(gross)}</td>
        <td style="${td}"><b>Total dépenses</b></td><td style="${td};text-align:right">${money(spent)}</td>
        <td style="${td}"><b>Recette nette</b></td><td style="${td};text-align:right"><b>${money(gross - spent)}</b></td>
      </tr></table>

      <h2 style="font-size:14px;margin:0 0 6px">Rendement par cyclopousse</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:18px">
        <thead><tr style="background:#f1f5f9">
          <th style="${td};text-align:left">Pousse</th><th style="${td};text-align:left">Chauffeur actuel</th>
          <th style="${td};text-align:left">Téléphone</th><th style="${td};text-align:right">Encaissé</th>
          <th style="${td};text-align:right">Pannes</th><th style="${td};text-align:right">Net</th></tr></thead>
        <tbody>${pv.map(r => `<tr>
          <td style="${td}">${esc(r.vehicle.code)}</td>
          <td style="${td}">${r.driver ? esc(r.driver.lastName) + ' ' + esc(r.driver.firstName) : '—'}</td>
          <td style="${td}">${r.driver ? esc(r.driver.phone) : '—'}</td>
          <td style="${td};text-align:right">${fmtNum(r.collected)}</td>
          <td style="${td};text-align:right">${fmtNum(r.spent)} (${r.breakdowns})</td>
          <td style="${td};text-align:right"><b>${fmtNum(r.net)}</b></td></tr>`).join('')}</tbody>
      </table>

      <h2 style="font-size:14px;margin:0 0 6px">Bilan par chauffeur</h2>
      <table style="width:100%;border-collapse:collapse;font-size:11px">
        <thead><tr style="background:#f1f5f9">
          <th style="${td};text-align:left">Chauffeur</th><th style="${td};text-align:left">Pousse</th>
          <th style="${td};text-align:right">Versé</th><th style="${td};text-align:center">Jours conduits</th>
          <th style="${td};text-align:center">Impayés</th><th style="${td};text-align:right">Fiabilité</th></tr></thead>
        <tbody>${pd.map(r => `<tr>
          <td style="${td}">${esc(r.driver.lastName)} ${esc(r.driver.firstName)}</td>
          <td style="${td}">${r.vehicle ? esc(r.vehicle.code) : '—'}</td>
          <td style="${td};text-align:right">${fmtNum(r.collected)}</td>
          <td style="${td};text-align:center">${r.workedDays}</td>
          <td style="${td};text-align:center">${r.missedDays}</td>
          <td style="${td};text-align:right">${r.reliability}%</td></tr>`).join('')}</tbody>
      </table>
    </div>`;
  $('#printArea').classList.remove('hidden');
  window.print();
  setTimeout(() => $('#printArea').classList.add('hidden'), 400);
}

/* ============================================================ ÉCOUTEURS */
function bindGlobal() {

  document.addEventListener('click', e => {
    const t = e.target;
    const nav = t.closest('[data-nav]');           if (nav) return go(nav.dataset.nav);

    if (t.closest('[data-open="vehicle"]')) return openVehicle();
    if (t.closest('[data-open="driver"]'))  return openDriver();
    if (t.closest('[data-open="expense"]'))  return openExpense();
    if (t.closest('[data-open="movement"]')) return openMovement();

    const editMov = t.closest('[data-edit-mov]');
    if (editMov) { e.stopPropagation(); return openMovement(editMov.dataset.editMov); }

    const delMov = t.closest('[data-delete-mov]');
    if (delMov) { e.stopPropagation(); return confirmAction('Supprimer le mouvement',
      'Ce retrait ou apport sera retiré du registre et le solde du coffre recalculé.',
      () => { Store.movements.remove(delMov.dataset.deleteMov); $('#modalMovement').close(); toast('Mouvement supprimé'); render(); }); }

    const cf = t.closest('[data-cash-filter]');
    if (cf) { State.cashFilter = cf.dataset.cashFilter; return Views.cash(); }
    if (t.closest('#quickAdd') || t.closest('#fab')) return openPayment();

    const assign = t.closest('[data-assign]');     if (assign) { e.stopPropagation(); return openAssign(assign.dataset.assign); }
    const pay = t.closest('[data-pay]');           if (pay)  { e.stopPropagation(); return openPayment(pay.dataset.pay); }
    const exp = t.closest('[data-exp]');           if (exp)  { e.stopPropagation(); return openExpense({ vehicleId: exp.dataset.exp, date: State.date }); }
    const ved = t.closest('[data-vedit]');         if (ved)  { e.stopPropagation(); return openVehicle(ved.dataset.vedit); }
    const ded = t.closest('[data-dedit]');         if (ded)  { e.stopPropagation(); return openDriver(ded.dataset.dedit); }
    const vdt = t.closest('[data-vdetail]');       if (vdt)  return Views.vehicleDetail(vdt.dataset.vdetail);
    const ddt = t.closest('[data-ddetail]');       if (ddt)  return Views.driverDetail(ddt.dataset.ddetail);

    const editExp = t.closest('[data-edit-exp]');
    if (editExp) {
      const x = Store.expenses.all().find(v => v.id === editExp.dataset.editExp);
      return x && openExpense(x);
    }

    const delExp = t.closest('[data-del-exp]');
    if (delExp) { e.stopPropagation(); return confirmAction('Supprimer la dépense',
      'Cette dépense sera définitivement retirée des comptes.',
      () => { Store.expenses.remove(delExp.dataset.delExp); toast('Dépense supprimée'); render(); }); }

    const delVeh = t.closest('[data-delete-vehicle]');
    if (delVeh) return confirmAction('Supprimer le cyclopousse',
      'Ses affectations, versements et pannes seront supprimés. Les chauffeurs sont conservés.',
      () => { Store.vehicles.remove(delVeh.dataset.deleteVehicle); $('#modalVehicle').close(); toast('Cyclopousse supprimé'); render(); });

    const delDrv = t.closest('[data-delete-driver]');
    if (delDrv) return confirmAction('Supprimer le chauffeur',
      'Ses affectations et ses versements seront supprimés. Les pousses et leurs pannes sont conservés.',
      () => { Store.drivers.remove(delDrv.dataset.deleteDriver); $('#modalDriver').close(); toast('Chauffeur supprimé'); render(); });

    const rel = t.closest('[data-release]');
    if (rel) return confirmAction('Libérer le cyclopousse',
      'Le pousse n\'aura plus de chauffeur affecté. Son historique est conservé.',
      () => { Store.assignments.release(rel.dataset.release, State.date); $('#modalAssign').close(); toast('Cyclopousse libéré'); render(); });

    if (t.closest('[data-close]')) return t.closest('dialog')?.close();

    if (t.closest('[data-fill-target]')) {
      const form = t.closest('form');
      const hint = form.querySelector('[data-target-hint]');
      if (hint?.dataset.value) form.amount.value = hint.dataset.value;
      return;
    }
  });

  $$('dialog').forEach(dlg => dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); }));

  /* --- soumissions (getAttribute : un champ name="id" masque form.id) --- */
  document.addEventListener('submit', e => {
    const f = e.target, id = f.getAttribute('id');
    if (id === 'paymentForm' || id === 'paymentFormInline') { e.preventDefault(); submitPayment(f); }
    if (id === 'expenseForm' || id === 'expenseFormInline') { e.preventDefault(); submitExpense(f); }
    if (id === 'vehicleForm') { e.preventDefault(); submitVehicle(f); }
    if (id === 'driverForm')  { e.preventDefault(); submitDriver(f); }
    if (id === 'assignForm')  { e.preventDefault(); submitAssign(f); }
    if (id === 'movementForm'){ e.preventDefault(); submitMovement(f); }
    if (id === 'settingsForm') {
      e.preventDefault();
      const fd = new FormData(f);
      Store.settings.update({
        currency: fd.get('currency') || 'Ar',
        dailyTarget: Number(fd.get('dailyTarget')) || 0,
        ownerName: fd.get('ownerName'),
        strictTarget: fd.get('strictTarget') === 'on',
        lang: fd.get('lang') || 'fr'
      });
      $('#sideOwner').textContent = fd.get('ownerName') || Store.auth.current().email;
      toast('Paramètres enregistrés ⚙️');
      render();
    }
    if (id === 'pinConfigForm') {
      e.preventDefault();
      const err = $('#pinConfigErr');
      err.classList.add('hidden'); err.textContent = '';
      const c1 = f.code.value, c2 = f.code2.value;
      const user = Store.auth.current();
      if (!user) return;
      if (c1 !== c2) { err.textContent = 'Les deux codes ne sont pas identiques.'; err.classList.remove('hidden'); return; }
      Store.pin.set(user.email, c1).then(() => {
        f.reset();
        toast('Code PIN enregistré 🔒');
        render();
      }).catch(x => { err.textContent = x.message; err.classList.remove('hidden'); });
    }
  });

  document.addEventListener('click', e => {
    if (e.target.closest('#pinRemoveBtn')) {
      const u = Store.auth.current();
      if (!u) return;
      confirmAction('Supprimer le code PIN ?', 'À la prochaine ouverture il faudra retaper e-mail et mot de passe.',
        () => { Store.pin.clear(u.email); Store.pin.deverrouiller(); toast('Code PIN supprimé'); render(); });
    }
    if (e.target.closest('#pinLockNowBtn')) {
      Store.pin.verrouiller();
      boot();
    }
  });

  /* Le formulaire de coffre se recalcule à la saisie, pas seulement au change. */
  document.addEventListener('input', e => {
    if (e.target.closest('#movementForm')) syncMovementForm($('#movementForm'));
  });

  document.addEventListener('change', e => {
    const t = e.target;
    if (t.name === 'vehicleId' || (t.name === 'date' && t.form?.vehicleId)) syncVehicleHint(t.form);
    if (t.closest('#movementForm')) syncMovementForm($('#movementForm'));
    if (t.matches('[data-driver-select]') && t.value === '__nouveau') return creerChauffeurDepuis(t);

    if (t.matches('[data-photo-input]')) {
      const file = t.files[0];
      if (!file) return;
      readPhoto(file, url => {
        const form = t.closest('form');
        form.photo.value = url;
        form.querySelector('[data-photo-preview]').innerHTML = `<img src="${url}" class="w-full h-full object-cover">`;
      });
    }

    if (t.id === 'globalDate')    { State.date = t.value || todayISO(); render(); }
    if (t.id === 'vehicleFilter') { State.vehicleFilter = t.value; Views.fleet(); }
    if (t.id === 'driverFilter')  { State.driverFilter = t.value; Views.drivers(); }
    if (t.id === 'histFrom')      { State.histFrom = t.value; Views.history(); }
    if (t.id === 'histTo')        { State.histTo = t.value; Views.history(); }
    if (t.id === 'histGroup')     { State.histGroup = t.value; Views.history(); }
  });

  $('#vehicleSearch').addEventListener('input', e => { State.vehicleQuery = e.target.value; Views.fleet(); });
  $('#driverSearch').addEventListener('input',  e => { State.driverQuery  = e.target.value; Views.drivers(); });

  $$('.period-btn').forEach(b => b.addEventListener('click', () => appliquerPeriode(b.dataset.period)));

  $('#markAllPaid').addEventListener('click', () => {
    const s = Store.stats.day(State.date);
    const todo = s.rows.filter(r => r.active && r.status !== 'paye');
    if (!todo.length) return toast('Tout est déjà encaissé ✅');
    confirmAction('Confirmer l\'encaissement global',
      `${todo.length} versement(s) au montant attendu pour le ${fmtDate(State.date)}. Les pousses improductifs sont ignorés.`,
      () => {
        todo.forEach(r => Store.payments.save({ vehicleId: r.vehicle.id, date: State.date, amount: r.target, status: 'paye' }));
        toast(`${todo.length} versement(s) enregistrés ✅`);
        render();
      });
  });

  $('#exportCsv').addEventListener('click', exportCsv);
  $('#printBtn').addEventListener('click', printReport);

  $('#backupBtn').addEventListener('click', () => {
    download(nomSauvegarde(), Store.backup.export(), 'application/json');
    Store.backup.markSaved();
    afficherEtatSauvegarde();
    toast('Sauvegarde enregistrée 💾');
  });
  $('#emailBackupBtn').addEventListener('click', sauvegarderParEmail);
  $('#saveEmailBtn').addEventListener('click', () => {
    Store.settings.update({ backupEmail: $('#backupEmail').value.trim() });
    toast('Adresse mémorisée ✉️');
  });
  /* --- synchronisation en ligne --- */
  $('#syncSaveBtn').addEventListener('click', () => {
    Store.serveur.set({ url: $('#syncUrl').value.trim(), cle: $('#syncKey').value.trim() });
    afficherEtatSync();
    if (Store.auth.current()?.mode === 'enligne') {
      toast('Serveur enregistré ☁️');
      Sync.synchroniser();
    } else {
      confirmAction('Se reconnecter pour activer le compte en ligne',
        'Le serveur est enregistré. Déconnectez-vous puis recréez votre compte (ou connectez-vous) pour que vos données soient hébergées et vous suivent d\'un téléphone à l\'autre.',
        () => { Store.auth.logout(); location.reload(); });
    }
  });

  $('#syncTestBtn').addEventListener('click', async () => {
    const btn = $('#syncTestBtn');
    btn.disabled = true; btn.textContent = '⏳ Test en cours…';
    try {
      await Sync.tester($('#syncUrl').value.trim(), $('#syncKey').value.trim());
      toast('Connexion réussie — la table est accessible ✅');
    } catch (e) {
      toast(e.message, 'err');
    } finally {
      btn.disabled = false; btn.textContent = '🔌 Tester la connexion';
    }
  });

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-import-local]');
    if (!b) return;
    confirmAction('Reprendre ces données',
      'Elles remplaceront le contenu actuel de ce compte en ligne, puis seront envoyées au serveur.',
      () => {
        try {
          Store.auth.importerEspaceLocal(b.dataset.importLocal);
          toast('Données reprises ✅');
          render();
          if (Sync.configuree()) Sync.synchroniser();
        } catch (err) { toast(err.message, 'err'); }
      });
  });

  $('#syncNowBtn').addEventListener('click', async () => {
    if (!Sync.configuree()) return toast('Connectez-vous à un compte en ligne pour synchroniser.', 'warn');
    const r = await Sync.synchroniser();
    afficherEtatSync();
    if (r.fait && r.sens === 'reception') { render(); toast('Données du serveur récupérées ⬇️'); }
    else if (r.fait && r.sens === 'envoi') toast('Données envoyées au serveur ⬆️');
    else if (r.fait) toast('Déjà à jour ✅');
    else toast(r.erreur || 'Synchronisation impossible', r.horsLigne ? 'warn' : 'err');
  });

  $('#restoreLocalBtn').addEventListener('click', async () => {
    const c = await Secours.lire();
    if (!c) return toast('Aucune copie de secours disponible.', 'err');
    confirmAction('Restaurer la copie de secours',
      `La copie du ${new Date(c.quand).toLocaleString('fr-FR')} remplacera vos données actuelles.`,
      () => { try { Store.backup.import(c.contenu); toast('Copie restaurée ✅'); render(); }
              catch (err) { toast(err.message, 'err'); } });
  });
  $('#restoreInput').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const fr = new FileReader();
    fr.onload = () => {
      try { Store.backup.import(fr.result); toast('Sauvegarde restaurée ✅'); render(); }
      catch (err) { toast(err.message, 'err'); }
      e.target.value = '';
    };
    fr.readAsText(file);
  });
  $('#seedBtn').addEventListener('click', () => confirmAction('Charger les données de démo',
    'Vos pousses, chauffeurs et opérations actuels seront remplacés.',
    () => { Store.seedDemo(); toast('Données de démonstration chargées 🎲'); render(); }));

  $('#wipeOpsBtn').addEventListener('click', () => confirmAction('Effacer les opérations',
    'Tous les versements et dépenses seront supprimés. Pousses et chauffeurs sont conservés.',
    () => { Store.backup.wipeOperations(); toast('Opérations effacées'); render(); }));
  $('#wipeAllBtn').addEventListener('click', () => confirmAction('Supprimer mon espace',
    'Votre compte et toutes vos données seront définitivement supprimés.',
    () => { Store.auth.destroyAccount(); location.reload(); }));

  const logout = () => { Store.auth.logout(); location.reload(); };
  $('#logoutBtn').addEventListener('click', logout);
  $('#logoutBtnM').addEventListener('click', logout);

  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return;
    if (e.key === 'v' || e.key === 'V') { e.preventDefault(); openPayment(); }
    if (e.key === 'd' || e.key === 'D') { e.preventDefault(); openExpense(); }
    if (e.key === 'ArrowLeft')  { State.date = shiftDay(State.date, -1); $('#globalDate').value = State.date; render(); }
    if (e.key === 'ArrowRight') { State.date = shiftDay(State.date, 1);  $('#globalDate').value = State.date; render(); }
  });
}

/* ================================================================== PWA */
function setupPWA() {
  const badge = $('#offlineBadge');
  const sync = () => badge.classList.toggle('hidden', navigator.onLine);
  window.addEventListener('online', sync);
  window.addEventListener('offline', sync);
  badge.classList.add('flex');
  sync();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => { $('#swStatus').textContent = '✅ Application disponible hors connexion. Vous pouvez couper internet, tout continue de fonctionner.'; })
      .catch(err => { $('#swStatus').textContent = '⚠️ Mode hors connexion indisponible : ' + err.message; });
  } else {
    $('#swStatus').textContent = '⚠️ Ce navigateur ne gère pas le mode hors connexion.';
  }

  /* Installation sur l'écran d'accueil. */
  let deferred = null;
  const buttons = [$('#installBtn'), $('#installBtn2')];
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    buttons.forEach(b => b && b.classList.remove('hidden'));
  });
  buttons.forEach(b => b && b.addEventListener('click', async () => {
    if (!deferred) return toast('Utilisez le menu du navigateur → « Installer l\'application ».', 'warn');
    deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') toast('Application installée 📲');
    deferred = null;
    buttons.forEach(x => x && x.classList.add('hidden'));
  }));
  window.addEventListener('appinstalled', () => {
    $('#swStatus').textContent = '✅ Application installée sur cet appareil et disponible hors connexion.';
  });
}

/* ============================================================== AUTH UI */
function bindAuth() {
  const modeEnLigne = Store.auth.modeEnLigne();
  $('#authMode').innerHTML = modeEnLigne
    ? '☁️ Compte en ligne — vos données vous suivent d\'un téléphone à l\'autre'
    : '📴 Mode local — les données restent sur cet appareil uniquement';

  /* Bascule visibilité du mot de passe */
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-toggle-pw]');
    if (!btn) return;
    e.preventDefault();
    const input = btn.closest('.relative').querySelector('input');
    input.type = input.type === 'password' ? 'text' : 'password';
  });

  /* Pré-remplir si "Se souvenir de moi" avait été coché */
  const saved = localStorage.getItem('cg_remember');
  if (saved) {
    try {
      const r = JSON.parse(saved);
      const lf = $('#loginForm');
      if (r.email) lf.email.value = r.email;
      if (r.password) lf.password.value = r.password;
      lf.remember.checked = true;
    } catch {}
  }

  $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
    const target = tab.dataset.authtab;
    $$('.auth-tab').forEach(t => {
      const on = t === tab;
      t.classList.toggle('bg-white', on);
      t.classList.toggle('shadow', on);
      t.classList.toggle('text-brand-700', on);
      t.classList.toggle('text-ink-500', !on);
    });
    $('#loginForm').classList.toggle('hidden', target !== 'login');
    $('#registerForm').classList.toggle('hidden', target !== 'register');
  }));

  const showErr = (form, msg) => {
    const p = form.querySelector('[data-err]');
    p.textContent = msg;
    p.classList.toggle('hidden', !msg);
  };

  $('#loginForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const bouton = e.target.querySelector('button[type="submit"],button:not([type])');
    const libelle = bouton.textContent;
    bouton.disabled = true; bouton.textContent = 'Connexion…';
    try {
      showErr(e.target, '');
      await Store.auth.login({ email: fd.get('email'), password: fd.get('password') });
      if (fd.get('remember') === 'on') {
        localStorage.setItem('cg_remember', JSON.stringify({ email: fd.get('email'), password: fd.get('password') }));
      } else {
        localStorage.removeItem('cg_remember');
      }
      boot();
    } catch (err) { showErr(e.target, err.message); }
    finally { bouton.disabled = false; bouton.textContent = libelle; }
  });

  $('#registerForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get('password') !== fd.get('password2')) return showErr(e.target, 'Les deux mots de passe ne correspondent pas.');
    const bouton = e.target.querySelector('button[type="submit"],button:not([type])');
    const libelle = bouton.textContent;
    bouton.disabled = true; bouton.textContent = 'Création en cours…';
    try {
      showErr(e.target, '');
      await Store.auth.register({ name: fd.get('name'), email: fd.get('email'), password: fd.get('password') });
      if (fd.get('demo') === 'on') Store.seedDemo();
      boot();
    } catch (err) { showErr(e.target, err.message); }
    finally { bouton.disabled = false; bouton.textContent = libelle; }
  });

  /* Écran de déverrouillage par code PIN */
  $('#pinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const user = Store.auth.current();
    if (!user) return boot();
    const code = new FormData(e.target).get('code');
    const ok = await Store.pin.verify(user.email, code);
    if (!ok) {
      showErr(e.target, 'Code PIN incorrect');
      e.target.code.value = '';
      e.target.code.focus();
      return;
    }
    Store.pin.deverrouiller();
    e.target.code.value = '';
    showErr(e.target, '');
    boot();
  });

  /* Bouton "changer d'utilisateur" : oublie la session courante et le PIN
     associé pour repartir de l'écran de connexion. */
  $('#pinChangeUser').addEventListener('click', () => {
    Store.pin.deverrouiller();
    Store.auth.logout();
    boot();
  });
}

/* ================================================================= BOOT */
function boot() {
  const user = Store.auth.current();
  if (!user) {
    document.body.classList.add('is-auth');
    $('#authView').classList.remove('hidden');
    $('#pinView').classList.add('hidden');
    $('#appView').classList.add('hidden');
    return;
  }
  /* PIN configuré et session verrouillée : on demande d'abord le PIN. */
  if (Store.pin.exists(user.email) && Store.pin.estVerrouille()) {
    document.body.classList.add('is-auth');
    $('#authView').classList.add('hidden');
    $('#appView').classList.add('hidden');
    $('#pinView').classList.remove('hidden');
    $('#pinEmail').textContent = user.email;
    setTimeout(() => $('#pinForm code, #pinForm [name=code]').focus?.(), 50);
    return;
  }
  document.body.classList.remove('is-auth');
  $('#pinView').classList.add('hidden');
  $('#authView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  Store.pin.deverrouiller();

  $('#sideOwner').textContent = Store.settings().ownerName || user.email;
  State.date = todayISO();                    // toujours la date du téléphone à l'ouverture
  $('#globalDate').value = State.date;
  appliquerPeriode('semaine');
  surveillerChangementDeJour();
  go('dashboard');

  /* Synchronisation : elle se met en route seule si elle est configurée. */
  Sync.surChangement((etat, message) => {
    afficherEtatSync();
    if (etat === 'pret' && /serveur récupérée/i.test(message)) { render(); toast('Données mises à jour depuis le serveur ⬇️'); }
    if (etat === 'conflit') toast('Deux versions différentes — arbitrage requis dans Paramètres.', 'warn');
  });
  Sync.demarrer();

  /* Protection du stockage + rappel de sauvegarde à l'ouverture. */
  demanderStockagePersistant().then(ok => {
    if (ok === false) console.warn('Le navigateur n\'a pas accordé le stockage persistant.');
  });
  Secours.ecrire();

  if (Store.backup.backupOverdue()) {
    const j = Store.backup.daysSinceBackup();
    setTimeout(() => toast(j === null
      ? 'Aucune sauvegarde : allez dans Paramètres pour en faire une.'
      : `Dernière sauvegarde il y a ${j} jours — pensez à en refaire une.`, 'warn'), 1200);
  }
}

bindAuth();
bindGlobal();
buildNav();
setupPWA();

/* Verrouillage automatique : si un PIN est configuré et que l'onglet se ferme
   ou est masqué plus de 60 s, on marque la session comme verrouillée.
   La prochaine ouverture demandera alors le PIN. */
let masqueDepuis = 0;
document.addEventListener('visibilitychange', () => {
  const u = Store.auth.current();
  if (!u || !Store.pin.exists(u.email)) return;
  if (document.hidden) { masqueDepuis = Date.now(); }
  else if (masqueDepuis && Date.now() - masqueDepuis > 60000) {
    Store.pin.verrouiller();
    masqueDepuis = 0;
    boot();
  } else { masqueDepuis = 0; }
});
window.addEventListener('pagehide', () => {
  const u = Store.auth.current();
  if (u && Store.pin.exists(u.email)) Store.pin.verrouiller();
});

boot();
})();
