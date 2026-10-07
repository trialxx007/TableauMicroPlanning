import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INITIAL_CARDS } from './src/data/mockData.ts';
import { CATALOGUE_INITIAL, CATEGORIES_PAR_CODE, cataloguePourType, categorieParCode } from './src/data/mockJalons.ts';
import type {
  CardItem,
  CardJalon,
  JalonCategorie,
  JalonCatalogue,
  JalonCode,
} from './src/types/card.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Emplacement du fichier SQLite. Surchargable par DB_PATH (utile pour les tests).
 * Par défaut data/point-commande.db, hors du dossier dist/ et ignoré par git.
 * Lu à la première connexion et non au chargement du module : db.ts est importé
 * par server.ts avant que dotenv n'ait eu l'occasion de lire le .env.
 */
function dbPath(): string {
  return process.env.DB_PATH || path.resolve(__dirname, 'data', 'point-commande.db');
}

let db: DatabaseSync | null = null;

function openDb(): DatabaseSync {
  if (db) return db;

  const chemin = dbPath();
  fs.mkdirSync(path.dirname(chemin), { recursive: true });
  const conn = new DatabaseSync(chemin);
  conn.exec('PRAGMA journal_mode = WAL');
  conn.exec('PRAGMA foreign_keys = ON');
  db = conn;
  return conn;
}

/**
 * `jalons` et `card_jalons` sont réellement relationnels : c'est la seule façon de
 * supporter un nombre variable de jalons, des colonnes booléennes ne le permettent pas.
 * Le reste de la carte vit dans la colonne JSON `cards.data` : les OFs et les
 * champs de suivi sont hétérogènes, les normaliser ici n'apporterait rien et
 * alourdirait chaque lecture. Si le besoin évolue, seul `data` est à migrer.
 */
function initSchema(conn: DatabaseSync): void {
  conn.exec(`
    CREATE TABLE IF NOT EXISTS jalons (
      code      TEXT PRIMARY KEY,
      libelle   TEXT NOT NULL,
      categorie TEXT NOT NULL DEFAULT 'STATUT',
      ordre     INTEGER NOT NULL DEFAULT 0,
      cree_le   TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id       TEXT PRIMARY KEY,
      data     TEXT NOT NULL,
      cree_le  TEXT NOT NULL,
      maj_le   TEXT
    );

    CREATE TABLE IF NOT EXISTS card_jalons (
      card_id  TEXT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      code     TEXT NOT NULL REFERENCES jalons(code) ON DELETE CASCADE,
      valide   INTEGER NOT NULL DEFAULT 0,
      semaine  INTEGER,
      PRIMARY KEY (card_id, code)
    );

    CREATE INDEX IF NOT EXISTS idx_card_jalons_card ON card_jalons(card_id);
  `);

  // Le classement des jalons par grandeur (vert / bleu) est arrivé après la création
  // de la table : une base existante n'a pas la colonne. `CREATE TABLE IF NOT EXISTS`
  // ne la rajoute pas, on l'ajoute donc ici, une fois, en idempotent.
  const colonnes = conn.prepare('PRAGMA table_info(jalons)').all() as { name: string }[];
  if (!colonnes.some((c) => c.name === 'categorie')) {
    conn.exec("ALTER TABLE jalons ADD COLUMN categorie TEXT NOT NULL DEFAULT 'STATUT'");
    // Les codes déjà saisis avant le classement retrouvent leur grandeur d'origine,
    // déduite du code : personne n'a à les reprendre un par un.
    for (const [code, categorie] of Object.entries(CATEGORIES_PAR_CODE)) {
      conn.prepare('UPDATE jalons SET categorie = ? WHERE code = ?').run(categorie, code);
    }
  }

  // Les nomenclatures sont désormais celles des deux natures de matière (R et T) :
  // le code A devient AI, et le statut SMS disparaît du catalogue. Ses états sont
  // repris sur AI quand elle existe, sinon supprimés, pour ne pas laisser un code
  // orphelin ni perdre une saisie faite sous l'ancien nom.
  const ancienA = conn.prepare('SELECT 1 FROM jalons WHERE code = ?').get('A');
  if (ancienA) {
    const cibleDejaLa = conn.prepare('SELECT 1 FROM jalons WHERE code = ?').get('AI');
    if (!cibleDejaLa) {
      conn.prepare(
        "UPDATE jalons SET code = 'AI', libelle = 'Articles Inclus', categorie = 'NOMENCLATURE' WHERE code = 'A'"
      ).run();
    }
    // `card_jalons` référence `jalons` : sans cascade en base, la FK est désactivée
    // par défaut, on déplace donc les états à la main avant de retirer l'ancien code.
    if (cibleDejaLa) {
      const etats = conn.prepare('SELECT card_id, valide, semaine FROM card_jalons WHERE code = ?').all('A') as {
        card_id: string;
        valide: number;
        semaine: number | null;
      }[];
      for (const e of etats) {
        conn.prepare(
          'INSERT OR REPLACE INTO card_jalons (card_id, code, valide, semaine) VALUES (?, ?, ?, ?)'
        ).run(e.card_id, 'AI', e.valide, e.semaine);
      }
    }
    conn.prepare('DELETE FROM card_jalons WHERE code = ?').run('A');
    conn.prepare('DELETE FROM jalons WHERE code = ?').run('A');
  }

  // SMS a été remplacé par la nomenclature AI : ses états ne se reportent pas sur un
  // autre code, ils sont simplement retirés avec lui.
  conn.prepare('DELETE FROM card_jalons WHERE code = ?').run('SMS');
  conn.prepare('DELETE FROM jalons WHERE code = ?').run('SMS');

  // Les codes du catalogue commun absent d'une base existante (FT l'a rejoint) sont
  // ajoutés, pour qu'une base créée avant ce changement ne les propose pas.
  const insertManquant = conn.prepare(
    'INSERT OR IGNORE INTO jalons (code, libelle, categorie, ordre, cree_le) VALUES (?, ?, ?, ?, ?)'
  );
  for (const j of CATALOGUE_INITIAL) {
    insertManquant.run(j.code, j.libelle, j.categorie, j.ordre, now());
  }
}

function now(): string {
  return new Date().toISOString();
}

/** Date du jour au format JJ/MM/AAAA sur le fuseau du site (GMT+3), comme le client. */
function dateDuJour(): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Etc/GMT-3',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date());
}

/**
 * Identifiant de carte lisible et unique. Le suffixe reprend le plus grand
 * numéro déjà attribué : `Date.now()` tronqué ne suffit pas, deux cartes créées
 * dans la même seconde Recevraient le même id et le second POST échouerait.
 */
export function prochainIdCarte(): string {
  const rows = getDb()
    .prepare("SELECT id FROM cards WHERE id LIKE 'CRD-%'")
    .all() as { id: string }[];
  let max = 0;
  for (const r of rows) {
    const n = Number.parseInt(r.id.slice(4), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `CRD-${String(max + 1).padStart(3, '0')}`;
}

/** Première initialisation : catalogue + jeu de démonstration, une seule fois. */
function seedIfEmpty(conn: DatabaseSync): void {
  const count = conn.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number };
  if (count.n > 0) return;

  const insertJalon = conn.prepare(
    'INSERT INTO jalons (code, libelle, categorie, ordre, cree_le) VALUES (?, ?, ?, ?, ?)'
  );
  const insertCard = conn.prepare(
    'INSERT INTO cards (id, data, cree_le, maj_le) VALUES (?, ?, ?, ?)'
  );
  const insertEtat = conn.prepare(
    'INSERT INTO card_jalons (card_id, code, valide, semaine) VALUES (?, ?, ?, ?)'
  );

  for (const j of cataloguePourType('R')) {
    insertJalon.run(j.code, j.libelle, j.categorie, j.ordre, now());
  }

  const stamp = now();
  for (const card of INITIAL_CARDS) {
    // Les colonnes dt/tc/sms/rdl de l'ancien jeu de données sont converties ici
    // en lignes card_jalons : c'est l'unique point de bascule du format figé.
    const ancien = card as unknown as Record<string, unknown>;
    const etats: CardJalon[] = cataloguePourType('R').map((j) => {
      const champ = j.code.toLowerCase();
      const semaine = normaliserSemaineDb(ancien[`${champ}Semaine`]);
      return {
        code: j.code,
        valide: Boolean(ancien[champ]),
        ...(semaine != null ? { semaine } : {}),
      };
    });

    const { id, ...reste } = card as unknown as Record<string, unknown>;
    delete reste.dt;
    delete reste.tc;
    delete reste.sms;
    delete reste.rdl;
    delete reste.dtSemaine;
    delete reste.tcSemaine;
    delete reste.smsSemaine;
    delete reste.rdlSemaine;

    insertCard.run(String(id), JSON.stringify(reste), stamp, stamp);
    for (const e of etats) {
      insertEtat.run(String(id), e.code, e.valide ? 1 : 0, e.semaine ?? null);
    }
  }
}

function normaliserSemaineDb(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(53, Math.max(1, Math.round(n)));
}

function getDb(): DatabaseSync {
  const conn = openDb();
  initSchema(conn);
  seedIfEmpty(conn);
  return conn;
}

/* ------------------------------------------------------------------ jalons */

/** Ligne de la table `jalons`, avec la grandeur qui décide de la couleur. */
interface JalonRow {
  code: string;
  libelle: string;
  categorie: string;
  ordre: number;
}

/** Une grandeur en base peut être plus ancienne ou Alté : on retombe sur le code. */
function lireCategorie(row: JalonRow): JalonCategorie {
  return row.categorie === 'NOMENCLATURE' || row.categorie === 'STATUT'
    ? row.categorie
    : categorieParCode(row.code);
}

function versCatalogue(row: JalonRow): JalonCatalogue {
  return {
    code: row.code,
    libelle: row.libelle,
    categorie: lireCategorie(row),
    ordre: row.ordre,
  };
}

const SELECT_JALON = 'SELECT code, libelle, categorie, ordre FROM jalons';

export function listJalons(): JalonCatalogue[] {
  const rows = getDb()
    .prepare(`${SELECT_JALON} ORDER BY ordre ASC, code ASC`)
    .all() as unknown as JalonRow[];
  return rows.map(versCatalogue);
}

/** Code normalisé : 3 caractères maximum, sans espace, pour rester lisible en pastille. */
export function normaliserCodeJalon(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 3);
}

/**
 * Grandeur demandée. Absente, elle est déduite du code ; fournie mais invalide,
 * c'est une erreur de client : on la refuse plutôt que d'en deviner une autre,
 * sinon l'utilisateur verrait une couleur qui n'est pas celle qu'il a choisie.
 */
function lireCategorieDemandee(categorie: unknown, code: string): JalonCategorie {
  if (categorie === undefined || categorie === null || categorie === '') {
    return categorieParCode(code);
  }
  if (categorie !== 'NOMENCLATURE' && categorie !== 'STATUT') {
    throw new Error('Grandeur de jalon invalide : utilisez NOMENCLATURE ou STATUT');
  }
  return categorie;
}

/**
 * Ajoute un jalon à UNE carte. Le code et son intitulé restent dans le catalogue
 * partagé (une seule base pour tout le monde), mais l'état n'est créé que pour la
 * carte visée : un jalon added sur un modèle ne touche pas les autres cartes.
 * Renvoie le jalon du catalogue et l'état initial de la carte.
 */
export function createJalon(
  code: string,
  libelle: string,
  categorie?: unknown,
  cardId?: string
): JalonCatalogue {
  const conn = getDb();
  const propre = normaliserCodeJalon(code);
  if (!propre) throw new Error('Le code du jalon est obligatoire');

  const texte = String(libelle ?? '').trim() || propre;
  let jalon = conn.prepare(`${SELECT_JALON} WHERE code = ?`).get(propre) as
    | JalonRow
    | undefined;

  if (!jalon) {
    const max = conn.prepare('SELECT MAX(ordre) AS m FROM jalons').get() as { m: number | null };
    const ordre = (max.m ?? 0) + 10;
    // La grandeur est figée à la création : elle décide de la couleur partout.
    const cat = lireCategorieDemandee(categorie, propre);
    conn
      .prepare('INSERT INTO jalons (code, libelle, categorie, ordre, cree_le) VALUES (?, ?, ?, ?, ?)')
      .run(propre, texte, cat, ordre, now());
    jalon = { code: propre, libelle: texte, categorie: cat, ordre };
  }

  if (cardId) {
    const carte = conn.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
    if (!carte) throw new Error(`Carte inconnue : ${cardId}`);
    // Une carte ne porte qu'une occurrence de chaque code : le jalon est unique par modèle.
    conn
      .prepare(
        'INSERT OR IGNORE INTO card_jalons (card_id, code, valide, semaine) VALUES (?, ?, 0, NULL)'
      )
      .run(cardId, propre);
  }

  return versCatalogue(jalon);
}

/** Retire un jalon d'UNE carte. Le catalogue partagé n'est pas touché :
 *  les autres cartes qui portent ce code le conservent. */
export function deleteJalonForCard(cardId: string, code: string): void {
  const conn = getDb();
  const carte = conn.prepare('SELECT id FROM cards WHERE id = ?').get(cardId);
  if (!carte) throw new Error(`Carte inconnue : ${cardId}`);
  conn.prepare('DELETE FROM card_jalons WHERE card_id = ? AND code = ?').run(cardId, code);
}

/** Renomme l'intitulé partagé d'un code, sans toucher aux cartes qui le portent. */
export function renameJalon(code: string, libelle: string): JalonCatalogue {
  const conn = getDb();
  const row = conn.prepare(`${SELECT_JALON} WHERE code = ?`).get(code) as JalonRow | undefined;
  if (!row) throw new Error(`Jalon inconnu : ${code}`);

  const texte = String(libelle ?? '').trim() || row.libelle;
  conn.prepare('UPDATE jalons SET libelle = ? WHERE code = ?').run(texte, code);
  return versCatalogue({ ...row, libelle: texte });
}

/** Change la grandeur d'un code : vert pour une nomenclature, bleu pour un statut.
 *  Toute la base s'y recolore, la grandeur étant portée par le catalogue. */
export function setJalonCategorie(code: string, categorie: unknown): JalonCatalogue {
  const conn = getDb();
  const row = conn.prepare(`${SELECT_JALON} WHERE code = ?`).get(code) as JalonRow | undefined;
  if (!row) throw new Error(`Jalon inconnu : ${code}`);
  if (categorie !== 'NOMENCLATURE' && categorie !== 'STATUT') {
    throw new Error('Grandeur de jalon invalide : utilisez NOMENCLATURE ou STATUT');
  }
  conn.prepare('UPDATE jalons SET categorie = ? WHERE code = ?').run(categorie, code);
  return versCatalogue({ ...row, categorie });
}

/** Supprime un code du catalogue partagé. Le `ON DELETE CASCADE` de `card_jalons`
 *  retire le jalon de toutes les cartes qui le portaient. */
export function deleteJalon(code: string): void {
  const conn = getDb();
  const row = conn.prepare('SELECT code FROM jalons WHERE code = ?').get(code);
  if (!row) throw new Error(`Jalon inconnu : ${code}`);
  conn.prepare('DELETE FROM jalons WHERE code = ?').run(code);
}

/* ------------------------------------------------------------------- cartes */

function etatsForCard(cardId: string): CardJalon[] {
  const rows = getDb()
    .prepare('SELECT code, valide, semaine FROM card_jalons WHERE card_id = ?')
    .all(cardId) as { code: string; valide: number; semaine: number | null }[];
  return rows.map((r) => ({
    code: r.code,
    valide: Boolean(r.valide),
    ...(r.semaine != null ? { semaine: r.semaine } : {}),
  }));
}

/**
 * Reconstitue une carte depuis la colonne JSON. `resteAProduire` et
 * `pointFaitAujourdhui` sont recalculés ici plutôt que lus : ils sont dérivés des
 * quantités et de la date du dernier point, les stocker les ferait diverger de
 * leur source dès qu'une écriture oublie de les mettre à jour.
 */
function hydrate(id: string, dataBrut: string): CardItem {
  const data = JSON.parse(dataBrut) as Omit<CardItem, 'id' | 'jalons'>;
  const quantiteDemandee = Number(data.quantiteDemandee) || 0;
  const quantiteFinie = Number(data.quantiteFinie) || 0;
  return {
    ...data,
    id,
    quantiteDemandee,
    quantiteFinie,
    resteAProduire: Math.max(0, quantiteDemandee - quantiteFinie),
    pointFaitAujourdhui: data.dateDernierPoint === dateDuJour(),
    jalons: etatsForCard(id),
  };
}

export function listCards(): CardItem[] {
  const rows = getDb()
    .prepare('SELECT id, data FROM cards ORDER BY cree_le DESC, id DESC')
    .all() as { id: string; data: string }[];
  return rows.map((r) => hydrate(r.id, r.data));
}

export function getCard(id: string): CardItem | undefined {
  const row = getDb().prepare('SELECT id, data FROM cards WHERE id = ?').get(id) as
    | { id: string; data: string }
    | undefined;
  return row ? hydrate(row.id, row.data) : undefined;
}

/** Écrit les états de jalons fournis et efface ceux qui ne sont plus au catalogue. */
function writeJalons(cardId: string, etats: CardJalon[] | undefined): void {
  const conn = getDb();
  if (etats === undefined) return;

  const insert = conn.prepare(`
    INSERT INTO card_jalons (card_id, code, valide, semaine) VALUES (?, ?, ?, ?)
    ON CONFLICT(card_id, code) DO UPDATE SET valide = excluded.valide, semaine = excluded.semaine
  `);
  const connus = new Set(
    (conn.prepare('SELECT code FROM jalons').all() as { code: string }[]).map((r) => r.code)
  );

  for (const e of etats) {
    if (!connus.has(e.code)) continue;
    insert.run(cardId, e.code, e.valide ? 1 : 0, e.semaine ?? null);
  }
}

export function insertCard(card: CardItem): CardItem {
  const conn = getDb();
  const { id, jalons, resteAProduire: _reste, pointFaitAujourdhui: _point, ...reste } = card;
  conn
    .prepare('INSERT INTO cards (id, data, cree_le, maj_le) VALUES (?, ?, ?, ?)')
    .run(id, JSON.stringify(reste), now(), now());
  writeJalons(id, jalons);
  return getCard(id) as CardItem;
}

export function updateCardData(id: string, data: Partial<CardItem>): CardItem | undefined {
  const conn = getDb();
  const row = conn.prepare('SELECT data FROM cards WHERE id = ?').get(id) as
    | { data: string }
    | undefined;
  if (!row) return undefined;

  const actuel = JSON.parse(row.data) as Record<string, unknown>;
  const { jalons, ...patch } = data as Partial<CardItem> & { jalons?: CardJalon[] };
  // `id` et `jalons` ont leur propre colonne, et les deux champs dérivés sont
  // recalculés à la lecture : les écrire ici serait immédiatement écrasé.
  const fusionne: Record<string, unknown> = { ...actuel, ...patch };
  for (const interdit of ['id', 'jalons', 'resteAProduire', 'pointFaitAujourdhui']) {
    delete fusionne[interdit];
  }

  conn
    .prepare('UPDATE cards SET data = ?, maj_le = ? WHERE id = ?')
    .run(JSON.stringify(fusionne), now(), id);
  writeJalons(id, jalons);
  return getCard(id);
}

export function deleteCard(id: string): CardItem | undefined {
  const conn = getDb();
  const card = getCard(id);
  if (!card) return undefined;
  conn.prepare('DELETE FROM cards WHERE id = ?').run(id);
  return card;
}

/** Remet la base dans son état de premier démarrage (développement). */
export function resetDatabase(): void {
  const conn = getDb();
  conn.exec('DELETE FROM card_jalons; DELETE FROM jalons; DELETE FROM cards;');
  seedIfEmpty(conn);
}

export function cardJalonOf(card: CardItem | undefined, code: JalonCode): CardJalon | undefined {
  return card?.jalons.find((j) => j.code === code);
}
