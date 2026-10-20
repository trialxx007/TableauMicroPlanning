import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CardItem, CardJalon } from './src/types/card.ts';
import { normaliserDateJalon, okProdAuto } from './src/utils/jalons.ts';
import {
  createJalon,
  deleteCard,
  deleteJalon,
  deleteJalonForCard,
  getCard,
  insertCard,
  listCards,
  listJalons,
  prochainIdCarte,
  renameJalon,
  resetDatabase,
  setJalonCategorie,
  updateCardData,
  getSuiviGlobalLayout,
  setSuiviGlobalLayout,
  journaliser,
  listerJournal,
  viderJournal,
} from './db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PORT, APP_URL et DB_PATH sont lus au démarrage : sans ça, un .env local est ignoré.
dotenv.config({ path: path.resolve(__dirname, '.env.local') });
dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// CORS configuration (allow-list)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.APP_URL || '',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Requêtes sans Origin (curl, même origine) : toujours acceptées.
      // En développement tout passe ; en production seule l'allow-list est valable.
      if (!origin || process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
  })
);

app.use(express.json());

// Helper to compute resteAProduire
function calculateReste(demandee: number, finie: number): number {
  return Math.max(0, demandee - finie);
}

// Fuseau du site : GMT+3 (Etc/GMT-3), décalage fixe. Les horodatages des points
// restent donc identiques quel que soit le poste qui écrit dans la base.
const FUSEAU_HORAIRE = 'Etc/GMT-3';

// Helper to format date and time
function getCurrentDateTime() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_HORAIRE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  const timeStr = new Intl.DateTimeFormat('fr-FR', {
    timeZone: FUSEAU_HORAIRE,
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  return { dateStr, timeStr };
}

// REST API v1
const apiRouter = express.Router();

/**
 * Profil auteur d'une requête. Le client pose l'en-tête `X-Profil-Id` à chaque
 * écriture ; à défaut (curl, tests, anciens clients) on retombe sur
 * « inconnu » plutôt que de perdre la trace de la modification.
 */
function profilDe(req: Request): string {
  const brut = req.header('X-Profil-Id');
  const valeur = typeof brut === 'string' ? brut.trim() : '';
  return valeur || 'inconnu';
}

/** Libellé lisible d'une carte pour la colonne « cible » du journal. */
function cibleCarte(card: { id: string; modele?: string; batch?: string }): string {
  const texte = card.modele || card.batch || '';
  return texte ? `${card.id} · ${texte}` : card.id;
}

/**
 * Détail structuré d'une modification, stocké en JSON dans `details` : une liste
 * de champs touchés, chacun avec sa valeur avant/après. La clé (`k`) sert à la
 * fois de libellé technique (pour un rendu coloré par nature de champ côté
 * Direction) et de clé de comparaison.
 */
interface ChampModifie {
  k: string;
  a: unknown;
  b: unknown;
}

/** Sérialise un détail structuré pour la colonne `details` du journal. */
function detailler(champs: ChampModifie[], resume: string): string {
  return JSON.stringify({ v: 1, resume, champs });
}

/** Vrai si une valeur est « vide » au sens de l'affichage (null, '', undefined). */
function vide(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Compare deux cartes champ par champ selon une liste blanche, et renvoie les
 * champs réellement modifiés. Les jalons sont comparés globalement (un état de
 * jalon est un objet imbriqué) et résumés par leurs codes.
 */
const CHAMPS_CARTE_SUIVIS: { cle: string; lire: (c: CardItem) => unknown }[] = [
  { cle: 'client', lire: (c) => c.client },
  { cle: 'batch', lire: (c) => c.batch },
  { cle: 'modele', lire: (c) => c.modele },
  { cle: 'typeCarte', lire: (c) => c.typeCarte },
  { cle: 'quantiteDemandee', lire: (c) => c.quantiteDemandee },
  { cle: 'quantiteFinie', lire: (c) => c.quantiteFinie },
  { cle: 'statut', lire: (c) => c.statut },
  { cle: 'okProd', lire: (c) => Boolean(c.okProd) },
  { cle: 'decisionReunion', lire: (c) => c.decisionReunion },
  { cle: 'notes', lire: (c) => c.notes },
];

function diffCarte(avant: CardItem, apres: CardItem): ChampModifie[] {
  const champs: ChampModifie[] = [];
  for (const { cle, lire } of CHAMPS_CARTE_SUIVIS) {
    const a = lire(avant);
    const b = lire(apres);
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) {
      champs.push({ k: cle, a: vide(a) ? null : a, b: vide(b) ? null : b });
    }
  }

  // Jalons : on résume par les codes dont l'état (validé/semaine/date) a changé.
  const etat = (c: CardItem) =>
    new Map(
      c.jalons.map((j) => [
        j.code,
        JSON.stringify({ v: Boolean(j.valide), s: j.semaine ?? null, d: j.date ?? null }),
      ])
    );
  const avantMap = etat(avant);
  const apresMap = etat(apres);
  const codes = new Set([...avantMap.keys(), ...apresMap.keys()]);
  const codesModifies: string[] = [];
  for (const code of codes) {
    if (avantMap.get(code) !== apresMap.get(code)) codesModifies.push(code);
  }
  if (codesModifies.length) {
    champs.push({
      k: 'jalons',
      a: codesModifies.filter((c) => avantMap.has(c)).join(', ') || null,
      b: codesModifies.filter((c) => apresMap.has(c)).join(', ') || null,
    });
  }

  // OFs : nombre, et quantités globales (détail trop fin pour être lisible).
  if ((avant.ofs?.length ?? 0) !== (apres.ofs?.length ?? 0)) {
    champs.push({ k: 'ofsOrdre', a: avant.ofs?.length ?? 0, b: apres.ofs?.length ?? 0 });
  } else if (JSON.stringify(avant.ofs) !== JSON.stringify(apres.ofs)) {
    const somme = (c: CardItem) =>
      (c.ofs ?? []).reduce((s, o) => s + (Number(o.quantiteFinie) || 0), 0);
    champs.push({ k: 'ofsQuantite', a: somme(avant), b: somme(apres) });
  }

  return champs;
}

/* ------------------------------------------------------------------ jalons */

// Catalogue partagé des jalons : une seule base pour tout le monde. Il porte les
// codes, leurs intitulés et leur grandeur (vert / bleu), pas les états : un jalon
// ajouté sur une carte n'existe que sur cette carte (voir `card_jalons`).
apiRouter.get('/jalons', (_req: Request, res: Response) => {
  res.json({ success: true, count: listJalons().length, data: listJalons() });
});

/**
 * Ajout d'un jalon. `cardId` designates la carte qui le porte : sans lui, seul
 * l'enregistrement au catalogue partagé est fait.
 */
apiRouter.post('/jalons', (req: Request, res: Response) => {
  try {
    const cardId = typeof req.body?.cardId === 'string' ? req.body.cardId : undefined;
    const created = createJalon(req.body?.code, req.body?.libelle, req.body?.categorie, cardId);
    const carte = cardId ? getCard(cardId) : undefined;
    journaliser({
      profil: profilDe(req),
      action: 'jalon.ajoute',
      cible: carte ? cibleCarte(carte) : `catalogue · ${created.code}`,
      details: `Jalon ${created.code} (${created.libelle})`,
    });
    res.status(201).json({ success: true, data: created, message: `Jalon ${created.code} ajouté` });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

apiRouter.patch('/jalons/:code', (req: Request, res: Response) => {
  try {
    // La grandeur est indépendante de l'intitulé : seule celle qui est présente
    // est écrite, l'autre garde sa valeur.
    const parCategorie = req.body?.categorie !== undefined;
    const data = parCategorie
      ? setJalonCategorie(req.params.code, req.body.categorie)
      : renameJalon(req.params.code, req.body?.libelle);
    journaliser({
      profil: profilDe(req),
      action: parCategorie ? 'jalon.grandeur' : 'jalon.renomme',
      cible: `catalogue · ${req.params.code}`,
      details: parCategorie
        ? `Grandeur → ${data.categorie}`
        : `Intitulé → ${data.libelle}`,
    });
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// Retrait du jalon sur une seule carte : le catalogue et les autres cartes restent intacts.
apiRouter.delete('/cards/:cardId/jalons/:code', (req: Request, res: Response) => {
  try {
    deleteJalonForCard(req.params.cardId, req.params.code);
    const carte = getCard(req.params.cardId);
    journaliser({
      profil: profilDe(req),
      action: 'jalon.retire',
      cible: carte ? cibleCarte(carte) : req.params.cardId,
      details: `Jalon ${req.params.code}`,
    });
    res.json({ success: true, message: `Jalon ${req.params.code} retiré de la carte` });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// Suppression d'un code du catalogue partagé : le jalon disparaît de toutes les cartes.
apiRouter.delete('/jalons/:code', (req: Request, res: Response) => {
  try {
    deleteJalon(req.params.code);
    journaliser({
      profil: profilDe(req),
      action: 'jalon.supprime',
      cible: `catalogue · ${req.params.code}`,
    });
    res.json({ success: true, message: `Jalon ${req.params.code} supprimé` });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

/* ------------------------------------------------------------------ cartes */

// GET all cards with optional search query
apiRouter.get('/cards', (req: Request, res: Response) => {
  const { search, statut, client } = req.query;
  let results = listCards();

  if (typeof search === 'string' && search.trim() !== '') {
    const q = search.toLowerCase().trim();
    results = results.filter(
      (c) =>
        c.client.toLowerCase().includes(q) ||
        c.batch.toLowerCase().includes(q) ||
        c.modele.toLowerCase().includes(q)
    );
  }

  if (typeof statut === 'string' && statut !== 'ALL') {
    results = results.filter((c) => c.statut === statut);
  }

  if (typeof client === 'string' && client.trim() !== '') {
    results = results.filter((c) => c.client.toLowerCase() === client.toLowerCase());
  }

  res.json({
    success: true,
    count: results.length,
    data: results,
  });
});

// GET single card
apiRouter.get('/cards/:id', (req: Request, res: Response) => {
  const card = getCard(req.params.id);
  if (!card) {
    return res.status(404).json({ success: false, error: 'Carte non trouvée' });
  }
  res.json({ success: true, data: card });
});

/**
 * Nettoie les états de jalons reçus. Le catalogue partagé est la source des
 * intitulés : un code inconnu y est enregistré (intitulé = code) plutôt que
 * jeté, sinon le jalon ajouté sur une carte neuve disparaîtrait à l'enregistrement.
 */
function parseJalons(value: unknown): CardJalon[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const connus = new Set(listJalons().map((j) => j.code));
  const codes = new Set<string>();
  const nettoyes: CardJalon[] = [];

  for (const brut of value) {
    if (!brut || typeof (brut as CardJalon).code !== 'string') continue;
    const code = (brut as CardJalon).code;
    // Un jalon est unique par carte : le premier état gagné est retenu.
    if (codes.has(code)) continue;
    codes.add(code);
    if (!connus.has(code)) createJalon(code, code, (brut as CardJalon).categorie);
    const semaine = Number((brut as CardJalon).semaine);
    const semaineFin = Number((brut as CardJalon).semaineFin);
    const date = normaliserDateJalon((brut as CardJalon).date);
    const valideLe = (brut as CardJalon).valideLe;
    nettoyes.push({
      code,
      valide: Boolean((brut as CardJalon).valide),
      ...(Number.isFinite(semaine) && semaine >= 1 && semaine <= 53 ? { semaine } : {}),
      ...(Number.isFinite(semaineFin) && semaineFin >= 1 && semaineFin <= 53
        ? { semaineFin }
        : {}),
      ...(date != null ? { date } : {}),
      ...((brut as CardJalon).tbc ? { tbc: true } : {}),
      ...(typeof valideLe === 'string' && valideLe.trim() ? { valideLe } : {}),
    });
  }
  return nettoyes;
}

// POST new card
apiRouter.post('/cards', (req: Request, res: Response) => {
  const body = req.body;

  if (!body.client || !body.batch || !body.modele) {
    return res.status(400).json({
      success: false,
      error: 'Les champs client, batch et nom sont obligatoires',
    });
  }

  const quantiteDemandee = Number(body.quantiteDemandee) || 0;
  const quantiteFinie = Number(body.quantiteFinie) || 0;

  const { dateStr, timeStr } = getCurrentDateTime();
  // Les jalons sont uniques par carte : une nouvelle carte ne démarre avec aucun
  // jalon, uniquement ceux que l'utilisateur lui affecte.
  const jalons: CardJalon[] = Array.isArray(body.jalons)
    ? (parseJalons(body.jalons) as CardJalon[])
    : [];
  // Règle d'accord automatique : DT, TC, FT et RDL validés => OK Prod accordé.
  const okProdFinal = Boolean(body.okProd) || okProdAuto(jalons);

  const newCard: CardItem = {
    id: prochainIdCarte(),
    client: String(body.client).trim(),
    batch: String(body.batch).trim(),
    modele: String(body.modele).trim(),
    ...(body.typeCarte === 'R' || body.typeCarte === 'T'
      ? { typeCarte: body.typeCarte }
      : {}),
    jalons,
    okProd: okProdFinal,
    ...(okProdFinal ? { dateOkProd: String(body.dateOkProd || dateStr) } : {}),
    ofs: Array.isArray(body.ofs) ? body.ofs : [],
    quantiteDemandee,
    quantiteFinie,
    resteAProduire: calculateReste(quantiteDemandee, quantiteFinie),
    statut: body.statut || (quantiteFinie >= quantiteDemandee ? 'TERMINE' : 'EN_COURS'),
    dateCreation: dateStr,
    dateDernierPoint: dateStr,
    heureDernierPoint: timeStr,
    pointFaitAujourdhui: true,
    decisionReunion: body.decisionReunion ? String(body.decisionReunion).trim() : undefined,
    notes: body.notes ? String(body.notes).trim() : undefined,
  };

  const created = insertCard(newCard);

  journaliser({
    profil: profilDe(req),
    action: 'carte.creee',
    cible: cibleCarte(created),
    details: `Client ${created.client} · ${created.quantiteDemandee} demandées`,
  });

  res.status(201).json({
    success: true,
    data: created,
    message: 'Carte créée avec succès',
  });
});

// PUT full update
apiRouter.put('/cards/:id', (req: Request, res: Response) => {
  const existant = getCard(req.params.id);
  if (!existant) {
    return res.status(404).json({ success: false, error: 'Carte non trouvée' });
  }

  const body = req.body;
  const quantiteDemandee = Number(body.quantiteDemandee) || 0;
  const quantiteFinie = Number(body.quantiteFinie) || 0;
  const { dateStr, timeStr } = getCurrentDateTime();

  // Règle d'accord automatique : elle s'impose aux jalons portés par la carte.
  const jalonsPut = parseJalons(body.jalons) ?? existant.jalons;
  const okProdPut =
    (typeof body.okProd === 'boolean' ? body.okProd : existant.okProd) || okProdAuto(jalonsPut);

  const updated = updateCardData(req.params.id, {
    client: body.client ?? existant.client,
    batch: body.batch ?? existant.batch,
    modele: body.modele ?? existant.modele,
    ...(body.typeCarte === 'R' || body.typeCarte === 'T'
      ? { typeCarte: body.typeCarte }
      : existant.typeCarte
      ? { typeCarte: existant.typeCarte }
      : {}),
    jalons: jalonsPut,
    okProd: okProdPut,
    dateOkProd: okProdPut
      ? existant.dateOkProd ?? body.dateOkProd ?? dateStr
      : existant.dateOkProd,
    ofs: Array.isArray(body.ofs) ? body.ofs : existant.ofs,
    quantiteDemandee,
    quantiteFinie,
    resteAProduire: calculateReste(quantiteDemandee, quantiteFinie),
    statut: body.statut ?? existant.statut,
    dateDernierPoint: dateStr,
    heureDernierPoint: timeStr,
    pointFaitAujourdhui: true,
    decisionReunion:
      body.decisionReunion !== undefined ? body.decisionReunion : existant.decisionReunion,
    notes: body.notes !== undefined ? body.notes : existant.notes,
  });

  if (updated) {
    const champs = diffCarte(existant, updated);
    journaliser({
      profil: profilDe(req),
      action: 'carte.modifiee',
      cible: cibleCarte(updated),
      details: detailler(champs, champs.length ? '' : 'Fiche mise à jour'),
    });
  }

  res.json({
    success: true,
    data: updated,
    message: 'Carte mise à jour avec succès',
  });
});

/**
 * Champs qu'un PATCH est autorisé à modifier. Tout le reste de la carte (id,
 * dateCreation, champs dérivés) est hors d'atteinte d'un client.
 */
const CHAMPS_MODIFIABLES = [
  'client',
  'batch',
  'modele',
  'typeCarte',
  'okProd',
  'dateOkProd',
  'dateRdl',
  'ofs',
  'decisionReunion',
  'notes',
] as const;

// PATCH partial update (daily point quantity, status, flags, meeting decisions)
apiRouter.patch('/cards/:id', (req: Request, res: Response) => {
  const existing = getCard(req.params.id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Carte non trouvée' });
  }

  const body = req.body;

  const quantiteDemandee =
    body.quantiteDemandee !== undefined ? Number(body.quantiteDemandee) : existing.quantiteDemandee;
  const quantiteFinie =
    body.quantiteFinie !== undefined ? Number(body.quantiteFinie) : existing.quantiteFinie;
  const resteAProduire = calculateReste(quantiteDemandee, quantiteFinie);
  const { dateStr, timeStr } = getCurrentDateTime();

  let newStatut = body.statut ?? existing.statut;
  if (body.quantiteFinie !== undefined && body.statut === undefined) {
    if (quantiteFinie >= quantiteDemandee && quantiteDemandee > 0) {
      newStatut = 'TERMINE';
    } else if (quantiteFinie > 0 && existing.statut === 'EN_ATTENTE') {
      newStatut = 'EN_COURS';
    }
  }

  // Liste blanche explicite : un PATCH ne doit pas pouvoir réécrire les champs
  // qu'il ne connaît pas (dateCreation, id, champs dérivés⬦).
  const patch: Partial<CardItem> = {
    quantiteDemandee,
    quantiteFinie,
    resteAProduire,
    statut: newStatut,
    dateDernierPoint: dateStr,
    heureDernierPoint: timeStr,
    pointFaitAujourdhui: true,
  };
  for (const champ of CHAMPS_MODIFIABLES) {
    if (body[champ] !== undefined) (patch as Record<string, unknown>)[champ] = body[champ];
  }
  if (body.jalons !== undefined) {
    patch.jalons = parseJalons(body.jalons) ?? existing.jalons;
  }

  // Règle d'accord automatique : DT, TC, FT et RDL validés => OK Prod accordé,
  // y compris si le client tente de le révoquer tant que la condition tient.
  if (okProdAuto(patch.jalons ?? existing.jalons)) {
    patch.okProd = true;
    if (!existing.dateOkProd && patch.dateOkProd === undefined) patch.dateOkProd = dateStr;
  }

  const updated = updateCardData(req.params.id, patch);

  if (updated) {
    const champs = diffCarte(existing, updated);
    journaliser({
      profil: profilDe(req),
      action: 'carte.modifiee',
      cible: cibleCarte(updated),
      details: detailler(champs, champs.length ? '' : 'Point journalier enregistré'),
    });
  }

  res.json({
    success: true,
    data: updated,
    message: 'Point journalier enregistré',
  });
});

// DELETE card
apiRouter.delete('/cards/:id', (req: Request, res: Response) => {
  const removed = deleteCard(req.params.id);
  if (!removed) {
    return res.status(404).json({ success: false, error: 'Carte non trouvée' });
  }

  journaliser({
    profil: profilDe(req),
    action: 'carte.supprimee',
    cible: cibleCarte(removed),
  });

  res.json({
    success: true,
    data: removed,
    message: 'Carte supprimée',
  });
});

// Reset demo data : rejoue le seed (cartes d'exemple + catalogue initial)
apiRouter.post('/reset', (req: Request, res: Response) => {
  resetDatabase();

  journaliser({
    profil: profilDe(req),
    action: 'base.reinitialisee',
    cible: 'données de démonstration',
  });

  res.json({
    success: true,
    data: listCards(),
    message: 'Données réinitialisées (Atelier Textile Haut de Gamme)',
  });
});

// Stats summary for dashboard header
apiRouter.get('/stats', (_req: Request, res: Response) => {
  const cards = listCards();
  const totalCards = cards.length;
  const totalDemandee = cards.reduce((acc, c) => acc + c.quantiteDemandee, 0);
  const totalFinie = cards.reduce((acc, c) => acc + c.quantiteFinie, 0);
  const totalReste = cards.reduce((acc, c) => acc + c.resteAProduire, 0);
  const enCours = cards.filter((c) => c.statut === 'EN_COURS').length;
  const terminees = cards.filter((c) => c.statut === 'TERMINE').length;
  const bloquees = cards.filter((c) => c.statut === 'BLOQUE').length;
  const enAttente = cards.filter((c) => c.statut === 'EN_ATTENTE').length;

  res.json({
    success: true,
    data: {
      totalCards,
      totalDemandee,
      totalFinie,
      totalReste,
      pourcentageGlobal: totalDemandee > 0 ? Math.round((totalFinie / totalDemandee) * 100) : 0,
      enCours,
      terminees,
      bloquees,
      enAttente,
    },
});
});
/* ------------------------------------------------------------------ historique */

// Journal des modifications, servi à l'onglet Direction. Filtres optionnels :
// `profil`, `dateMin`, `dateMax` (AAAA-MM-JJ, fuseau du site), `limit`.
apiRouter.get('/historique', (req: Request, res: Response) => {
  try {
    const { profil, dateMin, dateMax, limit } = req.query;
    const data = listerJournal({
      ...(typeof profil === 'string' && profil.trim() ? { profil: profil.trim() } : {}),
      ...(typeof dateMin === 'string' && dateMin.trim() ? { dateMin: dateMin.trim() } : {}),
      ...(typeof dateMax === 'string' && dateMax.trim() ? { dateMax: dateMax.trim() } : {}),
      ...(typeof limit === 'string' && limit.trim() ? { limit: Number(limit) } : {}),
    });
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// Vide le journal (supprime les entrées, garde la table) : le vidage lui-même
// n'est pas journalisé, sinon la première entrée réapparaîtrait aussitôt.
apiRouter.delete('/historique', (_req: Request, res: Response) => {
  try {
    viderJournal();
    res.json({ success: true, message: 'Historique vidé' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

/* ------------------------------------------------------------------ suivi global layout */

// GET layout partagé
apiRouter.get('/suivi-layout', (_req: Request, res: Response) => {
  try {
    const layout = getSuiviGlobalLayout();
    res.json({ success: true, data: layout?.rows ?? [] });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// PUT layout partagé (remplace tout)
apiRouter.put('/suivi-layout', (req: Request, res: Response) => {
  try {
    const rows = req.body?.rows;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ success: false, error: 'rows doit être un tableau' });
    }
    setSuiviGlobalLayout(rows);
    journaliser({
      profil: profilDe(req),
      action: 'suivi.modifie',
      cible: `Suivi Global · ${rows.length} chaîne${rows.length > 1 ? 's' : ''}`,
    });
    res.json({ success: true, message: 'Layout Suivi Global sauvegardé' });
  } catch (err) {
    res.status(500).json({ success: false, error: (err as Error).message });
  }
});

// POST layout partagé : utilisé par navigator.sendBeacon à la fermeture de page.
// sendBeacon envoie le corps en text/plain (non lu par express.json), on parse donc
// le corps brut. Réponse 204 : sendBeacon ne lit pas la réponse.
apiRouter.post(
  '/suivi-layout',
  express.text({ type: '*/*', limit: '4mb' }),
  (req: Request, res: Response) => {
    try {
      const parsed = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const rows = parsed?.rows;
      if (!Array.isArray(rows)) {
        return res.status(400).json({ success: false, error: 'rows doit être un tableau' });
      }
      setSuiviGlobalLayout(rows);
      res.status(204).end();
    } catch (err) {
      res.status(500).json({ success: false, error: (err as Error).message });
    }
  }
);

// Mount /api/v1
app.use('/api/v1', apiRouter);

// Dernier rempart : une route qui lève renvoie du JSON, jamais une page HTML
// d'erreur que le client tenterait de parser comme une réponse d'API.
app.use((err: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
  console.error('Erreur API', err);
  if (res.headersSent) return;
  res.status(500).json({
    success: false,
    error: err instanceof Error ? err.message : 'Erreur interne du serveur',
  });
});

// Start server with Vite or static
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    // express 4 : '*' est un motif de chemin valide. express 5 exigerait '/*splat'.
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Point Commande Journalière - Serveur démarré sur http://0.0.0.0:${PORT}`);
  });
}

// Une erreur non gérée ne doit pas laisser le process sans réponse : on journalise
// et on renvoie un 500 JSON, sinon l'API reste muette et le client expire.
process.on('uncaughtException', (err) => {
  console.error('Exception non interceptée', err);
});
process.on('unhandledRejection', (err) => {
  console.error('Promesse rejetée sans gestionnaire', err);
});

start();
