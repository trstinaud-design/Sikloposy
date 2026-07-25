/* =========================================================================
   SIKLOPOSY — Synchronisation en ligne (optionnelle)

   Principe « local d'abord » : l'application continue de fonctionner
   entièrement hors connexion. La synchronisation est une sécurité en plus,
   jamais une dépendance. Si le réseau manque, la modification est mise en
   attente et repartira toute seule au retour de la connexion.

   Le serveur est un projet Supabase gratuit, créé par le propriétaire.
   Une seule table, un enregistrement par propriétaire :

     create table cyclogest_espaces (
       proprietaire text primary key,
       contenu      jsonb not null,
       maj          bigint not null
     );

   Arbitrage : l'horodatage de dernière modification fait foi. Le plus
   récent gagne, et l'utilisateur est prévenu quand la version distante
   remplace la sienne.
   ========================================================================= */
const Sync = (() => {

  const TABLE = 'cyclogest_espaces';
  let etatCourant = 'inactif';      // inactif | pret | envoi | reception | hors-ligne | erreur
  let dernierMessage = '';
  let minuteur = null;
  let enCours = false;
  let ecouteurs = [];
  let conflit = null;               // divergence en attente d'arbitrage

  const config = () => {
    const srv = Store.serveur.get();
    return { url: srv.url, cle: srv.cle, derniere: (Store.settings().lastSyncAt) || 0 };
  };

  /* La synchronisation s'active d'elle-même dès qu'un serveur est configuré
     et que le propriétaire est connecté à un compte hébergé : il n'y a plus
     de réglage à activer, c'est le compte qui décide. */
  const configuree = () => {
    const c = config();
    const s = Store.auth.current();
    return !!(c.url && c.cle && s && s.mode === 'enligne');
  };

  /* La ligne appartient à l'identifiant du compte serveur : c'est lui que
     les règles de sécurité comparent à `auth.uid()`. */
  const identifiant = () => (Store.auth.current() || {}).userId || '';

  function annoncer(etat, message = '') {
    etatCourant = etat; dernierMessage = message;
    ecouteurs.forEach(f => { try { f(etat, message); } catch {} });
  }

  /* Le jeton du compte remplace la clé publique dans Authorization : c'est
     lui qui prouve au serveur QUI demande, et donc ce qu'il a le droit de voir. */
  const entetes = () => ({
    'apikey': config().cle,
    'Authorization': `Bearer ${Store.auth.jeton() || config().cle}`,
    'Content-Type': 'application/json'
  });

  /* Rejoue l'appel une fois après avoir renouvelé un jeton expiré. */
  async function avecJeton(faire) {
    if (Store.auth.jetonExpire()) { try { await Store.auth.rafraichir(); } catch {} }
    let r = await faire();
    if (r.status === 401) {
      try { await Store.auth.rafraichir(); } catch { throw new Error('Session expirée : reconnectez-vous.'); }
      r = await faire();
    }
    return r;
  }

  /* --------------------------------------------------------- lecture */
  async function lireDistant() {
    const c = config();
    const url = `${c.url}/rest/v1/${TABLE}?proprietaire=eq.${encodeURIComponent(identifiant())}&select=contenu,maj`;
    const r = await avecJeton(() => fetch(url, { headers: entetes() }));
    if (!r.ok) throw new Error(`Lecture refusée par le serveur (${r.status})`);
    const lignes = await r.json();
    return lignes && lignes.length ? lignes[0] : null;
  }

  /* --------------------------------------------------------- écriture */
  async function ecrireDistant() {
    const c = config();
    const corps = {
      proprietaire: identifiant(),
      contenu: Store.sync.exporter(),
      maj: Store.sync.horodatageLocal()
    };
    const r = await avecJeton(() => fetch(`${c.url}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: { ...entetes(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(corps)
    }));
    if (!r.ok) throw new Error(`Envoi refusé par le serveur (${r.status})`);
    return true;
  }

  /* ------------------------------------------------- synchronisation */
  async function synchroniser({ silencieux = false } = {}) {
    if (!configuree()) { annoncer('inactif'); return { fait: false, raison: 'non configurée' }; }
    if (enCours)       return { fait: false, raison: 'déjà en cours' };
    if (conflit)       { annoncer('conflit', 'Arbitrage en attente'); return { fait: false, conflit: true }; }
    if (!navigator.onLine) { annoncer('hors-ligne', 'Sera envoyé au retour du réseau'); return { fait: false, raison: 'hors ligne' }; }

    enCours = true;
    try {
      annoncer('reception');
      const distant = await lireDistant();
      const local = Store.sync.horodatageLocal();

      /* Rien en ligne : on publie ce que l'on a. */
      if (!distant) {
        annoncer('envoi');
        await ecrireDistant();
        Store.settings.update({ lastSyncAt: Date.now() }, true);
        annoncer('pret', 'Première publication effectuée');
        return { fait: true, sens: 'envoi', premier: true };
      }

      const majDistante = Number(distant.maj) || 0;

      if (majDistante > local) {
        /* Le serveur est plus récent. Mais si cet appareil porte des saisies
           jamais envoyées, les écraser ferait disparaître une journée de
           recettes. On ne tranche pas à la place du propriétaire : on signale
           et on garde tout, en attendant son choix. */
        const derniereSync = config().derniere;
        if (local > derniereSync && derniereSync > 0) {
          conflit = { contenuDistant: distant.contenu, majDistante, majLocale: local };
          annoncer('conflit', 'Deux versions différentes : vos saisies locales sont intactes');
          return { fait: false, conflit: true, majDistante, majLocale: local };
        }
        Store.sync.importer(distant.contenu);
        Store.settings.update({ lastSyncAt: Date.now() }, true);
        annoncer('pret', 'Version du serveur récupérée');
        return { fait: true, sens: 'reception', remplace: true };
      }

      if (local > majDistante) {
        annoncer('envoi');
        await ecrireDistant();
        Store.settings.update({ lastSyncAt: Date.now() }, true);
        annoncer('pret', 'Modifications envoyées');
        return { fait: true, sens: 'envoi' };
      }

      Store.settings.update({ lastSyncAt: Date.now() }, true);
      annoncer('pret', 'Déjà à jour');
      return { fait: true, sens: 'aucun' };

    } catch (e) {
      const horsLigne = !navigator.onLine || /Failed to fetch|NetworkError|load failed/i.test(e.message);
      annoncer(horsLigne ? 'hors-ligne' : 'erreur', horsLigne ? 'Réseau indisponible' : e.message);
      return { fait: false, erreur: e.message, horsLigne };
    } finally {
      enCours = false;
    }
  }

  /* Envoi différé : on regroupe les saisies rapprochées en un seul envoi. */
  function planifier(delai = 4000) {
    if (!configuree()) return;
    clearTimeout(minuteur);
    minuteur = setTimeout(() => synchroniser({ silencieux: true }), delai);
  }

  /* --------------------------------------------------------- démarrage */
  function demarrer() {
    window.addEventListener('online', () => { annoncer('pret', 'Réseau retrouvé'); planifier(1000); });
    window.addEventListener('offline', () => annoncer('hors-ligne', 'Les modifications repartiront plus tard'));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) planifier(1500); });
    if (configuree()) synchroniser({ silencieux: true });
    else annoncer('inactif');
    setInterval(() => { if (configuree() && navigator.onLine) synchroniser({ silencieux: true }); }, 300000);
  }

  /* Vérifie que l'adresse et la clé fonctionnent, sans rien modifier. */
  async function tester(url, cle) {
    const propre = (url || '').replace(/\/+$/, '');
    if (!propre || !cle) throw new Error('Renseignez l\'adresse du projet et la clé.');
    if (!/^https:\/\/.+/.test(propre)) throw new Error('L\'adresse doit commencer par https://');

    /* 1. Le service d'authentification répond-il ? */
    const a = await fetch(`${propre}/auth/v1/settings`, { headers: { apikey: cle } })
      .catch(() => { throw new Error('Adresse injoignable. Vérifiez l\'URL du projet.'); });
    if (a.status === 401) throw new Error('Clé refusée. Vérifiez la clé « anon public » du projet.');
    if (!a.ok) throw new Error(`Service d'authentification indisponible (${a.status}).`);

    /* 2. La table existe-t-elle ? Sans compte, l'accès est normalement refusé
       par les règles de sécurité — un 401/403 est donc un bon signe. */
    const t = await fetch(`${propre}/rest/v1/${TABLE}?select=proprietaire&limit=1`,
      { headers: { apikey: cle, Authorization: `Bearer ${cle}` } });
    if (t.status === 404) throw new Error(`La table « ${TABLE} » est introuvable. Exécutez le script SQL du README.`);
    if (!t.ok && t.status !== 401 && t.status !== 403) throw new Error(`Le serveur a répondu ${t.status}.`);
    return true;
  }

  /* --------------------------------------------------- arbitrage
     `garder` vaut 'local' (on republie ce téléphone) ou 'serveur'
     (on adopte la version en ligne, après copie de secours du local). */
  async function resoudreConflit(garder) {
    if (!conflit) return { fait: false, raison: 'aucun conflit' };
    const c = conflit;
    conflit = null;
    try {
      if (garder === 'serveur') {
        const sauvegardeLocale = Store.sync.exporter();
        Store.sync.importer(c.contenuDistant);
        Store.settings.update({ lastSyncAt: Date.now() }, true);
        annoncer('pret', 'Version du serveur adoptée');
        return { fait: true, garde: 'serveur', sauvegardeLocale };
      }
      await ecrireDistant();
      Store.settings.update({ lastSyncAt: Date.now() }, true);
      annoncer('pret', 'Votre version a été publiée');
      return { fait: true, garde: 'local' };
    } catch (e) {
      conflit = c;                       // on ne perd pas le conflit en cas d'échec
      annoncer('erreur', e.message);
      return { fait: false, erreur: e.message };
    }
  }

  return {
    synchroniser, planifier, demarrer, tester, config, configuree, TABLE, resoudreConflit,
    conflit: () => conflit && { majDistante: conflit.majDistante, majLocale: conflit.majLocale },
    etat: () => ({ etat: etatCourant, message: dernierMessage, derniere: config().derniere, conflit: !!conflit }),
    surChangement: f => { ecouteurs.push(f); return () => { ecouteurs = ecouteurs.filter(x => x !== f); }; }
  };
})();

window.Sync = Sync;
