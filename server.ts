import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CardItem, CardJalon } from './src/types/card.ts';
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
    res.status(201).json({ success: true, data: created, message: `Jalon ${created.code} ajouté` });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

apiRouter.patch('/jalons/:code', (req: Request, res: Response) => {
  try {
    // La grandeur est indépendante de l'intitulé : seule celle qui est présente
    // est écrite, l'autre garde sa valeur.
    const data =
      req.body?.categorie !== undefined
        ? setJalonCategorie(req.params.code, req.body.categorie)
        : renameJalon(req.params.code, req.body?.libelle);
    res.json({ success: true, data });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// Retrait du jalon sur une seule carte : le catalogue et les autres cartes restent intacts.
apiRouter.delete('/cards/:cardId/jalons/:code', (req: Request, res: Response) => {
  try {
    deleteJalonForCard(req.params.cardId, req.params.code);
    res.json({ success: true, message: `Jalon ${req.params.code} retiré de la carte` });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

// Suppression d'un code du catalogue partagé : le jalon disparaît de toutes les cartes.
apiRouter.delete('/jalons/:code', (req: Request, res: Response) => {
  try {
    deleteJalon(req.params.code);
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
        c.nom.toLowerCase().includes(q) ||
        c.reference.toLowerCase().includes(q) ||
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
    nettoyes.push({
      code,
      valide: Boolean((brut as CardJalon).valide),
      ...(Number.isFinite(semaine) && semaine >= 1 && semaine <= 53 ? { semaine } : {}),
    });
  }
  return nettoyes;
}

// POST new card
apiRouter.post('/cards', (req: Request, res: Response) => {
  const body = req.body;

  if (!body.client || !body.nom || !body.reference || !body.modele) {
    return res.status(400).json({
      success: false,
      error: 'Les champs client, nom, référence et modèle sont obligatoires',
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

  const newCard: CardItem = {
    id: prochainIdCarte(),
    client: String(body.client).trim(),
    nom: String(body.nom).trim(),
    reference: String(body.reference).trim(),
    modele: String(body.modele).trim(),
    ...(body.typeCarte === 'R' || body.typeCarte === 'T'
      ? { typeCarte: body.typeCarte }
      : {}),
    jalons,
    okProd: Boolean(body.okProd),
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

  const updated = updateCardData(req.params.id, {
    client: body.client ?? existant.client,
    nom: body.nom ?? existant.nom,
    reference: body.reference ?? existant.reference,
    modele: body.modele ?? existant.modele,
    ...(body.typeCarte === 'R' || body.typeCarte === 'T'
      ? { typeCarte: body.typeCarte }
      : existant.typeCarte
      ? { typeCarte: existant.typeCarte }
      : {}),
    jalons: parseJalons(body.jalons) ?? existant.jalons,
    okProd: typeof body.okProd === 'boolean' ? body.okProd : existant.okProd,
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
  'nom',
  'reference',
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

  const updated = updateCardData(req.params.id, patch);

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

  res.json({
    success: true,
    data: removed,
    message: 'Carte supprimée',
  });
});

// Reset demo data : rejoue le seed (cartes d'exemple + catalogue initial)
apiRouter.post('/reset', (_req: Request, res: Response) => {
  resetDatabase();

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
