import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { CardItem } from './src/types/card.ts';
import { INITIAL_CARDS } from './src/data/mockData.ts';

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

// In-memory fallback database
let cardsStore: CardItem[] = [...INITIAL_CARDS];

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

// GET all cards with optional search query
apiRouter.get('/cards', (req: Request, res: Response) => {
  const { search, statut, client } = req.query;
  let results = [...cardsStore];

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
  const card = cardsStore.find((c) => c.id === req.params.id);
  if (!card) {
    return res.status(404).json({ success: false, error: 'Carte non trouvée' });
  }
  res.json({ success: true, data: card });
});

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
  const newCard: CardItem = {
    id: `CRD-${Date.now().toString().slice(-4)}`,
    client: String(body.client).trim(),
    nom: String(body.nom).trim(),
    reference: String(body.reference).trim(),
    modele: String(body.modele).trim(),
    dt: Boolean(body.dt),
    tc: Boolean(body.tc),
    sms: Boolean(body.sms),
    rdl: Boolean(body.rdl),
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

  cardsStore.unshift(newCard);

  res.status(201).json({
    success: true,
    data: newCard,
    message: 'Carte créée avec succès',
  });
});

// PUT full update
apiRouter.put('/cards/:id', (req: Request, res: Response) => {
  const index = cardsStore.findIndex((c) => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Carte non trouvée' });
  }

  const body = req.body;
  const quantiteDemandee = Number(body.quantiteDemandee) || 0;
  const quantiteFinie = Number(body.quantiteFinie) || 0;
  const { dateStr, timeStr } = getCurrentDateTime();

  const updated: CardItem = {
    ...cardsStore[index],
    client: body.client ?? cardsStore[index].client,
    nom: body.nom ?? cardsStore[index].nom,
    reference: body.reference ?? cardsStore[index].reference,
    modele: body.modele ?? cardsStore[index].modele,
    dt: typeof body.dt === 'boolean' ? body.dt : cardsStore[index].dt,
    tc: typeof body.tc === 'boolean' ? body.tc : cardsStore[index].tc,
    sms: typeof body.sms === 'boolean' ? body.sms : cardsStore[index].sms,
    rdl: typeof body.rdl === 'boolean' ? body.rdl : cardsStore[index].rdl,
    okProd: typeof body.okProd === 'boolean' ? body.okProd : cardsStore[index].okProd,
    ofs: Array.isArray(body.ofs) ? body.ofs : cardsStore[index].ofs,
    quantiteDemandee,
    quantiteFinie,
    resteAProduire: calculateReste(quantiteDemandee, quantiteFinie),
    statut: body.statut ?? cardsStore[index].statut,
    dateDernierPoint: dateStr,
    heureDernierPoint: timeStr,
    pointFaitAujourdhui: true,
    decisionReunion: body.decisionReunion !== undefined ? body.decisionReunion : cardsStore[index].decisionReunion,
    notes: body.notes !== undefined ? body.notes : cardsStore[index].notes,
  };

  cardsStore[index] = updated;

  res.json({
    success: true,
    data: updated,
    message: 'Carte mise à jour avec succès',
  });
});

// PATCH partial update (daily point quantity, status, flags, meeting decisions)
apiRouter.patch('/cards/:id', (req: Request, res: Response) => {
  const index = cardsStore.findIndex((c) => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Carte non trouvée' });
  }

  const existing = cardsStore[index];
  const body = req.body;

  const quantiteDemandee = body.quantiteDemandee !== undefined ? Number(body.quantiteDemandee) : existing.quantiteDemandee;
  const quantiteFinie = body.quantiteFinie !== undefined ? Number(body.quantiteFinie) : existing.quantiteFinie;
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

  const updated: CardItem = {
    ...existing,
    ...body,
    quantiteDemandee,
    quantiteFinie,
    resteAProduire,
    statut: newStatut,
    dateDernierPoint: dateStr,
    heureDernierPoint: timeStr,
    pointFaitAujourdhui: true,
  };

  cardsStore[index] = updated;

  res.json({
    success: true,
    data: updated,
    message: 'Point journalier enregistré',
  });
});

// DELETE card
apiRouter.delete('/cards/:id', (req: Request, res: Response) => {
  const index = cardsStore.findIndex((c) => c.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ success: false, error: 'Carte non trouvée' });
  }

  const removed = cardsStore.splice(index, 1)[0];
  res.json({
    success: true,
    data: removed,
    message: 'Carte supprimée',
  });
});

// Stats summary for dashboard header
apiRouter.get('/stats', (_req: Request, res: Response) => {
  const totalCards = cardsStore.length;
  const totalDemandee = cardsStore.reduce((acc, c) => acc + c.quantiteDemandee, 0);
  const totalFinie = cardsStore.reduce((acc, c) => acc + c.quantiteFinie, 0);
  const totalReste = cardsStore.reduce((acc, c) => acc + c.resteAProduire, 0);
  const enCours = cardsStore.filter((c) => c.statut === 'EN_COURS').length;
  const terminees = cardsStore.filter((c) => c.statut === 'TERMINE').length;
  const bloquees = cardsStore.filter((c) => c.statut === 'BLOQUE').length;
  const enAttente = cardsStore.filter((c) => c.statut === 'EN_ATTENTE').length;

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
