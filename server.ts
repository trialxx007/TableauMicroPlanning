import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CardItem, CardJalon } from './src/types/card.ts';
import {
  createJalon,
  deleteCard,
  deleteJalon,
  getCard,
  insertCard,
  listCards,
  listJalons,
  renameJalon,
  resetDatabase,
  updateCardData,
} from './db.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
      // Allow requests with no origin (like mobile apps, curl, same-origin)
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      return callback(null, true);
    },
    credentials: true,
  })
);

app.use(express.json());

// Helper to compute resteAProduire
function calculateReste(demandee: number, finie: number): number {
  return Math.max(0, demandee - finie);
}

// Helper to format date and time
function getCurrentDateTime() {
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  const timeStr = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);
  return { dateStr, timeStr };
}

// REST API v1
const apiRouter = express.Router();

/* ------------------------------------------------------------------ jalons */

// Catalogue global des types de jalons, partagé par toutes les cartes.
apiRouter.get('/jalons', (_req: Request, res: Response) => {
  res.json({ success: true, count: listJalons().length, data: listJalons() });
});

// Ajout d'un type de jalon au catalogue. Il devient disponible sur toutes les cartes.
apiRouter.post('/jalons', (req: Request, res: Response) => {
  try {
    const created = createJalon(req.body?.code, req.body?.libelle);
    res.status(201).json({ success: true, data: created, message: `Jalon ${created.code} ajouté` });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

apiRouter.patch('/jalons/:code', (req: Request, res: Response) => {
  try {
    res.json({ success: true, data: renameJalon(req.params.code, req.body?.libelle) });
  } catch (err) {
    res.status(400).json({ success: false, error: (err as Error).message });
  }
});

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

/** Nettoie les états de jalons reçus : seuls les codes connus du catalogue sont gardés. */
function parseJalons(value: unknown): CardJalon[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const connus = new Set(listJalons().map((j) => j.code));
  return value
    .filter((j): j is CardJalon => Boolean(j) && typeof (j as CardJalon).code === 'string')
    .map((j) => {
      const semaine = Number(j.semaine);
      return {
        code: (j as CardJalon).code,
        valide: Boolean((j as CardJalon).valide),
        ...(Number.isFinite(semaine) && semaine >= 1 && semaine <= 53 ? { semaine } : {}),
      };
    })
    .filter((j) => connus.has(j.code));
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
  // Une nouvelle carte démarre avec tous les jalons du catalogue à « En attente ».
  const jalons: CardJalon[] = Array.isArray(body.jalons)
    ? (parseJalons(body.jalons) as CardJalon[])
    : listJalons().map((j) => ({ code: j.code, valide: false }));

  const newCard: CardItem = {
    id: `CRD-${Date.now().toString().slice(-4)}`,
    client: String(body.client).trim(),
    nom: String(body.nom).trim(),
    reference: String(body.reference).trim(),
    modele: String(body.modele).trim(),
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

  // Les jalons sont des lignes dédiées : on ne les laisse pas passer par le spread.
  const { jalons, ...reste } = body as Partial<CardItem> & { jalons?: unknown };
  const updated = updateCardData(req.params.id, {
    ...reste,
    quantiteDemandee,
    quantiteFinie,
    resteAProduire,
    statut: newStatut,
    dateDernierPoint: dateStr,
    heureDernierPoint: timeStr,
    pointFaitAujourdhui: true,
    ...(jalons !== undefined ? { jalons: parseJalons(jalons) ?? existing.jalons } : {}),
  });

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
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Point Commande Journalière - Serveur démarré sur http://0.0.0.0:${PORT}`);
  });
}

start();
