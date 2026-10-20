# DEV — Documentation technique (Suivi Global / Point Commande Journalière)

Documentation destinée aux développeurs : architecture, flux de données,
démarrage, scripts, conventions et points d'attention.

---

## 1. Stack technique

| Élément        | Choix                                                             |
| -------------- | ----------------------------------------------------------------- |
| Front-end      | React 19 + TypeScript, Vite 8, Tailwind CSS v4 (`@tailwindcss/vite`) |
| UI             | `lucide-react` (icônes), `motion` (animations)                     |
| Back-end       | Express 4 (`server/index.ts`), exécuté avec `tsx`                  |
| Base de données| SQLite via `node:sqlite` (`server/db.ts`) — fichier `data/point-commande.db` |
| Alias          | `@/` → racine du projet (configuré dans `vite.config.ts` et `tsconfig.json`) |

Le serveur Express sert **l'API** (`/api/v1/...`) et **le front** :
en développement il branche le middleware Vite (HMR), en production il sert
le dossier `dist/`.

---

## 2. Prérequis et démarrage

**Prérequis :** Node.js (version récente, `node:sqlite` requis → Node 22+).

```bash
npm install
npm run dev        # lance tsx server/index.ts (API + Vite en middleware)
```

L'app est accessible sur l'URL affichée par Vite (par défaut
`http://localhost:3000` — voir `server/index.ts` pour le port exact).

### Scripts npm

| Script          | Rôle                                                          |
| --------------- | ------------------------------------------------------------- |
| `npm run dev`   | Démarre le serveur + Vite (développement, HMR).              |
| `npm run start` | Identique à `dev` (équivalent).                              |
| `npm run build` | Build production du front dans `dist/` (`vite build`).       |
| `npm run preview` | Sert le build Vite en local.                              |
| `npm run lint`  | Vérifie les types : `tsc --noEmit`.                          |
| `npm run clean` | Supprime `dist/` et `server.js`.                             |

> Il n'y a **pas** de compilation séparée du serveur : il tourne via `tsx`
> directement depuis les sources TypeScript.

### Vérification avant commit

```bash
npx tsc --noEmit     # ou npm run lint
npm run build
```

---

## 3. Arborescence

```
server/
  index.ts             Serveur Express : API REST + service du front
  db.ts                Couche SQLite : schéma, requêtes, helpers journal
src/
  main.tsx             Point d'entrée React (createRoot + StrictMode)
  App.tsx              Composant racine : session, vues, handlers, gardes
  index.css            Styles globaux + Tailwind
  types/
    card.ts            Types du domaine : CardItem, OrdreFabrication,
                       SousOrdreFabrication, CardJalon, statuts, OF, dest.
    suiviGlobal.ts     Types du Suivi Global (chaînes, cases, inspections)
  services/
    api.ts             Client HTTP : entetesJson + X-Profil-Id, historiqueApi
  context/
    ProfilContext.tsx  Contexte du profil connecté + useLectureSeule()
    JalonCatalogueContext.tsx  Catalogue des jalons (nomenclatures/statuts)
    InspectionsParCarteContext.tsx  Inspections indexées par carte
  utils/
    auth.ts            Profils, mots de passe, session, onglets autorisés
    jalons.ts          Logique des jalons (couleurs, échéances, tri)
    inspections.ts     Helpers inspections
    dateFrance.ts      Dates/heures au format France
    alertesManuelles.ts / alertesPopover.ts / alerteBlinking.ts  Alertes
    glisserCarte.ts    Glisser-déposer d'une carte (Suivi Global)
  data/
    mockData.ts        Données initiales (cartes, OFs)
    mockJalons.ts      Catalogue de jalons par défaut
    mockSuiviGlobal.ts Chaînes/cases du Suivi Global par défaut
  components/
    layout/
      LoginScreen.tsx      Écran d'accueil + choix du profil
      Header.tsx           En-tête (titre, session, déconnexion)
      ViewSwitcher.tsx     Onglets de vue (filtrage par profil)
      SessionBadge.tsx     Badge du profil connecté
    ui/
      FilterBar.tsx        Barre de recherche/filtres
      StatsOverview.tsx    Statistiques de synthèse
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
      SuiviGlobalView.tsx    Vue Suivi Global (chaînes, cases)
      LigneTableSuivi.tsx    Une ligne du Suivi Global
      InspectionCell.tsx / InspectionEtatMenu.tsx / InspectionHistoriquePopover.tsx
      ExpeditionModal.tsx / NouvelleChaineModal.tsx
    historique/
      HistoriqueView.tsx     Vue Historique des modifications
public/                Favicons, PWA (manifest), images
data/point-commande.db Base SQLite « live »
```

---

## 4. Démarrage de l'application (flux)

1. `main.tsx` monte `<App />`.
2. `App.tsx` lit la session (`lireSession()` depuis `utils/auth.ts`) dans
   `sessionStorage`.
   - Pas de session → `LoginScreen` (choix du profil, mot de passe pour les
     profils protégés).
   - Session → l'app est enveloppée dans `ProfilProvider` (`ProfilContext`).
3. La **vue initiale** est la vue mémorisée (`aic_vue_actuelle_v1`), mais elle
   est **contrainte** par les onglets autorisés du profil (`ongletsAutorises()`).
   Si la vue mémorisée est interdite, on force un onglet autorisé.
4. `ViewSwitcher` n'affiche que les onglets autorisés et se masque s'il n'en
   reste qu'un seul.
5. Les données (cartes, jalons, suivi, historique) sont chargées via
   `services/api.ts` (fetch vers `/api/v1/...`).

---

## 5. Authentification et profils

Tout est dans `src/utils/auth.ts` :

- `PROFILS` : liste des profils (`utilisateur`, `resp-planning`, `production`,
  `direction`) avec leurs métadonnées.
- `MOT_DE_PASSE_PROFILS = '1234'` : mot de passe commun aux profils protégés
  (`utilisateur` n'en a pas).
- `ongletsAutorises(profilId)` : renvoie les `OngletId` visibles pour le profil.
- Session : `lireSession()` / `enregistrerSession()` / `effacerSession()`,
  stockée dans `sessionStorage` sous `aic_session_profil_v1`
  (`{ profilId, connecteLe }`).

`ProfilContext` (`src/context/ProfilContext.tsx`) expose :

- `useProfil()` → le profil courant.
- `useLectureSeule()` → `true` pour le profil `utilisateur`.

Règles de droits :

| Profil        | Onglets autorisés                                                        | Écriture |
| ------------- | ------------------------------------------------------------------------ | -------- |
| utilisateur   | les 3 vues métier                                                        | aucune (lecture seule) |
| resp-planning | toutes                                                                   | toutes |
| production    | `tableaux-ofs` uniquement                                                | quantités d'OF seulement (`typeModifiable=false`) ; pas de création/suppression ni de fiche |
| direction     | `point-journalier`, `suivi-global`, `tableaux-ofs`, `historique`         | toutes |

Le profil connecté est envoyé au serveur via l'en-tête **`X-Profil-Id`**
(voir `services/api.ts`), ce qui permet au serveur de journaliser les
modifications avec leur auteur.

---

## 6. API REST (`server/index.ts`, montée sur `/api/v1`)

| Méthode | Route                            | Rôle                                        |
| ------- | -------------------------------- | ------------------------------------------- |
| GET     | `/jalons`                        | Catalogue des jalons                        |
| POST    | `/jalons`                        | Crée un jalon du catalogue                   |
| PATCH   | `/jalons/:code`                  | Modifie un jalon du catalogue                |
| DELETE  | `/jalons/:code`                  | Supprime un jalon du catalogue               |
| GET     | `/cards`                         | Liste des cartes                             |
| GET     | `/cards/:id`                     | Une carte                                    |
| POST    | `/cards`                         | Crée une carte                               |
| PUT     | `/cards/:id`                     | Remplace une carte                           |
| PATCH   | `/cards/:id`                     | Met à jour partiellement une carte           |
| DELETE  | `/cards/:id`                     | Supprime une carte                           |
| DELETE  | `/cards/:cardId/jalons/:code`    | Retire un jalon d'une carte                  |
| POST    | `/reset`                         | Réinitialise les données (données mock)      |
| GET     | `/stats`                         | Statistiques de synthèse                     |
| GET     | `/historique`                    | Journal des modifications (filtrable)        |
| DELETE  | `/historique`                    | Vide le journal                              |
| GET     | `/suivi-layout`                  | Layout du Suivi Global                       |
| PUT     | `/suivi-layout`                  | Sauvegarde le layout du Suivi Global         |

---

## 7. Base de données (`db.ts`)

SQLite via `node:sqlite`, fichier unique : `data/point-commande.db`.

Tables principales :

- Cartes, OFs et sous-OFs (patients du schéma de `types/card.ts`).
- Catalogue des jalons.
- `journal_modifications` (historique) : `id`, `at`, `profil`, `action`,
  `cible`, `details` (+ index).

Helpers du journal :

- `journaliser(...)` : insère une entrée lors d'une écriture.
- `listerJournal(...)` : liste antéchronologique filtrable (profil, date).
- `viderJournal()` : vide la table.

Le diff des cartes est calculé par `diffCarte()` + `CHAMPS_CARTE_SUIVIS` et
sérialisé par `detailler()` (JSON) au moment de la journalisation.

---

## 8. Historique des modifications

- Onglet visible uniquement pour le profil `direction`.
- `HistoriqueView.tsx` : liste antéchronologique, filtres par profil et par
  jour, **polling silencieux toutes les 4 s** (`historiqueApi.getAll`).
- Détail **champ par champ coloré** (maps `LIBELLE_CHAMP` / `COULEUR_CHAMP`,
  `afficherValeur`, `decoderDetail`).
- Côté client : `services/api.ts` (`historiqueApi`, types `EntreeHistorique`,
  `FiltresHistorique`).

> ⚠️ Après ajout/modification d'une route serveur (ex. `DELETE /historique`),
> il faut **redémarrer le serveur** (`tsx` ne recharge pas à chaud).

---

## 9. Conventions et points d'attention

- **Organisation des composants** : `src/components/` est découpé par domaine —
  `layout/` (châssis : Login, Header, onglets, badge), `ui/` (éléments réutilisables),
  `point-commande/`, `suivi-global/`, `historique/`. Le serveur vit dans
  `server/` (`index.ts` = API, `db.ts` = SQLite).
- **Imports** : depuis un composant d'un sous-dossier, pointer les modules
  partagés via l'alias `@/src/...` (ex. `@/src/utils/auth.ts`), et garder les
  imports relatifs `./X.tsx` pour les fichiers du même dossier.
- **Nommage métier** : le champ technique `card.batch` et sa colonne DB
  restent nommés `batch` ; seul l'affichage dit **« Saison »**. Idem pour les
  renommages d'affichage : ne pas toucher aux identifiants techniques.
- **Alignement des tableaux** : les en-têtes de `CardTable` sont uniformes
  (majuscules, style unique, alignés à gauche) ; les cellules suivent le même
  alignement.
- **Lecture seule** : toute action d'écriture doit être gardée par
  `lectureSeule` (UI) et rester cohérente avec les règles serveur.
- **Session** : `sessionStorage` → la session est propre à l'onglet. Le
  rafraîchissement (F5) la conserve.
- **Vérification obligatoire** avant de considérer une tâche terminée :
  `npx tsc --noEmit` **et** `npm run build`.
- Ne pas activer/désactiver HMR : `vite.config.ts` gère `DISABLE_HMR`
  (usages internes).
- **Favicons/PWA** : assets dans `public/` et `manifest.webmanifest`,
  référencés depuis `index.html`.

---

## 10. Ajouter une fonctionnalité — checklist

1. Étendre les types dans `src/types/card.ts` (ou `suiviGlobal.ts`).
2. Ajouter/Modifier le schéma et les requêtes dans `db.ts`.
3. Exposer/étendre la route dans `server/index.ts` (et journaliser si c'est une
   écriture à tracer).
4. Ajouter la méthode dans `src/services/api.ts`.
5. Câbler l'UI dans le composant concerné (garder les règles de profil).
6. Mettre à jour l'affichage / libellés si besoin (sans casser le technique).
7. `npx tsc --noEmit` puis `npm run build`.
