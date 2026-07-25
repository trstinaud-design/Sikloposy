/* =========================================================================
   SIKLOPOSY — Couche de données (localStorage)

   Modèle (v2) — trois entités distinctes :
     • vehicles     : le cyclopousse, bien durable. Porte les pannes et l'objectif.
     • drivers      : la personne. Porte l'identité, la caution, le contrat.
     • assignments  : qui conduit quoi, du … au … (historique des affectations).

   C'est cette séparation qui permet à l'historique des pannes de rester
   attaché au véhicule quand le chauffeur change, et au bilan d'un chauffeur
   de le suivre s'il change de pousse.

   Toutes les écritures passent par Store.* : un seul point de persistance.
   ========================================================================= */
const Store = (() => {

  const SCHEMA  = 3;
  const K_USERS   = 'cg_users';
  const K_SESSION = 'cg_session';
  const K_DATA    = uid => `cg_data_${uid}`;

  /* ---------- utilitaires bas niveau ---------- */
  const read = (k, fallback) => {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  };
  const write = (k, v) => {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        alert("Espace de stockage saturé. Exportez une sauvegarde puis allégez les photos des chauffeurs.");
      }
      console.error('Écriture impossible', e);
      return false;
    }
  };

  const rid = () => (crypto.randomUUID ? crypto.randomUUID()
                     : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8));

  /* Dates locales : toISOString() décalerait d'un jour hors UTC. */
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = () => iso(new Date());
  const shift = (isoDate, n) => { const d = new Date(isoDate + 'T00:00:00'); d.setDate(d.getDate() + n); return iso(d); };
  const between = (d, from, to) => d >= from && d <= to;

  /* Hachage SHA-256 salé — suffisant pour un stockage local, ce n'est pas un serveur. */
  async function hash(password, salt) {
    const buf = new TextEncoder().encode(salt + '::' + password);
    const dig = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(dig)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /* ---------- schéma d'un espace de données ---------- */
  const emptySpace = () => ({
    version: SCHEMA,
    settings: {
      currency: 'Ar',
      dailyTarget: 5000,
      ownerName: '',
      strictTarget: true,     // n'inclure dans l'objectif que les pousses productifs
      backupEmail: '',        // adresse vers laquelle envoyer les sauvegardes
      lastBackupAt: 0,        // horodatage du dernier export réussi
      backupEveryDays: 7,     // seuil du rappel de sauvegarde
      syncUrl: '',            // adresse du projet Supabase
      syncKey: '',            // clé publique « anon »
      syncEnabled: false,
      lastSyncAt: 0           // dernière synchronisation réussie
    },
    localUpdatedAt: 0,        // horodatage de la dernière modification locale
    vehicles: [],
    drivers: [],
    assignments: [],
    payments: [],
    expenses: [],
    movements: []             // mouvements de coffre : retraits et apports
  });

  /* =====================================================================
     MIGRATION v1 → v2
     En v1 le cyclopousse n'était qu'un champ texte du chauffeur. On en fait
     une entité, et on crée l'affectation correspondante. Rien n'est perdu.
     ===================================================================== */
  function migrate(sp) {
    if (sp.version >= SCHEMA) return sp;

    /* v2 → v3 : arrivée du coffre. Rien à convertir, on ouvre le registre. */
    if ((sp.version || 1) >= 2) {
      sp.movements = sp.movements || [];
      sp.version = SCHEMA;
      return sp;
    }

    sp.vehicles = sp.vehicles || [];
    sp.assignments = sp.assignments || [];
    const byCode = new Map();

    (sp.drivers || []).forEach(d => {
      const code = (d.cycloId || '').trim();
      if (!code) return;

      let v = byCode.get(code);
      if (!v) {
        v = {
          id: rid(), code,
          status: d.vehicleStatus || 'service',
          dailyTarget: (d.dailyTarget === undefined ? null : d.dailyTarget),
          acquiredAt: '', note: '', createdAt: Date.now()
        };
        sp.vehicles.push(v);
        byCode.set(code, v);
      }

      /* Date de début : contrat, sinon premier versement connu, sinon aujourd'hui. */
      const firstPay = (sp.payments || [])
        .filter(p => p.driverId === d.id).map(p => p.date).sort()[0];
      sp.assignments.push({
        id: rid(), vehicleId: v.id, driverId: d.id,
        from: d.contractStart || firstPay || today(), to: null,
        createdAt: Date.now()
      });

      d.__vehicleId = v.id;
      delete d.cycloId; delete d.vehicleStatus; delete d.dailyTarget;
    });

    const vehicleOfDriver = id => ((sp.drivers || []).find(d => d.id === id) || {}).__vehicleId || null;
    (sp.payments || []).forEach(p => { if (!p.vehicleId) p.vehicleId = vehicleOfDriver(p.driverId); });
    (sp.expenses || []).forEach(e => { if (!e.vehicleId) e.vehicleId = vehicleOfDriver(e.driverId); });
    (sp.drivers  || []).forEach(d => delete d.__vehicleId);

    if (sp.settings && 'excludeInactive' in sp.settings) {
      sp.settings.strictTarget = sp.settings.excludeInactive;
      delete sp.settings.excludeInactive;
    }
    sp.movements = sp.movements || [];
    sp.version = SCHEMA;
    return sp;
  }

  /* ---------- état courant ---------- */
  let session = read(K_SESSION, null);
  let space   = null;

  const loadSpace = () => {
    if (!session) { space = null; return; }
    space = Object.assign(emptySpace(), read(K_DATA(session.userId), {}));
    space.settings = Object.assign(emptySpace().settings, space.settings || {});
    const before = space.version;
    migrate(space);
    if (before !== space.version) persist();       // migration écrite une seule fois
  };
  /* Toute écriture date l'espace : c'est ce qui permet à la synchronisation
     de savoir qui, du téléphone ou du serveur, détient la version récente.
     `silencieux` sert aux écritures qui ne sont pas des modifications
     métier (import distant, horodatage de synchro) pour ne pas boucler. */
  const persist = (silencieux = false) => {
    if (!session) return false;
    if (!silencieux) space.localUpdatedAt = Date.now();
    const ok = write(K_DATA(session.userId), space);
    if (ok && !silencieux && typeof window !== 'undefined' && window.Sync) window.Sync.planifier();
    return ok;
  };

  loadSpace();

  /* =====================================================================
     CONFIGURATION DU SERVEUR (au niveau de l'appareil, hors espace de données)
     Deux sources : ce qui a été saisi dans les Paramètres, sinon config.js
     livré avec l'application — c'est lui qui permet, sur un téléphone neuf,
     de se connecter sans rien avoir à ressaisir.
     ===================================================================== */
  const K_SERVEUR = 'cg_serveur';

  const serveur = {
    get() {
      const saisi = read(K_SERVEUR, null);
      const livre = (typeof window !== 'undefined' && window.CYCLOGEST_CONFIG) || {};
      const url = (saisi?.supabaseUrl || livre.supabaseUrl || '').replace(/\/+$/, '');
      const cle = saisi?.supabaseKey || livre.supabaseKey || '';
      return { url, cle };
    },
    set({ url, cle }) { write(K_SERVEUR, { supabaseUrl: (url || '').replace(/\/+$/, ''), supabaseKey: cle || '' }); },
    disponible() { const c = serveur.get(); return !!(c.url && c.cle); }
  };

  /* =====================================================================
     AUTHENTIFICATION
     Deux modes. « En ligne » quand un serveur est configuré : le compte vit
     sur le serveur, donc il suit le propriétaire d'un téléphone à l'autre.
     « Local » sinon : compte propre à cet appareil, comme auparavant.
     Une fois connecté en ligne, la session reste utilisable hors réseau.
     ===================================================================== */
  async function appelAuth(chemin, corps) {
    const c = serveur.get();
    const r = await fetch(`${c.url}/auth/v1/${chemin}`, {
      method: 'POST',
      headers: { apikey: c.cle, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const m = (data.error_description || data.msg || data.message || '').toLowerCase();
      if (m.includes('already registered') || m.includes('already been registered'))
        throw new Error('Un compte existe déjà avec cet e-mail.');
      if (m.includes('invalid login')) throw new Error('E-mail ou mot de passe incorrect.');
      if (m.includes('email not confirmed')) throw new Error('Compte non confirmé : ouvrez le lien reçu par e-mail.');
      if (m.includes('password')) throw new Error('Mot de passe trop court (6 caractères minimum).');
      throw new Error(data.error_description || data.msg || `Le serveur a répondu ${r.status}.`);
    }
    return data;
  }

  const sessionDepuis = (data, email, name) => ({
    mode: 'enligne',
    userId: data.user?.id || data.id,
    email: (data.user?.email || email || '').toLowerCase(),
    name: name || '',
    token: data.access_token || '',
    refresh: data.refresh_token || '',
    expireA: Date.now() + ((data.expires_in || 3600) * 1000)
  });

  const auth = {
    current: () => session,
    modeEnLigne: () => serveur.disponible(),
    serveur,

    async register({ name, email, password }) {
      email = email.trim().toLowerCase();

      if (serveur.disponible()) {
        const data = await appelAuth('signup', { email, password, data: { nom: name } });
        /* Sans session renvoyée, Supabase attend une confirmation par e-mail. */
        if (!data.access_token) {
          throw new Error("Compte créé. Ouvrez le lien de confirmation reçu par e-mail, puis connectez-vous.");
        }
        session = sessionDepuis(data, email, name);
        write(K_SESSION, session);
        const fresh = emptySpace();
        fresh.settings.ownerName = (name || '').trim();
        write(K_DATA(session.userId), fresh);
        loadSpace();
        return session;
      }

      const users = read(K_USERS, []);
      if (users.some(u => u.email === email)) throw new Error("Un compte existe déjà avec cet email.");
      const salt = rid();
      const user = { id: rid(), name: (name || '').trim(), email, salt, pass: await hash(password, salt), createdAt: Date.now() };
      users.push(user);
      write(K_USERS, users);
      const fresh = emptySpace();
      fresh.settings.ownerName = user.name;
      write(K_DATA(user.id), fresh);
      session = { mode: 'local', userId: user.id, email, name: user.name };
      write(K_SESSION, session);
      loadSpace();
      return session;
    },

    async login({ email, password }) {
      email = email.trim().toLowerCase();

      if (serveur.disponible()) {
        try {
          const data = await appelAuth('token?grant_type=password', { email, password });
          session = sessionDepuis(data, email);
          write(K_SESSION, session);
          loadSpace();
          return session;
        } catch (e) {
          /* Hors réseau, on accepte de rouvrir une session déjà ouverte sur
             cet appareil : l'application doit rester utilisable sans internet. */
          const ancienne = read(K_SESSION, null);
          const reseau = /failed to fetch|networkerror|load failed/i.test(e.message);
          if (reseau && ancienne && ancienne.email === email && ancienne.mode === 'enligne') {
            session = ancienne;
            loadSpace();
            return session;
          }
          if (reseau) throw new Error("Pas de connexion, et aucune session enregistrée sur cet appareil pour cet e-mail.");
          throw e;
        }
      }

      const user = read(K_USERS, []).find(u => u.email === email);
      if (!user) throw new Error("Aucun compte ne correspond à cet email.");
      if (await hash(password, user.salt) !== user.pass) throw new Error("Mot de passe incorrect.");
      session = { mode: 'local', userId: user.id, email, name: user.name };
      write(K_SESSION, session);
      loadSpace();
      return session;
    },

    /* Renouvelle le jeton d'accès arrivé à expiration. */
    async rafraichir() {
      if (!session || session.mode !== 'enligne' || !session.refresh) return false;
      const data = await appelAuth('token?grant_type=refresh_token', { refresh_token: session.refresh });
      session = { ...session, token: data.access_token, refresh: data.refresh_token,
                  expireA: Date.now() + ((data.expires_in || 3600) * 1000) };
      write(K_SESSION, session);
      return true;
    },

    jeton: () => (session && session.mode === 'enligne' ? session.token : ''),
    jetonExpire: () => !!session && session.mode === 'enligne' && Date.now() > (session.expireA || 0) - 60000,

    logout() { localStorage.removeItem(K_SESSION); session = null; space = null; },

    destroyAccount() {
      if (!session) return;
      localStorage.removeItem(K_DATA(session.userId));
      if (session.mode !== 'enligne')
        write(K_USERS, read(K_USERS, []).filter(u => u.id !== session.userId));
      auth.logout();
    },

    /* Reprend les données d'un ancien compte local vers le compte en ligne. */
    espacesLocaux() {
      return read(K_USERS, []).map(u => {
        const esp = read(K_DATA(u.id), null);
        if (!esp) return null;
        const n = (esp.vehicles || []).length + (esp.drivers || []).length + (esp.payments || []).length;
        return n ? { id: u.id, email: u.email, nom: u.name, elements: n } : null;
      }).filter(Boolean);
    },

    importerEspaceLocal(id) {
      const esp = read(K_DATA(id), null);
      if (!esp) throw new Error('Espace local introuvable.');
      space = Object.assign(emptySpace(), esp);
      space.settings = Object.assign(emptySpace().settings, esp.settings || {});
      migrate(space);
      persist();
      return true;
    }
  };

  /* =====================================================================
     CODE PIN (déverrouillage rapide)
     Une fois le PIN configuré, l'application se rouvre par un code court
     au lieu de retaper l'e-mail et le mot de passe complet. Le PIN est
     stocké haché + salé, comme les mots de passe. La session reste
     conservée en local ; le PIN sert de « clé » à l'ouverture.
     ===================================================================== */
  const K_PIN = (email) => 'cg_pin_' + email.toLowerCase();
  const K_LOCKED = 'cg_locked';

  const pin = {
    exists(email) { return !!read(K_PIN(email), null); },
    async set(email, code) {
      if (!/^\d{4,8}$/.test(code)) throw new Error('Le PIN doit contenir de 4 à 8 chiffres.');
      const salt = rid();
      write(K_PIN(email), { salt, hash: await hash(code, salt), createdAt: Date.now() });
    },
    clear(email) { localStorage.removeItem(K_PIN(email)); },
    async verify(email, code) {
      const rec = read(K_PIN(email), null);
      if (!rec) return false;
      return (await hash(code, rec.salt)) === rec.hash;
    },
    verrouiller() { localStorage.setItem(K_LOCKED, '1'); },
    deverrouiller() { localStorage.removeItem(K_LOCKED); },
    estVerrouille() { return localStorage.getItem(K_LOCKED) === '1'; }
  };

  /* =====================================================================
     PARAMÈTRES
     ===================================================================== */
  const settings = {
    get: () => ({ ...space.settings }),
    update(patch, silencieux = false) {
      Object.assign(space.settings, patch);
      persist(silencieux);
      return settings.get();
    }
  };

  /* Accès réservé à la synchronisation : lire/écrire l'espace entier. */
  const sync = {
    horodatageLocal: () => space.localUpdatedAt || 0,
    exporter: () => ({ version: SCHEMA, localUpdatedAt: space.localUpdatedAt || 0, ...space }),

    /* Remplace l'espace par la version distante, sans redéclencher d'envoi. */
    importer(distant) {
      if (!distant || (!Array.isArray(distant.vehicles) && !Array.isArray(distant.drivers)))
        throw new Error('Contenu distant invalide.');
      const reglagesLocaux = { ...space.settings };
      space = Object.assign(emptySpace(), distant);
      space.settings = Object.assign(emptySpace().settings, distant.settings || {});
      /* Les identifiants de synchronisation restent propres à cet appareil. */
      space.settings.syncUrl = reglagesLocaux.syncUrl;
      space.settings.syncKey = reglagesLocaux.syncKey;
      space.settings.syncEnabled = reglagesLocaux.syncEnabled;
      migrate(space);
      space.localUpdatedAt = distant.localUpdatedAt || Date.now();
      persist(true);
    }
  };

  /* =====================================================================
     CYCLOPOUSSES
     ===================================================================== */
  const VEHICLE_DEFAULTS = {
    code: '', status: 'service', dailyTarget: null,
    acquiredAt: '', photo: '', note: ''
  };

  const vehicles = {
    all: () => space.vehicles.slice(),
    get: id => space.vehicles.find(v => v.id === id) || null,
    byCode: code => space.vehicles.find(v => v.code === code) || null,

    /* Triés par numéro : « Cyclo #2 » avant « Cyclo #10 ». */
    sorted: () => space.vehicles.slice()
      .sort((a, b) => (a.code || '').localeCompare(b.code || '', 'fr', { numeric: true })),

    save(data) {
      if (data.id) {
        const i = space.vehicles.findIndex(v => v.id === data.id);
        if (i < 0) throw new Error('Cyclopousse introuvable');
        space.vehicles[i] = { ...space.vehicles[i], ...data, updatedAt: Date.now() };
        persist();
        return space.vehicles[i];
      }
      const v = { ...VEHICLE_DEFAULTS, ...data, id: rid(), createdAt: Date.now() };
      space.vehicles.push(v);
      persist();
      return v;
    },

    /* Supprime le pousse, ses affectations et ses opérations. Les chauffeurs
       restent : ils existent indépendamment du véhicule. */
    remove(id) {
      space.vehicles    = space.vehicles.filter(v => v.id !== id);
      space.assignments = space.assignments.filter(a => a.vehicleId !== id);
      space.payments    = space.payments.filter(p => p.vehicleId !== id);
      space.expenses    = space.expenses.filter(e => e.vehicleId !== id);
      persist();
    },

    /* Objectif du pousse s'il est défini, sinon la valeur globale. */
    target(v) {
      const t = v && v.dailyTarget;
      return (t === null || t === undefined || t === '') ? Number(space.settings.dailyTarget) || 0 : Number(t);
    },

    /* Un pousse ne rapporte que s'il roule ET qu'un chauffeur actif le conduit. */
    productive(v, date = today()) {
      if (!v || v.status !== 'service') return false;
      const d = assignments.driverOn(v.id, date);
      return !!d && d.status === 'actif';
    }
  };

  /* =====================================================================
     CHAUFFEURS
     ===================================================================== */
  const DRIVER_DEFAULTS = {
    firstName: '', lastName: '', cin: '', phone: '', photo: '',
    status: 'actif', caution: 0, contractStart: '', note: ''
  };

  const drivers = {
    all: () => space.drivers.slice(),
    get: id => space.drivers.find(d => d.id === id) || null,
    sorted: () => space.drivers.slice()
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'fr')),

    /* Chauffeurs sans pousse à cette date — disponibles pour une affectation. */
    unassigned: (date = today()) =>
      space.drivers.filter(d => d.status === 'actif' && !assignments.vehicleOn(d.id, date)),

    save(data) {
      if (data.id) {
        const i = space.drivers.findIndex(d => d.id === data.id);
        if (i < 0) throw new Error('Chauffeur introuvable');
        space.drivers[i] = { ...space.drivers[i], ...data, updatedAt: Date.now() };
        persist();
        return space.drivers[i];
      }
      const d = { ...DRIVER_DEFAULTS, ...data, id: rid(), createdAt: Date.now() };
      space.drivers.push(d);
      persist();
      return d;
    },

    /* Le chauffeur part : ses affectations se clôturent, les pousses restent. */
    remove(id) {
      space.drivers     = space.drivers.filter(d => d.id !== id);
      space.assignments = space.assignments.filter(a => a.driverId !== id);
      space.payments    = space.payments.filter(p => p.driverId !== id);
      persist();
    }
  };

  /* =====================================================================
     AFFECTATIONS  (un pousse = un chauffeur à la fois)
     ===================================================================== */
  const assignments = {
    all: () => space.assignments.slice(),

    forVehicle: id => space.assignments.filter(a => a.vehicleId === id)
      .sort((a, b) => b.from.localeCompare(a.from)),
    forDriver: id => space.assignments.filter(a => a.driverId === id)
      .sort((a, b) => b.from.localeCompare(a.from)),

    /* L'affectation en vigueur à une date donnée (null si le pousse est libre).
       En cas de chevauchement le même jour, la plus récente l'emporte. */
    on: (vehicleId, date = today()) => space.assignments
      .filter(a => a.vehicleId === vehicleId && a.from <= date && (!a.to || date <= a.to))
      .sort((a, b) => b.from.localeCompare(a.from) || b.createdAt - a.createdAt)[0] || null,

    driverOn(vehicleId, date = today()) {
      const a = assignments.on(vehicleId, date);
      return a ? drivers.get(a.driverId) : null;
    },

    vehicleOn(driverId, date = today()) {
      const a = space.assignments
        .filter(x => x.driverId === driverId && x.from <= date && (!x.to || date <= x.to))
        .sort((a, b) => b.from.localeCompare(a.from) || b.createdAt - a.createdAt)[0];
      return a ? vehicles.get(a.vehicleId) : null;
    },

    /* Confie un pousse à un chauffeur à partir de `from`.
       Clôture l'affectation en cours du pousse ET celle du chauffeur
       (il ne peut conduire qu'un seul pousse à la fois). */
    assign(vehicleId, driverId, from = today()) {
      const veille = shift(from, -1);
      /* Une affectation qui commencerait après sa propre clôture n'aura duré
         aucun jour : on la retire au lieu de la laisser chevaucher. */
      const close = list => list.forEach(a => {
        if (a.from > veille) space.assignments = space.assignments.filter(x => x.id !== a.id);
        else a.to = veille;
      });

      close(space.assignments.filter(a => !a.to && a.vehicleId === vehicleId));
      close(space.assignments.filter(a => !a.to && a.driverId === driverId));

      const a = { id: rid(), vehicleId, driverId, from, to: null, createdAt: Date.now() };
      space.assignments.push(a);
      persist();
      return a;
    },

    /* Libère le pousse : plus de chauffeur à partir du lendemain de `date`. */
    release(vehicleId, date = today()) {
      space.assignments.filter(a => !a.to && a.vehicleId === vehicleId).forEach(a => {
        if (a.from > date) space.assignments = space.assignments.filter(x => x.id !== a.id);
        else a.to = date;
      });
      persist();
    },

    remove(id) { space.assignments = space.assignments.filter(a => a.id !== id); persist(); }
  };

  /* =====================================================================
     VERSEMENTS  (rattachés au pousse ET au chauffeur du moment)
     ===================================================================== */
  const payments = {
    all: () => space.payments.slice(),
    byDate: date => space.payments.filter(p => p.date === date),
    byVehicle: id => space.payments.filter(p => p.vehicleId === id),
    byDriver: id => space.payments.filter(p => p.driverId === id),
    find: (vehicleId, date) =>
      space.payments.find(p => p.vehicleId === vehicleId && p.date === date) || null,

    /* Un seul versement par pousse et par jour : on remplace s'il existe. */
    save({ id, vehicleId, driverId, date, amount, status, note }) {
      /* Le chauffeur est figé au moment de la saisie : le bilan reste juste
         même si le pousse change de mains plus tard. */
      const drv = driverId || (assignments.driverOn(vehicleId, date) || {}).id || null;
      const rec = {
        vehicleId, driverId: drv, date,
        amount: Number(amount) || 0,
        status: status || 'paye',
        note: note || '',
        updatedAt: Date.now()
      };
      const existing = id ? space.payments.find(p => p.id === id) : payments.find(vehicleId, date);
      if (existing) { Object.assign(existing, rec); persist(); return existing; }
      const p = { ...rec, id: rid(), createdAt: Date.now() };
      space.payments.push(p);
      persist();
      return p;
    },

    remove(id) { space.payments = space.payments.filter(p => p.id !== id); persist(); }
  };

  /* =====================================================================
     DÉPENSES & PANNES  (rattachées au POUSSE — elles lui survivent)
     ===================================================================== */
  const CATEGORIES = [
    { id: 'crevaison',   icon: '🚲', label: 'Crevaison / Pneumatique', hint: 'chambre à air, pneu' },
    { id: 'mecanique',   icon: '⚙️', label: 'Mécanique & Chaîne',      hint: 'chaîne, pignon, pédalier' },
    { id: 'freinage',    icon: '🛑', label: 'Freinage',                hint: 'câbles, patins, garnitures' },
    { id: 'roue',        icon: '🛞', label: 'Roue & Rayons',           hint: 'voilage, roulements' },
    { id: 'carrosserie', icon: '🎨', label: 'Carrosserie & Structure', hint: 'soudure, bâche, siège' },
    { id: 'entretien',   icon: '🛠️', label: 'Entretien / Vidange',     hint: 'graissage, révision' },
    { id: 'autre',       icon: '📝', label: 'Autre dépense',           hint: 'divers' }
  ];
  const catOf = id => CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

  const expenses = {
    all: () => space.expenses.slice(),
    byDate: date => space.expenses.filter(e => e.date === date),
    byVehicle: id => space.expenses.filter(e => e.vehicleId === id),

    save({ id, vehicleId, date, amount, category, description, repairer, immobilize }) {
      const rec = {
        vehicleId,
        driverId: (assignments.driverOn(vehicleId, date) || {}).id || null,  // qui conduisait alors
        date,
        amount: Number(amount) || 0,
        category: category || 'autre',
        description: description || '',
        repairer: repairer || '',
        updatedAt: Date.now()
      };
      let saved;
      if (id) {
        const i = space.expenses.findIndex(e => e.id === id);
        if (i < 0) throw new Error('Dépense introuvable');
        space.expenses[i] = saved = { ...space.expenses[i], ...rec };
      } else {
        saved = { ...rec, id: rid(), createdAt: Date.now() };
        space.expenses.push(saved);
      }
      if (immobilize && vehicleId) {
        const v = vehicles.get(vehicleId);
        if (v) v.status = 'reparation';
      }
      persist();
      return saved;
    },

    remove(id) { space.expenses = space.expenses.filter(e => e.id !== id); persist(); }
  };

  /* =====================================================================
     COFFRE / CAISSE
     Le coffre suit l'argent réellement disponible, ce qui n'est pas la même
     chose que la recette : la recette mesure la performance d'exploitation,
     le coffre mesure ce qu'il reste après les retraits du propriétaire.
     ===================================================================== */
  const MOVEMENT_CATEGORIES = {
    retrait: [
      { id: 'pieces',    icon: '🔩', label: 'Achat de pièces / stock' },
      { id: 'salaire',   icon: '👷', label: 'Salaire / main d\'œuvre' },
      { id: 'loyer',     icon: '🏠', label: 'Loyer / emplacement' },
      { id: 'transport', icon: '⛽', label: 'Transport / carburant' },
      { id: 'taxe',      icon: '🧾', label: 'Taxe / patente / assurance' },
      { id: 'personnel', icon: '👤', label: 'Usage personnel' },
      { id: 'caution_rendue', icon: '↩️', label: 'Caution rendue à un chauffeur' },
      { id: 'autre_sortie',   icon: '📤', label: 'Autre sortie' }
    ],
    apport: [
      { id: 'apport_perso',  icon: '💵', label: 'Apport personnel' },
      { id: 'pret',          icon: '🏦', label: 'Prêt reçu' },
      { id: 'caution_recue', icon: '🔒', label: 'Caution reçue d\'un chauffeur' },
      { id: 'vente',         icon: '🏷️', label: 'Vente (pousse, pièce…)' },
      { id: 'autre_entree',  icon: '📥', label: 'Autre entrée' }
    ]
  };
  const ALL_MOVEMENT_CATS = [...MOVEMENT_CATEGORIES.retrait, ...MOVEMENT_CATEGORIES.apport];
  const movCatOf = id => ALL_MOVEMENT_CATS.find(c => c.id === id) || { icon: '•', label: id || '—' };

  const movements = {
    all: () => space.movements.slice(),
    get: id => space.movements.find(m => m.id === id) || null,
    byDate: date => space.movements.filter(m => m.date === date),

    save({ id, type, date, amount, category, beneficiary, note }) {
      const rec = {
        type: type === 'apport' ? 'apport' : 'retrait',
        date,
        amount: Math.abs(Number(amount)) || 0,
        category: category || (type === 'apport' ? 'autre_entree' : 'autre_sortie'),
        beneficiary: beneficiary || '',
        note: note || '',
        updatedAt: Date.now()
      };
      if (id) {
        const i = space.movements.findIndex(m => m.id === id);
        if (i < 0) throw new Error('Mouvement introuvable');
        space.movements[i] = { ...space.movements[i], ...rec };
        persist();
        return space.movements[i];
      }
      const m = { ...rec, id: rid(), createdAt: Date.now() };
      space.movements.push(m);
      persist();
      return m;
    },

    remove(id) { space.movements = space.movements.filter(m => m.id !== id); persist(); }
  };

  /* =====================================================================
     ANALYTIQUE
     ===================================================================== */
  const stats = {
    /* Bilan d'une journée, une ligne par cyclopousse. */
    day(date) {
      const pays = payments.byDate(date);
      const exps = expenses.byDate(date);
      const strict = space.settings.strictTarget;

      const rows = vehicles.sorted().map(v => {
        const driver  = assignments.driverOn(v.id, date);
        const payment = pays.find(p => p.vehicleId === v.id) || null;
        const expense = exps.filter(e => e.vehicleId === v.id).reduce((s, e) => s + e.amount, 0);
        const target  = vehicles.target(v);
        const amount  = payment ? payment.amount : 0;
        const active  = vehicles.productive(v, date);

        let status;
        if (payment && amount >= target) status = 'paye';
        else if (payment && amount > 0)  status = 'partiel';
        else if (!active)                status = 'inactif';   // en panne ou sans chauffeur
        else                             status = 'attente';

        let reason = '';
        if (!active) {
          if (v.status !== 'service') reason = v.status === 'reparation' ? 'En réparation' : 'Immobilisé';
          else if (!driver)           reason = 'Aucun chauffeur affecté';
          else                        reason = 'Chauffeur inactif';
        }

        return { vehicle: v, driver, payment, amount, target,
                 gap: payment ? amount - target : 0, expense, status, active, reason };
      });

      const gross = pays.reduce((s, p) => s + p.amount, 0);
      const spent = exps.reduce((s, e) => s + e.amount, 0);

      return {
        date, gross, spent, net: gross - spent,
        expected: rows.filter(r => !strict || r.active).reduce((s, r) => s + r.target, 0),
        rows,
        paid:   rows.filter(r => r.status === 'paye'),
        unpaid: rows.filter(r => r.status === 'attente' || r.status === 'partiel'),
        idle:   rows.filter(r => r.status === 'inactif'),
        expenses: exps
      };
    },

    /* Série jour par jour entre deux dates (bornes incluses). */
    range(from, to) {
      const out = [];
      const cur = new Date(from + 'T00:00:00');
      const end = new Date(to + 'T00:00:00');
      let guard = 0;
      while (cur <= end && guard++ < 2000) {
        const key = iso(cur);
        const gross = space.payments.filter(p => p.date === key).reduce((s, p) => s + p.amount, 0);
        const spent = space.expenses.filter(e => e.date === key).reduce((s, e) => s + e.amount, 0);
        out.push({ date: key, gross, spent, net: gross - spent });
        cur.setDate(cur.getDate() + 1);
      }
      return out;
    },

    /* Rendement de chaque pousse sur une période. */
    perVehicle(from, to) {
      const days = stats.range(from, to).length;
      return vehicles.sorted().map(v => {
        const pays = space.payments.filter(p => p.vehicleId === v.id && between(p.date, from, to));
        const exps = space.expenses.filter(e => e.vehicleId === v.id && between(e.date, from, to));
        const collected = pays.reduce((s, p) => s + p.amount, 0);
        const spent     = exps.reduce((s, e) => s + e.amount, 0);
        const fullyPaid = pays.filter(p => p.status === 'paye').length;
        return {
          vehicle: v, driver: assignments.driverOn(v.id, to),
          collected, spent, net: collected - spent,
          expected: vehicles.target(v) * days,
          breakdowns: exps.length,
          missedDays: Math.max(0, days - fullyPaid),
          reliability: days ? Math.round((fullyPaid / days) * 100) : 0
        };
      });
    },

    /* Bilan de chaque chauffeur sur une période (indépendant du pousse conduit). */
    perDriver(from, to) {
      const days = stats.range(from, to).length;
      return drivers.sorted().map(d => {
        const pays = space.payments.filter(p => p.driverId === d.id && between(p.date, from, to));
        const exps = space.expenses.filter(e => e.driverId === d.id && between(e.date, from, to));
        const collected = pays.reduce((s, p) => s + p.amount, 0);
        const fullyPaid = pays.filter(p => p.status === 'paye').length;
        /* On ne compte que les jours où il avait effectivement un pousse. */
        const worked = stats.range(from, to)
          .filter(x => assignments.vehicleOn(d.id, x.date)).length;
        return {
          driver: d, vehicle: assignments.vehicleOn(d.id, to),
          collected, spent: exps.reduce((s, e) => s + e.amount, 0),
          workedDays: worked,
          missedDays: Math.max(0, worked - fullyPaid),
          breakdowns: exps.length,
          reliability: worked ? Math.round((fullyPaid / worked) * 100) : 0
        };
      });
    },

    /* Solde du coffre à une date donnée (tout ce qui s'est passé jusque-là). */
    cashBalance(upTo = today()) {
      const enc = space.payments .filter(p => p.date <= upTo).reduce((s, p) => s + p.amount, 0);
      const rep = space.expenses .filter(e => e.date <= upTo).reduce((s, e) => s + e.amount, 0);
      const ret = space.movements.filter(m => m.date <= upTo && m.type === 'retrait').reduce((s, m) => s + m.amount, 0);
      const app = space.movements.filter(m => m.date <= upTo && m.type === 'apport').reduce((s, m) => s + m.amount, 0);
      return { encaisse: enc, reparations: rep, retraits: ret, apports: app,
               solde: enc - rep - ret + app };
    },

    /* Registre de caisse sur une période : tous les flux, du plus récent au plus ancien. */
    cashLedger(from, to) {
      const dans = d => (!from || d >= from) && (!to || d <= to);
      const lignes = [];

      space.payments.filter(p => dans(p.date)).forEach(p => {
        const v = vehicles.get(p.vehicleId), d = drivers.get(p.driverId);
        lignes.push({ id: p.id, date: p.date, sens: 1, montant: p.amount, genre: 'versement',
                      icon: '💰', libelle: 'Versement ' + (v ? v.code : '—'),
                      detail: d ? `${d.lastName} ${d.firstName}` : '', modifiable: false });
      });
      space.expenses.filter(e => dans(e.date)).forEach(e => {
        const v = vehicles.get(e.vehicleId), c = catOf(e.category);
        lignes.push({ id: e.id, date: e.date, sens: -1, montant: e.amount, genre: 'reparation',
                      icon: c.icon, libelle: c.label,
                      detail: (v ? v.code : '—') + (e.repairer ? ' · ' + e.repairer : ''), modifiable: false });
      });
      space.movements.filter(m => dans(m.date)).forEach(m => {
        const c = movCatOf(m.category);
        lignes.push({ id: m.id, date: m.date, sens: m.type === 'apport' ? 1 : -1, montant: m.amount,
                      genre: m.type, icon: c.icon, libelle: c.label,
                      detail: [m.beneficiary, m.note].filter(Boolean).join(' · '), modifiable: true });
      });

      lignes.sort((a, b) => b.date.localeCompare(a.date) || b.genre.localeCompare(a.genre));

      const somme = g => lignes.filter(l => l.genre === g).reduce((s, l) => s + l.montant, 0);
      return {
        lignes,
        encaisse: somme('versement'), reparations: somme('reparation'),
        retraits: somme('retrait'),   apports: somme('apport'),
        variation: lignes.reduce((s, l) => s + l.sens * l.montant, 0),
        soldeFin: stats.cashBalance(to).solde
      };
    },

    /* Retraits regroupés par motif, pour voir où part l'argent. */
    withdrawalsByCategory(from, to) {
      const dans = d => (!from || d >= from) && (!to || d <= to);
      const par = {};
      space.movements.filter(m => m.type === 'retrait' && dans(m.date)).forEach(m => {
        (par[m.category] ??= { count: 0, total: 0 }).count++;
        par[m.category].total += m.amount;
      });
      return par;
    },

    /* Coût et fréquence des pannes, par catégorie et par pousse. */
    maintenance(from, to) {
      const exps = space.expenses.filter(e => !from || between(e.date, from, to));
      const byCat = {}, byVehicle = {};
      exps.forEach(e => {
        (byCat[e.category] ??= { count: 0, total: 0 }).count++;
        byCat[e.category].total += e.amount;
        (byVehicle[e.vehicleId] ??= { count: 0, total: 0 }).count++;
        byVehicle[e.vehicleId].total += e.amount;
      });
      return { expenses: exps, byCat, byVehicle, total: exps.reduce((s, e) => s + e.amount, 0) };
    }
  };

  /* =====================================================================
     SAUVEGARDE / RESTAURATION
     ===================================================================== */
  const backup = {
    export: () => JSON.stringify({ app: 'SIKLOPOSY', version: SCHEMA, exportedAt: new Date().toISOString(), space }, null, 2),

    import(json) {
      const parsed = JSON.parse(json);
      const incoming = parsed.space || parsed;
      if (!incoming || (!Array.isArray(incoming.drivers) && !Array.isArray(incoming.vehicles)))
        throw new Error('Fichier de sauvegarde invalide.');
      space = Object.assign(emptySpace(), incoming);
      space.settings = Object.assign(emptySpace().settings, space.settings || {});
      migrate(space);                       // accepte aussi les sauvegardes v1
      persist();
    },

    wipeOperations() { space.payments = []; space.expenses = []; space.movements = []; persist(); },

    /* Horodatage du dernier export réussi, pour le rappel de sauvegarde. */
    markSaved() { space.settings.lastBackupAt = Date.now(); persist(); },

    /* Nombre de jours depuis la dernière sauvegarde (null si jamais). */
    daysSinceBackup() {
      const t = space.settings.lastBackupAt;
      return t ? Math.floor((Date.now() - t) / 86400000) : null;
    },
    backupOverdue() {
      const d = backup.daysSinceBackup();
      return d === null || d >= (Number(space.settings.backupEveryDays) || 7);
    }
  };

  /* =====================================================================
     JEU DE DÉMONSTRATION
     10 pousses, dont un immobilisé, un sans chauffeur, et un qui a changé
     de chauffeur en cours de route — pour montrer que l'historique tient.
     ===================================================================== */
  function seedDemo() {
    const noms = [
      ['Rakoto','Jean Claude'], ['Randria','Solofo'], ['Rabe','Nirina'], ['Andrianina','Toky'],
      ['Ratsimba','Hery'], ['Razaf','Fanomezantsoa'], ['Rakotoarisoa','Mamy'], ['Rasolo','Tiana'],
      ['Andriamana','Fidy'], ['Ravelo','Naina'], ['Randriamampionona','Koto']
    ];

    space.drivers = noms.map(([nom, prenom], i) => ({
      ...DRIVER_DEFAULTS,
      id: rid(), lastName: nom, firstName: prenom,
      cin: `1010${String(70000 + i * 137).padStart(8, '0')}`.slice(0, 12),
      phone: `03${(2 + i % 4)} ${String(10 + i).padStart(2,'0')} ${String(200 + i * 7)} ${String(10 + i * 3)}`,
      status: i === 9 ? 'inactif' : 'actif',
      caution: [50000, 60000, 75000][i % 3],
      contractStart: shift(today(), -(120 + i * 9)),
      createdAt: Date.now()
    }));

    space.vehicles = Array.from({ length: 10 }, (_, i) => ({
      ...VEHICLE_DEFAULTS,
      id: rid(),
      code: `Cyclo #${String(i + 1).padStart(2, '0')}`,
      status: i === 4 ? 'reparation' : (i === 7 ? 'immobilise' : 'service'),
      dailyTarget: i % 3 === 0 ? 6000 : null,
      acquiredAt: shift(today(), -(300 + i * 20)),
      note: '', createdAt: Date.now()
    }));

    /* Affectations : pousse i ↔ chauffeur i, sauf le #06 laissé libre. */
    space.assignments = [];
    space.vehicles.forEach((v, i) => {
      if (i === 5) return;                                  // Cyclo #06 : sans chauffeur
      space.assignments.push({
        id: rid(), vehicleId: v.id, driverId: space.drivers[i].id,
        from: shift(today(), -90), to: null, createdAt: Date.now()
      });
    });

    /* Cyclo #03 a changé de chauffeur il y a 3 jours : Rabe → Koto.
       Ses pannes doivent rester sur le pousse, pas suivre Rabe. */
    const v3 = space.vehicles[2];
    const bascule = shift(today(), -3);
    const ancienne = space.assignments.find(a => a.vehicleId === v3.id);
    ancienne.to = shift(bascule, -1);
    space.assignments.push({
      id: rid(), vehicleId: v3.id, driverId: space.drivers[10].id,
      from: bascule, to: null, createdAt: Date.now()
    });

    space.payments = [];
    space.expenses = [];
    const cats = CATEGORIES.map(c => c.id);
    const reparateurs = ['Atelier Rasoa', 'Garage Tana Sud', 'Mécano Bema', 'Soudure Rija'];

    for (let back = 6; back >= 0; back--) {
      const date = shift(today(), -back);

      space.vehicles.forEach((v, i) => {
        if (!vehicles.productive(v, date)) return;
        if (back === 0 && i % 3 === 1) return;               // impayés du jour
        const drv = assignments.driverOn(v.id, date);
        const target = vehicles.target(v);
        const roll = (i * 7 + back * 13) % 10;
        const amount = roll < 7 ? target
                     : (roll < 9 ? Math.round(target * 0.6 / 100) * 100 : target + 1000);
        space.payments.push({
          id: rid(), vehicleId: v.id, driverId: drv.id, date,
          amount, status: amount >= target ? 'paye' : 'partiel',
          note: '', createdAt: Date.now()
        });
      });

      for (let k = 0; k < 2; k++) {
        const v = space.vehicles[(back * 3 + k * 5) % space.vehicles.length];
        const cat = cats[(back + k * 2) % cats.length];
        space.expenses.push({
          id: rid(), vehicleId: v.id,
          driverId: (assignments.driverOn(v.id, date) || {}).id || null,
          date,
          amount: [2000, 3500, 5000, 8000, 12000][(back + k) % 5],
          category: cat,
          description: catOf(cat).label + ' — ' + catOf(cat).hint,
          repairer: reparateurs[(back + k) % reparateurs.length],
          createdAt: Date.now()
        });
      }
    }

    /* Quelques mouvements de coffre réalistes */
    space.movements = [
      { type:'apport',  date: shift(today(), -6), amount: 100000, category:'apport_perso',
        beneficiary:'', note:'Fonds de caisse de départ' },
      { type:'retrait', date: shift(today(), -5), amount: 25000, category:'pieces',
        beneficiary:'Quincaillerie Tana', note:'Lot de chambres à air' },
      { type:'retrait', date: shift(today(), -3), amount: 15000, category:'personnel',
        beneficiary:'', note:'Retrait du propriétaire' },
      { type:'apport',  date: shift(today(), -2), amount: 50000, category:'caution_recue',
        beneficiary:'Ratsimba Hery', note:'Caution à l\'embauche' },
      { type:'retrait', date: shift(today(), -1), amount: 30000, category:'salaire',
        beneficiary:'Mécanicien Bema', note:'Entretien mensuel de la flotte' },
      { type:'retrait', date: today(), amount: 12000, category:'taxe',
        beneficiary:'Commune', note:'Patente trimestrielle' }
    ].map(m => ({ ...m, id: rid(), createdAt: Date.now() }));

    persist();
  }

  return { auth, pin, serveur, settings, vehicles, drivers, assignments, payments, expenses, movements,
           stats, backup, sync, seedDemo, CATEGORIES, catOf, MOVEMENT_CATEGORIES, movCatOf,
           rid, today, shift, reload: loadSpace, raw: () => space };
})();
