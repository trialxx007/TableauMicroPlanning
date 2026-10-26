# DEV — Documentation technique

Documentation destinée aux développeurs : architecture, rôle de chaque fichier,
flux de données, API, base de données et conventions.
Pour l'utilisation de l'application, voir `docs/README.md`.

---

## 1. Stack technique

| Élément | Choix |
| --- | --- |
| Front-end | React 19 + TypeScript, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`) |
| UI | `lucide-react` (icônes), `motion` (animations) |
| Back-end | Express 4 (`server/index.ts`), exécuté avec `tsx` |
| Base de données | SQLite via `node:sqlite` (`server/db.ts`) — fichier `data/point-commande.db` |
| Alias d'import | `@/` → racine du projet (configuré dans `vite.config.ts` et `tsconfig.json`) |

Le serveur Express sert **l'API** (`/api/v1/...`) **et le front** :
en développement il branche le middleware Vite (HMR), en production il sert le
dossier `dist/`.

**Prérequis :** Node.js 22+ (`node:sqlite` est requis).

---

## 2. Démarrage et scripts

```bash
npm install
npm run dev        # lance tsx server/index.ts (API + Vite en middleware)
```

L'application est servie sur `http://localhost:3000` (port défini par `PORT`,
voir `.env.local` / `server/index.ts`).

### Scripts npm

| Script | Rôle |
| --- | --- |
| `npm run dev` | Démarre le serveur + Vite (développement, HMR). |
| `npm run start` | Identique à `dev`. |
| `npm run build` | Build production du front dans `dist/` (`vite build`). |
| `npm run preview` | Sert le build Vite en local. |
| `npm run lint` | Vérifie les types : `tsc --noEmit`. |
| `npm run clean` | Supprime `dist/` et `server.js`. |

> Il n'y a **pas** de compilation séparée du serveur : il tourne via `tsx`
> directement depuis les sources TypeScript.

### Variables d'environnement

Chargées depuis `.env.local` puis `.env` (voir `.env.example`) :

| Variable | Rôle |
| --- | --- |
| `PORT` | Port d'écoute du serveur (défaut `3000`). |
| `DB_PATH` | Chemin du fichier SQLite (défaut `data/point-commande.db`). |
| `APP_URL` | Origine supplémentaire autorisée en CORS. |

### Vérification obligatoire avant commit

```bash
npx tsc --noEmit     # ou npm run lint
npm run build
```

---

## 3. Arborescence et rôle des fichiers

```
index.html             Gabarit HTML (favicons, PWA, point de montage #root)
vite.config.ts         Config Vite : plugin React, Tailwind, alias @/, HMR
tsconfig.json          Config TypeScript (moduleResolution bundler, alias @/*)
package.json           Dépendances et scripts
server/
  index.ts             Serveur Express : API REST + service du front (dev/prod)
  db.ts                Couche SQLite : schéma, requêtes, seed, journal
src/
  main.tsx             Point d'entrée React (createRoot + StrictMode + ErrorBoundary)
  App.tsx              Composant racine : session, vue courante, handlers, gardes
  index.css            Styles globaux + Tailwind + animations

  types/               Types du domaine (aucune logique)
    card.ts            CardItem, OrdreFabrication, SousOrdreFabrication, CardJalon…
    suiviGlobal.ts     Chaînes, cases, inspections, expéditions du Suivi Global
    kanban.ts          Modèle du tableau Développement (colonnes, cartes, personnes)

  services/
    api.ts             Client HTTP : fetch /api/v1/..., en-tête X-Profil-Id,
                       cardApi, jalonApi, historiqueApi, suiviApi + lecture du profil

  context/             États partagés via React Context
    ProfilContext.tsx        Profil connecté + useLectureSeule()
    JalonCatalogueContext.tsx Catalogue des jalons (nomenclatures/statuts)
    InspectionsParCarteContext.tsx Inspections indexées par carte

  utils/               Helpers purs (pas de JSX, sauf exception)
    auth.ts            Profils, mots de passe, session, onglets autorisés
    jalons.ts          Couleurs/échéances/tri des jalons
    inspections.ts     Helpers d'inspection
    dateFrance.ts      Dates/heures au format France + fuseau
    kanbanStorage.ts   Persistance localStorage du kanban (+ nouvelId, seed)
    glisserCarte.ts    Glisser-déposer des cartes du Suivi Global
    alertesManuelles.ts / alertesPopover.ts / alerteBlinking.ts  Alertes

  data/
    mockData.ts        Données initiales des cartes / OFs
    mockJalons.ts      Catalogue de jalons par défaut
    mockSuiviGlobal.ts Chaînes et cases du Suivi Global par défaut

  components/
    ErrorBoundary.tsx  Frontière d'erreur : évite l'écran blanc si un rendu casse

    layout/
      LoginScreen.tsx     Écran d'accueil : choix du profil + mot de passe
      Header.tsx          En-tête du Point Commande (titre, onglets, session)
      ViewSwitcher.tsx    Onglets de vue (filtrés par profil) + type AppPage
      SessionBadge.tsx    Badge du profil connecté + bouton de déconnexion

    ui/
      FilterBar.tsx        Barre de recherche/filtres
      StatsOverview.tsx    Statistiques de synthèse (KPI)
      EditableItemName.tsx Nom d'élément éditable en ligne
      AlertePopover.tsx    Popover d'alerte d'une carte

    point-commande/
      CardTable.tsx          Tableau Point Commande (cartes, jalons, quantités)
      CardModal.tsx          Fiche complète d'une carte (création/édition)
      OFSubTable.tsx         Sous-tableau des OFs d'une carte
      OfPopover.tsx          Popover de détail d'un OF
      CardPickerModal.tsx    Sélection d'une carte existante
      EnCoursCasesSection.tsx Section « cases en cours »
      TableauxOFsView.tsx    Vue Tableaux des OFs (+ OFRowEditable)

    suivi-global/
      SuiviGlobalView.tsx    Vue Suivi Global (chaînes, cases, alertes)
      LigneTableSuivi.tsx    Une ligne du Suivi Global
      InspectionCell.tsx / InspectionEtatMenu.tsx / InspectionHistoriquePopover.tsx
      ExpeditionModal.tsx / NouvelleChaineModal.tsx

    historique/
      HistoriqueView.tsx     Vue Historique des modifications

    DeveloppementView.tsx  Vue kanban « Développement » (Trello-like)

public/                Favicons, PWA (manifest), images
data/point-commande.db Base SQLite « live » (ignorée par git)
```

---

## 4. Démarrage de l'application (flux)

1. `main.tsx` monte `<App />` enveloppé dans `<ErrorBoundary>` (et `StrictMode`).
2. `App.tsx` lit la session (`lireSession()` de `utils/auth.ts`) dans le
   `sessionStorage`.
   - Pas de session → `LoginScreen` (choix du profil, mot de passe pour les
     profils protégés).
   - Session → l'app est enveloppée dans `ProfilProvider`, puis
     `InspectionsParCarteProvider` et `JalonCatalogueProvider`.
3. La **vue initiale** est celle mémorisée (`aic_vue_actuelle_v1`), mais elle est
   **contrainte** par les onglets autorisés du profil. Répartition des
   responsabilités :
   - la session est relue **directement dans l'initialiseur** de `useState`
     (relire `lireSession()` plutôt que d'attendre le rendu suivant) : cela évite
     d'afficher un onglet interdit au tout premier écran ;
   - `handleConnexion` force immédiatement la vue sur `ongletsAutorises()[0]` ;
   - un `useEffect` de garde corrige les cas de navigation interne restants.
4. `ViewSwitcher` n'affiche que les onglets autorisés et se **masque** s'il n'en
   reste qu'un seul (profil Production).
5. Les données (cartes, jalons, historique, layout du suivi) sont chargées via
   `services/api.ts` (fetch vers `/api/v1/...`).

---

## 5. Authentification et profils

Toute la logique vit dans `src/utils/auth.ts` :

- `PROFILS` : définition des 4 profils (`utilisateur`, `resp-planning`,
  `production`, `direction`).
- `MOT_DE_PASSE_PROFILS = '1234'` : mot de passe commun aux profils protégés
  (`utilisateur` n'en a pas).
- `OngletId` / `ONGLETS` : miroir exact de `AppPage` (`ViewSwitcher`).
- `ONGLETS_PAR_PROFIL` : table `profil → onglets autorisés`.
- `ongletsAutorises(profilId)` : renvoie les onglets visibles pour le profil.
- `ongletsSansAcces()` : détecte un `OngletId` déclaré mais attribué à **aucun**
  profil (garde-fou contre les vues inaccessibles).
- Session : `lireSession()` / `enregistrerSession()` / `effacerSession()`,
  stockée dans `sessionStorage` sous `aic_session_profil_v1`
  (`{ profilId, connecteLe }`).

`ProfilContext` (`src/context/ProfilContext.tsx`) expose :

- `useProfil()` → `{ profil, lectureSeule }` du profil courant.
- `useLectureSeule()` → `true` pour le profil `utilisateur` seulement.

### Droits par profil

| Profil | Onglets autorisés | Écriture |
| --- | --- | --- |
| `utilisateur` | point-journalier, suivi-global, tableaux-ofs | aucune (`lectureSeule = true`) |
| `resp-planning` | point-journalier, suivi-global, tableaux-ofs, developpement | toutes |
| `production` | tableaux-ofs uniquement | quantités d'OF seulement (`typeModifiable = false`) ; pas de création/suppression ni de fiche |
| `direction` | les 4 + historique | toutes |

Le profil connecté est envoyé au serveur via l'en-tête **`X-Profil-Id`**
(`services/api.ts`) : il ne restreint pas les accès côté serveur, il sert
d'**audit** (chaque écriture journalisée porte son auteur).

---

## 6. API REST (`server/index.ts`, montée sur `/api/v1`)

| Méthode | Route | Rôle | Journalisé |
| --- | --- | --- | --- |
| GET | `/jalons` | Catalogue des jalons | non |
| POST | `/jalons` | Crée un jalon (catalogue et/ou carte) | `jalon.ajoute` |
| PATCH | `/jalons/:code` | Renomme / change la grandeur | `jalon.renomme` / `jalon.grandeur` |
| DELETE | `/jalons/:code` | Supprime un jalon du catalogue | `jalon.supprime` |
| DELETE | `/cards/:cardId/jalons/:code` | Retire un jalon d'une carte | `jalon.retire` |
| GET | `/cards` | Liste des cartes (filtres `search`, `statut`, `client`) | non |
| GET | `/cards/:id` | Une carte | non |
| POST | `/cards` | Crée une carte | `carte.creee` |
| PUT | `/cards/:id` | Remplace une carte | `carte.modifiee` (diff) |
| PATCH | `/cards/:id` | Met à jour partiellement une carte | `carte.modifiee` (diff) |
| DELETE | `/cards/:id` | Supprime une carte | `carte.supprimee` |
| POST | `/reset` | Réinitialise les données de démo | `base.reinitialisee` |
| GET | `/stats` | Statistiques de synthèse | non |
| GET | `/historique` | Journal des modifications (filtrable) | non |
| DELETE | `/historique` | Vide le journal | non (volontaire) |
| GET | `/suivi-layout` | Layout du Suivi Global | non |
| PUT | `/suivi-layout` | Sauvegarde le layout du Suivi Global | `suivi.modifie` |
| POST | `/suivi-layout` | Layout via `navigator.sendBeacon` (corps `text/plain`, réponse 204) | non |

- **CORS** : allow-list `http://localhost:3000`, `http://localhost:5173` et
  `APP_URL`. Requêtes sans en-tête `Origin` (curl, même origine) toujours
  acceptées ; en dev tout passe, en production seules les origines autorisées.
- **Fuseau** : `Etc/GMT-3` (décalage fixe GMT+3) pour tous les horodatages.
- Middleware d'erreur final → réponse **JSON** 500 (jamais une page HTML).

---

## 7. Base de données (`server/db.ts`)

SQLite via `node:sqlite` (`DatabaseSync`), `journal_mode = WAL`,
`foreign_keys = ON`. Fichier unique : `data/point-commande.db` (chemin
surchargé par `DB_PATH`). Connexion singleton ouverte paresseusement
(`getDb()` → `initSchema()` → `seedIfEmpty()`).

### Tables principales

| Table | Contenu |
| --- | --- |
| `jalons` | Catalogue : `code` (PK), `libelle`, `categorie` (NOMENCLATURE/STATUT), `ordre`, `cree_le` |
| `cards` | Cartes : `id` (PK), `data` (JSON de la carte), `cree_le`, `maj_le` |
| `card_jalons` | État des jalons par carte : `card_id`, `code`, `valide`, `semaine`, `date`, `tbc` (PK composite) |
| `suivi_global_layout` | Layout partagé du Suivi Global : ligne unique `id='global'`, `data` (JSON), `maj_le` |
| `journal_modifications` | Journal : `id` (PK auto), `at`, `profil`, `action`, `cible`, `details` |

Index : `idx_card_jalons_card`, `idx_journal_at (at DESC)`.

Le schéma comporte des **migrations idempotentes** (ALTER TABLE / renommages /
insertions) pour faire évoluer une base existante sans perte de données.

### Fonctions exportées (résumé)

- **Jalons** : `listJalons`, `createJalon`, `renameJalon`, `setJalonCategorie`,
  `deleteJalon`, `deleteJalonForCard`, `normaliserCodeJalon`.
- **Cartes** : `prochainIdCarte` (`CRD-001`…), `listCards`, `getCard`,
  `insertCard`, `updateCardData`, `deleteCard`, `resetDatabase`.
- **Suivi Global** : `getSuiviGlobalLayout`, `setSuiviGlobalLayout`.
- **Journal** : `journaliser`, `listerJournal`, `viderJournal`.

### Journalisation (historique)

- Chaque écriture métier appelle `journaliser({ profil, action, cible, details })`.
- `profilDe(req)` lit `X-Profil-Id` (défaut `'inconnu'`).
- `diffCarte(avant, apres)` compare les champs de `CHAMPS_CARTE_SUIVIS`
  (`client`, `batch`, `modele`, `typeCarte`, `quantiteDemandee`,
  `quantiteFinie`, `statut`, `okProd`, `decisionReunion`, `notes`) et ajoute les
  variations de jalons et d'OFs.
- `detailler(champs, resume)` sérialise le tout en JSON pour la colonne `details`.
- `listerJournal(filtres)` renvoie le journal antéchronologique, filtrable par
  `profil`, `dateMin`, `dateMax` (jours locaux GMT+3), `limit` bornée 1–5000.

---

## 8. Persistance côté client

| Donnée | Emplacement | Partagée ? |
| --- | --- | --- |
| Cartes, OFs, jalons, historique, layout du Suivi Global | Base SQLite (serveur) | **oui**, entre tous les postes |
| Session du profil | `sessionStorage` (`aic_session_profil_v1`) | non (par onglet) |
| Vue courante | `sessionStorage` (`aic_vue_actuelle_v1`) | non |
| Tableau Développement (kanban) | `localStorage` (`aic_kanban_dev_v1`) | non (par navigateur) |
| Alertes manuelles / popover / clignotement | `localStorage` (clés `*_v*`) | non |

Le Suivi Global écrit aussi le layout dans `localStorage` en **repli** si le
serveur est indisponible (`services/api.ts`), avec polling côté vue.

---

## 9. Fonctionnement de la vue Développement (kanban)

- **But** : kanban type Trello pour les tâches internes, **indépendant** des
  cartes de production. Persistance `localStorage` via `utils/kanbanStorage.ts`.
- **Modèle** (`types/kanban.ts`) :
  - `KanbanColonne` : `{ id, titre, ordre, couleur, sections? }`
  - `KanbanSection` : sous-liste d'une colonne scindée ; si titre = BRODERIE MAIN
    elle peut contenir `personnes`.
  - `KanbanPersonne` : `{ id, titre, bloc ('client'|'initiatives'), ordre }`
  - `KanbanCarte` (tâche) : `{ id, titre, etat?, traiteur?, client?, remarques?,
    couleur?, colonneId, sectionId?, personneId?, bloc?, date?, dateEntreeZone?,
    ordre, creeLe }`
- **Actions** : créer/renommer/supprimer/réordonner colonnes ; scinder/fusionner
  une colonne en sections ; créer/éditer (sur place)/supprimer/déplacer des
  tâches ; pour BRODERIE MAIN, ajouter/renommer/supprimer des personnes et
  affecter une tâche par glisser-déposer.
- **Alertes de délai** (`estEnAlarme`) : rouge + clignotant si une tâche reste
  ≥ 2 jours dans une zone (≥ 4 jours en BRODERIE MAIN), ou ≥ 12 jours au total
  sans atteindre la dernière colonne.
- **Lecture défensive** : `chargerKanban()` valide chaque élément (types, codes
  de couleur, colonnes/sections/personnes existantes) et retombe sur un jeu
  initial (`kanbanInitial()`) si la structure est incohérente.
- **Déconnexion** : la vue reçoit `profil` et `onDeconnexion` et affiche le
  `SessionBadge` dans son en-tête.

---

## 10. Rendus et protections

- **ErrorBoundary** (`src/components/ErrorBoundary.tsx`) enveloppe toute l'app
  dans `main.tsx`. En cas d'erreur de rendu, il affiche un écran « Affichage
  interrompu » avec **Réessayer** (réinitialise l'état d'erreur) et
  **Réinitialiser les données** (`localStorage.clear()` + rechargement).
- **Lecture seule** : toute action d'écriture doit être gardée par
  `lectureSeule` (UI) et rester cohérente avec les règles serveur.

---

## 11. Conventions et points d'attention

- **Organisation** : `src/components/` est découpé par domaine — `layout/`
  (châssis), `ui/` (réutilisables), `point-commande/`, `suivi-global/`,
  `historique/`, plus `DeveloppementView.tsx`. Le serveur vit dans `server/`
  (`index.ts` = API, `db.ts` = SQLite).
- **Imports** : depuis un composant d'un sous-dossier, pointer les modules
  partagés via l'alias `@/src/...` (ex. `@/src/utils/auth.ts`) ; garder les
  imports relatifs `./X.tsx` pour les fichiers du même dossier.
- **Nommage métier** : le champ technique `card.batch` et sa colonne restent
  nommés `batch` ; seul l'affichage dit **« Saison »**. Ne pas toucher aux
  identifiants techniques lors d'un renommage d'affichage.
- **Session** : `sessionStorage` → propre à l'onglet ; F5 la conserve.
- **Vérification obligatoire** avant de considérer une tâche terminée :
  `npx tsc --noEmit` **et** `npm run build`.
- **Redémarrage serveur** : `tsx` ne recharge pas à chaud. Après ajout ou
  modification d'une **route serveur**, redémarrer le serveur.
- **HMR** : géré par `vite.config.ts` via `DISABLE_HMR` (usages internes) ; ne
  pas le modifier sans raison.
- **Favicons/PWA** : assets dans `public/` et `manifest.webmanifest`, référencés
  depuis `index.html`.

---

## 12. Ajouter une fonctionnalité — checklist

1. Étendre les types dans `src/types/card.ts` (ou `suiviGlobal.ts` / `kanban.ts`).
2. Ajouter/modifier le schéma et les requêtes dans `server/db.ts`.
3. Exposer/étendre la route dans `server/index.ts` (journaliser si c'est une
   écriture à tracer) puis **redémarrer le serveur**.
4. Ajouter la méthode dans `src/services/api.ts`.
5. Câbler l'UI dans le composant concerné (respecter les règles de profil et
   `lectureSeule`).
6. Mettre à jour l'affichage / les libellés si besoin (sans casser le technique).
7. `npx tsc --noEmit` puis `npm run build`.
