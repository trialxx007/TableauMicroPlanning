import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INITIAL_CARDS } from './src/data/mockData.ts';
import { CATALOGUE_INITIAL } from './src/data/mockJalons.ts';
import type { CardItem, CardJalon, JalonCatalogue, JalonCode } from './src/types/card.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Emplacement du fichier SQLite. Surchargable par DB_PATH (utile pour les tests).
 * Par défaut data/point-commande.db, hors du dossier dist/ et ignoré par git.
 */
const DB_PATH = process.env.DB_PATH || path.resolve(__dirname, 'data', 'point-commande.db');

let db: DatabaseSync | null = null;

function openDb(): DatabaseSync {
  if (db) return db;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const conn = new DatabaseSync(DB_PATH);
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
      code     TEXT PRIMARY KEY,
      libelle  TEXT NOT NULL,
      ordre    INTEGER NOT NULL DEFAULT 0,
      cree_le  TEXT NOT NULL
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
}

function now(): string {
  return new Date().toISOString();
}

/** Première initialisation : catalogue + jeu de démonstration, une seule fois. */
function seedIfEmpty(conn: DatabaseSync): void {
  const count = conn.prepare('SELECT COUNT(*) AS n FROM cards').get() as { n: number };
  if (count.n > 0) return;

  const insertJalon = conn.prepare(
    'INSERT INTO jalons (code, libelle, ordre, cree_le) VALUES (?, ?, ?, ?)'
  );
  const insertCard = conn.prepare(
    'INSERT INTO cards (id, data, cree_le, maj_le) VALUES (?, ?, ?, ?)'
  );
  const insertEtat = conn.prepare(
    'INSERT INTO card_jalons (card_id, code, valide, semaine) VALUES (?, ?, ?, ?)'
  );

  for (const j of CATALOGUE_INITIAL) {
    insertJalon.run(j.code, j.libelle, j.ordre, now());
  }

  const stamp = now();
  for (const card of INITIAL_CARDS) {
    // Les colonnes dt/tc/sms/rdl de l'ancien jeu de données sont converties ici
    // en lignes card_jalons : c'est l'unique point de bascule du format figé.
    const ancien = card as unknown as Record<string, unknown>;
    const etats: CardJalon[] = CATALOGUE_INITIAL.map((j) => {
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

export function listJalons(): JalonCatalogue[] {
  const rows = getDb()
    .prepare('SELECT code, libelle, ordre FROM jalons ORDER BY ordre ASC, code ASC')
    .all() as { code: string; libelle: string; ordre: number }[];
  return rows.map((r) => ({ code: r.code, libelle: r.libelle, ordre: r.ordre }));
}

/** Code normalisé : 3 caractères maximum, sans espace, pour rester lisible en pastille. */
export function normaliserCodeJalon(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 3);
}

export function createJalon(code: string, libelle: string): JalonCatalogue {
  const conn = getDb();
  const propre = normaliserCodeJalon(code);
  if (!propre) throw new Error('Le code du jalon est obligatoire');

  const doublon = conn.prepare('SELECT code FROM jalons WHERE code = ?').get(propre);
  if (doublon) throw new Error(`Le jalon ${propre} existe déjà`);

  const texte = String(libelle ?? '').trim() || propre;
  const max = conn.prepare('SELECT MAX(ordre) AS m FROM jalons').get() as { m: number | null };
  const ordre = (max.m ?? 0) + 10;

  conn.prepare('INSERT INTO jalons (code, libelle, ordre, cree_le) VALUES (?, ?, ?, ?)').run(
    propre,
    texte,
    ordre,
    now()
  );

  // Le catalogue est global : toutes les cartes existantes démarrent le jalon
  // à « En attente », matérialisé tout de suite pour rester explicite en base.
  const cartes = conn.prepare('SELECT id FROM cards').all() as { id: string }[];
  const insert = conn.prepare(
    'INSERT OR IGNORE INTO card_jalons (card_id, code, valide, semaine) VALUES (?, ?, 0, NULL)'
  );
  for (const c of cartes) insert.run(c.id, propre);

  return { code: propre, libelle: texte, ordre };
}

export function renameJalon(code: string, libelle: string): JalonCatalogue {
  const conn = getDb();
  const row = conn.prepare('SELECT code, libelle, ordre FROM jalons WHERE code = ?').get(code) as
    | { code: string; libelle: string; ordre: number }
    | undefined;
  if (!row) throw new Error(`Jalon inconnu : ${code}`);

  const texte = String(libelle ?? '').trim() || row.libelle;
  conn.prepare('UPDATE jalons SET libelle = ? WHERE code = ?').run(texte, code);
  return { code: row.code, libelle: texte, ordre: row.ordre };
}

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

function hydrate(id: string, dataBrut: string): CardItem {
  return { id, ...(JSON.parse(dataBrut) as Omit<CardItem, 'id' | 'jalons'>), jalons: etatsForCard(id) };
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
  const { id, jalons, ...reste } = card;
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
  const { id: _ignoreId, jalons, ...patch } = data as Partial<CardItem> & {
    jalons?: CardJalon[];
  };
  // Ces champs sont dérivés ou vivaient dans une colonne dédiée : jamais dans le JSON.
  const fusionne: Record<string, unknown> = { ...actuel, ...patch };
  for (const interdit of [
    'id',
    'jalons',
    'resteAProduire',
    'dateDernierPoint',
    'heureDernierPoint',
    'pointFaitAujourdhui',
  ]) {
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
