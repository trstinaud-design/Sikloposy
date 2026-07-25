# 🚲 CycloGest — Gestion de flotte de cyclopousses

Mini-comptable quotidien pour un propriétaire de flotte : suivi des versements, des dépenses
et des pannes, avec détection immédiate des pousses qui n'ont pas versé.

**Fonctionne intégralement hors connexion** et s'installe sur le téléphone comme une vraie
application. Aucun serveur, aucune dépendance à installer, 197 Ko au total.

---

## ▶️ Démarrer

**Windows** — clic droit sur `demarrer.ps1` → *Exécuter avec PowerShell*.
Le navigateur s'ouvre sur `http://localhost:5599/`.

```powershell
powershell -ExecutionPolicy Bypass -File demarrer.ps1
```

> ⚠️ N'ouvrez pas `index.html` en double-cliquant (`file://`) : Chrome y bloque
> `localStorage` et les service workers. Passez par le serveur ci-dessus, ou tout
> autre serveur statique.

**Première fois :** onglet *Créer un compte* → cochez « 10 cyclopousses de démonstration »
pour explorer l'application avec 7 jours d'historique.

**Sur téléphone :** ouvrez l'adresse, puis *Installer l'application* (bouton dans la barre
latérale ou dans Paramètres). Une fois installée, elle marche sans aucune connexion.

---

## 📶 Le mode hors connexion, vérifié

Un `sw.js` (service worker) met les 12 fichiers en cache à la première visite et les sert
ensuite depuis le cache, le réseau ne servant qu'à rafraîchir en arrière-plan.

Ce n'est pas une promesse théorique : le serveur a été **réellement coupé**, puis la page
rechargée. Elle s'est chargée **7,5 secondes après la coupure confirmée**, avec
**0 octet transitant par le réseau** (toutes les ressources passées par le service worker),
application démarrée, styles appliqués, 10 pousses affichés.

---

## 🗂️ Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des 7 vues et des 6 modales |
| `css/app.css` | CSS Tailwind **pré-compilé** (23 Ko) |
| `js/store.js` | **Couche de données** : auth, entités, calculs, migration. Seul point d'écriture |
| `js/charts.js` | Graphiques SVG, sans librairie externe |
| `js/ui.js` | Helpers, état de navigation, gabarits de formulaires |
| `js/views.js` | Rendu : tableau de bord, saisie, flotte |
| `js/views2.js` | Rendu : chauffeurs, maintenance, historique |
| `js/app.js` | Contrôleur : navigation, actions, export, PWA |
| `sw.js`, `manifest.json`, `icons/` | Installation et fonctionnement hors ligne |

Cette séparation permet de **brancher un vrai backend plus tard** : seul `store.js` change
(remplacer `localStorage` par des appels `fetch`), le reste est intact.

---

## 🧩 Le modèle de données — pourquoi trois entités

Un cyclopousse **n'est pas** un attribut de son chauffeur. Si c'était le cas, un changement
de chauffeur ferait basculer l'historique des pannes du véhicule vers la mauvaise personne,
ou repartirait le pousse à zéro. Trois entités distinctes :

```
CYCLOPOUSSE (le bien durable)          CHAUFFEUR (la personne)
  n°, état, objectif/jour, photo         nom, CIN, tél, photo, caution, contrat
         │                                        │
         └──────────── AFFECTATION ───────────────┘
                  du 01/01 au 15/06 : Rabe
                  depuis le 16/06   : Solofo

  Les PANNES appartiennent au pousse   → son historique lui reste à vie
  Les VERSEMENTS mémorisent les deux   → le bilan du chauffeur le suit
```

Conséquences concrètes :
- L'historique des pannes de `Cyclo #03` reste sur `Cyclo #03`, quel que soit le conducteur.
- Le bilan d'un chauffeur le suit s'il change de véhicule.
- Un pousse peut exister **sans chauffeur** (en réparation, en attente d'embauche).
- Un chauffeur ne peut conduire qu'un seul pousse à la fois : l'affecter ailleurs
  clôture automatiquement son affectation précédente.

**Migration automatique.** Une sauvegarde à l'ancien format (le pousse n'était qu'un champ
texte) est convertie au chargement : un pousse est créé par numéro rencontré, l'affectation
correspondante est ouverte à la date de contrat (ou du premier versement connu), et
versements comme pannes sont rerattachés. Rien n'est perdu.

---

## 🧭 Les 7 vues

**1. Tableau de bord** — pour la date choisie : versements bruts, dépenses, **recette nette**,
reste à encaisser. 🔴 Non versés en tête avec **bouton d'appel direct** et encaissement en un
clic. ⏸️ Pousses improductifs, avec le motif exact (en réparation / immobilisé / aucun
chauffeur / chauffeur inactif).

**2. Saisie du jour** — les deux formulaires, et une feuille de route **une ligne par pousse** :
chauffeur du moment, attendu, versé, **écart**, dépenses, statut. Bouton *Tout marquer payé*
qui ignore les pousses improductifs.

**3. Cyclopousses** — la liste de votre flotte. Chaque carte montre l'état, le chauffeur
actuel et le rendement. **Un clic ouvre la fiche complète** : informations, historique des
chauffeurs successifs avec ce que chacun a encaissé, historique des pannes, versements.
Boutons *Changer de chauffeur*, *Libérer le pousse*, *Modifier*.

**4. Chauffeurs** — fiches (nom, CIN, téléphone, photo, caution, contrat). La fiche montre
les pousses conduits successivement. Le n° de pousse ne se saisit pas ici : il se règle
depuis la fiche du pousse.

> **Raccourci pratique :** en créant un cyclopousse (ou en changeant son chauffeur), le menu
> « Chauffeur à affecter » propose **➕ Créer un nouveau chauffeur…**. La fiche du chauffeur
> s'ouvre, et une fois enregistrée vous revenez exactement où vous étiez, avec ce chauffeur
> déjà sélectionné — votre saisie en cours n'est pas perdue.

**5. Maintenance** — coût total, véhicules indisponibles, panne la plus fréquente, coût moyen.
Répartition par catégorie, **classement des pousses les plus coûteux**, historique filtrable.

**6. Historique** — filtres **Aujourd'hui / Semaine / Mois / Année / Tout**, ou dates libres.
Les bornes sont **calées sur la date du téléphone** : « Mois » signifie le mois en cours
depuis le 1er, pas les 30 derniers jours. Regroupement jour/semaine/mois/**année**, évolution
du gain net, **rendement par pousse** et **bilan par chauffeur** (jours conduits, jours
impayés, score de fiabilité). **Export CSV** (Excel FR) et **rapport imprimable**.

> L'application suit l'horloge du téléphone en continu : si elle reste ouverte au-delà de
> minuit, la date du jour et les périodes se recalculent toutes seules.

**7. Paramètres** — devise, objectif par défaut, sauvegarde/restauration `.json`, données de
démo, état du mode hors connexion, zone de suppression.

---

## 💰 La caisse / le coffre

La **recette nette** mesure la performance d'exploitation. Elle ne dit pas combien d'argent
il reste réellement. Le coffre répond à cette seconde question :

```
Solde du coffre = versements encaissés
                − réparations payées
                − retraits (achats, salaires, usage personnel, caution rendue…)
                + apports (argent remis dans le coffre, prêt, caution reçue…)
```

Versements et réparations alimentent le registre **automatiquement** — vous ne saisissez que
les retraits et les apports. Chaque mouvement porte une date, un montant, un motif, un
bénéficiaire et une note. Le formulaire affiche le **solde projeté** avant validation, et
demande confirmation si l'opération ferait passer le coffre en négatif — signe habituel
d'une saisie oubliée.

---

## 🔐 Authentification & données

- Compte email + mot de passe, haché en **SHA-256 salé** (`crypto.subtle`).
- Chaque propriétaire a son espace isolé (`cg_data_<userId>`).
- **Sauvegarde automatique** : toute saisie est écrite immédiatement.
- Photos **redimensionnées à 320 px et compressées** avant stockage.

L'application a **deux modes**, selon que `js/config.js` est rempli ou non.

| | Mode local (config vide) | Compte en ligne (config remplie) |
|---|---|---|
| Où vivent les données | sur ce téléphone uniquement | sur le serveur, copie locale sur le téléphone |
| Sauvegarde | manuelle (e-mail) | **automatique à chaque saisie** |
| Changement de téléphone | ❌ tout est perdu | ✅ on se connecte, tout revient |
| Taille | ~5 Mo | sans limite pratique |
| Fonctionne hors réseau | ✅ | ✅ (les saisies repartent au retour) |
| Cloisonnement entre propriétaires | par appareil | **imposé par le serveur** |

### Plusieurs propriétaires

Chaque propriétaire crée son compte et dispose d'un espace **totalement cloisonné** : ses
pousses, ses chauffeurs, ses versements, son coffre.

En mode **local**, le cloisonnement est celui de l'appareil, et le mot de passe protège
l'écran, pas le fichier : quelqu'un de technique ayant le téléphone en main peut lire les
données. En mode **en ligne**, c'est le serveur qui refuse l'accès aux données d'autrui,
et le mot de passe est vérifié par lui.

### ⚠️ Vos données ne sont pas protégées à 100 %

Le mode hors ligne garantit que l'application *s'ouvre* sans réseau. **Ce n'est pas une
sauvegarde.** Ce qui peut détruire vos données :

| Risque | Protégé ? |
|---|---|
| Le navigateur manque de place | ✅ si l'application est **installée** (voir ci-dessous) |
| « Effacer les données de navigation » | ❌ tout est perdu |
| Désinstallation de l'application | ❌ tout est perdu |
| Téléphone perdu, volé ou cassé | ❌ tout est perdu |
| Navigation privée | ❌ perdu à la fermeture |

L'application demande au navigateur de **protéger son stockage** contre l'effacement
automatique. Cette demande **peut être refusée** : Chrome ne l'accorde qu'aux applications
installées sur l'écran d'accueil ou très utilisées. L'écran *Paramètres* affiche l'état réel,
sans le maquiller — s'il indique « stockage non protégé », installez l'application.

**Votre seule protection réelle reste la sauvegarde rangée ailleurs.** L'application vous le
rappelle si plus de 7 jours se sont écoulés.

### ☁️ Le compte en ligne — installation en 5 minutes

C'est ce qui répond à « je ne veux pas perdre mes données » et « si je change de téléphone,
je retrouve tout ». Votre compte vit alors **sur le serveur**, plus sur le téléphone :
sauvegarde automatique à chaque saisie, taille sans limite, et sur un appareil neuf il suffit
de se connecter.

Le mode hors ligne reste actif : l'application fonctionne sans réseau, et les saisies
repartent seules au retour de la connexion.

**1.** Créez un compte gratuit sur **supabase.com** (sans carte bancaire), puis un projet.

**2.** Ouvrez **SQL Editor** et exécutez ce script :

```sql
create table cyclogest_espaces (
  proprietaire uuid primary key references auth.users(id) on delete cascade,
  contenu      jsonb  not null,
  maj          bigint not null
);

alter table cyclogest_espaces enable row level security;

-- Chaque propriétaire n'accède qu'à sa propre ligne. C'est le serveur qui
-- l'impose : même avec la clé publique, on ne voit pas les données d'un autre.
create policy "lecture_de_ses_donnees" on cyclogest_espaces
  for select using (auth.uid() = proprietaire);
create policy "creation_de_ses_donnees" on cyclogest_espaces
  for insert with check (auth.uid() = proprietaire);
create policy "modification_de_ses_donnees" on cyclogest_espaces
  for update using (auth.uid() = proprietaire) with check (auth.uid() = proprietaire);
```

**3.** Dans **Authentication → Providers → Email**, désactivez **« Confirm email »**.
Sinon chaque propriétaire devra cliquer un lien reçu par e-mail avant de pouvoir se
connecter — l'application le lui dira, mais c'est un frein sur le terrain.

**4.** Dans **Project Settings → API**, copiez l'**URL du projet** et la clé **anon public**.

**5.** Ouvrez `js/config.js` et collez-les :

```js
window.CYCLOGEST_CONFIG = {
  supabaseUrl: 'https://xxxxxxxx.supabase.co',
  supabaseKey: 'eyJhbGciOi…'
};
```

C'est ce fichier qui voyage avec l'application. Grâce à lui, **sur un téléphone neuf il n'y a
rien à ressaisir** : on ouvre l'application, on se connecte, tout revient. (Vous pouvez aussi
saisir ces valeurs dans *Paramètres* pour tester, mais alors elles ne suivent pas l'appareil.)

**6.** Chaque propriétaire crée son compte depuis l'écran d'accueil. L'écran de connexion
indique « ☁️ Compte en ligne » quand tout est en place.

> La clé « anon » est **prévue pour être publique**. Ce sont les règles de sécurité de
> l'étape 2 qui protègent les données : sans compte, elle ne donne accès à rien, et un
> propriétaire ne peut pas lire la ligne d'un autre.

**Arbitrage des versions.** Si cet appareil et le serveur ont chacun des saisies que l'autre
n'a pas, l'application **ne tranche pas toute seule** : elle affiche les deux dates et vous
laisse choisir. Rien n'est effacé avant votre décision, et adopter la version du serveur
conserve une copie de secours de la vôtre.

**Passage depuis un compte local.** Si vous aviez déjà saisi des données en mode local, elles
ne sont pas perdues : après votre première connexion en ligne, *Paramètres* propose de les
**reprendre** dans le compte hébergé.

> ⚠️ **Non vérifié contre un vrai Supabase :** faute d'identifiants, j'ai testé contre un
> serveur simulé reproduisant l'API (inscription, connexion, jeton expiré et renouvelé,
> cloisonnement entre deux propriétaires, changement de téléphone, coupure réseau, conflit).
> Le bouton **Tester la connexion** est là pour ça : il vous dira précisément ce qui bloque
> (adresse injoignable, clé refusée, table absente).

### 📧 Sauvegarde par e-mail

Le bouton *Sauvegarder par e-mail* (Paramètres) produit le fichier complet et :

- **sur téléphone**, ouvre le menu de partage natif — Gmail, WhatsApp, Drive, au choix ;
- **sur ordinateur**, enregistre le fichier puis ouvre votre messagerie avec un message
  pré-rempli ; il ne reste qu'à joindre le fichier.

Aucun serveur, donc rien à héberger ni à payer, et cela fonctionne dès que vous retrouvez du
réseau. Une **copie de secours interne** est également conservée dans l'appareil (IndexedDB),
restaurable en un clic : elle protège d'une corruption des données, *pas* d'un effacement du
navigateur.

---

## ⌨️ Raccourcis

| Touche | Action |
|---|---|
| `V` | Nouveau versement |
| `D` | Nouvelle dépense |
| `←` / `→` | Jour précédent / suivant |

---

## 🧮 Règles de calcul

- **Recette nette** = versements − dépenses sur la date choisie.
- Un versement inférieur à l'objectif est **« Partiel »**, même saisi comme « Payé » : le
  montant fait foi.
- Un pousse est **productif** s'il est en service *et* conduit par un chauffeur actif. Par
  défaut, seuls les pousses productifs comptent dans l'objectif du jour — un pousse en
  réparation n'apparaît donc pas comme « reste à encaisser » (réglable dans Paramètres).
- **Objectif** = celui du pousse s'il est renseigné, sinon la valeur globale.
- **Fiabilité** d'un chauffeur = jours intégralement payés ÷ jours où il avait un pousse.

---

## 🎨 Modifier le style

`css/app.css` est **pré-compilé** : ajouter une classe Tailwind inédite dans le code HTML/JS
n'aura aucun effet tant que le CSS n'est pas régénéré. Deux options :

1. **Écrire la règle à la main** dans le bloc `<style>` de `index.html` — le plus simple pour
   une retouche ponctuelle.
2. **Régénérer** avec l'outil officiel si vous installez Node :
   `npx tailwindcss -i entree.css -o css/app.css --content "./index.html,./js/*.js" --minify`

---

## ✅ Vérifications effectuées

Testé dans le navigateur, sur 10 pousses / 11 chauffeurs / 7 jours de données :

- **Hors ligne** : serveur réellement coupé, page rechargée 7,5 s après, 0 octet réseau.
- **Changement de chauffeur** : le même jour et à une date future ; pas de chevauchement
  d'affectations, pannes conservées sur le pousse, ancien chauffeur libéré.
- **Migration v1 → v2** : pousses créés, affectations ouvertes, versements et pannes
  rerattachés, objectifs et états conservés, aucun montant perdu.
- **Formulaires** : versement, dépense (avec mise en réparation automatique), création et
  modification de pousse et de chauffeur, refus des numéros en double, paramètres.
- **Suppressions** : supprimer un pousse nettoie ses affectations, versements et pannes, et
  conserve les chauffeurs.
- **Cohérence** : totaux recalculés indépendamment depuis les données brutes.
- **Caisse** : solde recalculé indépendamment depuis les données brutes ; retrait, apport,
  modification et suppression ; motifs filtrés selon le sens ; solde projeté exact ;
  confirmation exigée si le coffre passerait en négatif ; montant nul refusé.
- **Migration v1 et v2 → v3** : le coffre s'ouvre sans rien perdre.
- **Sauvegarde** : contenu du fichier vérifié (pousses, affectations, coffre), aller-retour
  export/restauration sans écart, horodatage et rappel mis à jour, copie de secours écrite.
- **Style** : 628 éléments × 20 propriétés CSS comparés avant/après la pré-compilation —
  aucune différence ; 306 classes utilisées, **aucune sans règle CSS**.
- **Périodes** : bornes calées sur la date du téléphone (jour, lundi, 1er du mois,
  1er janvier) ; regroupement annuel ; passage de minuit simulé — date et périodes suivies.
- **Chauffeur depuis un cyclopousse** : brouillon du pousse intégralement restitué au retour
  (numéro, objectif, date, note) et nouveau chauffeur présélectionné puis affecté.
- **Synchronisation** (contre un serveur simulé) : première publication, absence de boucle
  d'envoi, modification locale renvoyée, réception sûre, coupure réseau, erreur serveur,
  détection de conflit sans rien écraser, arbitrage dans les deux sens.
- **Compte en ligne** (contre un serveur simulé) : inscription, refus des doublons d'e-mail,
  connexion, mot de passe erroné rejeté, **changement de téléphone** (stockage entièrement
  effacé puis tout récupéré par simple connexion), **cloisonnement de deux propriétaires**
  (chacun ne voit que ses données), connexion et saisie **sans réseau**, renvoi automatique
  au retour du réseau, **jeton révoqué renouvelé** et opération rejouée, reprise d'un ancien
  compte local.
- **Mobile** (375 px) : les 8 vues sans débordement horizontal, cibles tactiles de 47 × 52 px.
- Aucune erreur ni avertissement console.

### Ce qui n'a pas pu être vérifié

- La synchronisation **contre un vrai projet Supabase** : je n'avais pas d'identifiants.
  Testée uniquement contre un serveur simulé reproduisant l'API REST.
- L'installation sur un **vrai téléphone Android/iOS** et le partage natif de la sauvegarde.
- Le **stockage persistant** : Chrome l'a refusé dans l'environnement de test, comme il le
  fera tant que l'application n'est pas installée sur l'écran d'accueil.

---

## 🔜 Évolutions naturelles

1. **Backend + multi-appareils** — remplacer `store.js` par une API.
2. **Notification SMS** aux chauffeurs non versés en fin de journée.
3. **Suivi des cautions et avances** — solde à rembourser par chauffeur.
4. **Maintenance préventive** — alerte après N jours ou N pannes sur un même pousse.
5. **Deux chauffeurs par pousse** (équipes jour/nuit) si vous passez en 2×8.
