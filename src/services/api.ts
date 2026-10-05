import { CardFormData, CardItem, JalonCatalogue } from '../types/card.ts';
import { CATALOGUE_INITIAL } from '../data/mockJalons.ts';
import { getNowParis } from '../utils/dateFrance.ts';
import { normaliserSemaine } from '../utils/jalons.ts';

/**
 * Cache hors ligne. La v6 correspond au passage aux jalons dynamiques : un cache
 * plus ancien contient les colonnes dt/tc/sms/rdl et doit être jeté, sinon les
 * cartes s'afficheraient sans aucun jalon.
 */
const STORAGE_KEY = 'point_commande_cards_cache_textile_v6';

function estCacheCompatible(raw: unknown): raw is CardItem[] {
  return (
    Array.isArray(raw) &&
    raw.every(
      (c) =>
        Boolean(c) &&
        typeof c === 'object' &&
        Array.isArray((c as CardItem).jalons)
    )
  );
}

function getLocalFallback(): CardItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (estCacheCompatible(parsed)) return parsed;
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.warn('localStorage non accessible', e);
  }
  return [];
}

function saveLocalFallback(cards: CardItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
  } catch (e) {
    console.warn('Erreur sauvegarde localStorage', e);
  }
}

export const cardApi = {
  async getAll(): Promise<CardItem[]> {
    try {
      const res = await fetch('/api/v1/cards');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        saveLocalFallback(json.data);
        return json.data;
      }
    } catch {
      // Fallback
    }
    return getLocalFallback();
  },

  async create(data: CardFormData): Promise<CardItem> {
    try {
      const res = await fetch('/api/v1/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const list = getLocalFallback();
          list.unshift(json.data);
          saveLocalFallback(list);
          return json.data;
        }
      }
    } catch {
      // Fallback local
    }

    const quantiteDemandee = Number(data.quantiteDemandee) || 0;
    const quantiteFinie = Number(data.quantiteFinie) || 0;
    const { dateStr, timeStr } = getNowParis();
    // Hors ligne, on se contente d'un id unique dans le cache local : le serveur
    // réattribue le sien à la première synchronisation réussie.
    const newCard: CardItem = {
      id: `CRD-L${Date.now().toString(36).toUpperCase()}`,
      client: data.client,
      nom: data.nom,
      reference: data.reference,
      modele: data.modele,
      jalons: Array.isArray(data.jalons)
        ? data.jalons.map((j) => ({
            code: j.code,
            valide: Boolean(j.valide),
            ...(normaliserSemaine(j.semaine) != null
              ? { semaine: normaliserSemaine(j.semaine) as number }
              : {}),
          }))
        : CATALOGUE_INITIAL.map((j) => ({ code: j.code, valide: false })),
      okProd: Boolean(data.okProd),
      ofs: data.ofs || [],
      quantiteDemandee,
      quantiteFinie,
      resteAProduire: Math.max(0, quantiteDemandee - quantiteFinie),
      statut: data.statut,
      dateCreation: dateStr,
      dateDernierPoint: dateStr,
      heureDernierPoint: timeStr,
      pointFaitAujourdhui: true,
      decisionReunion: data.decisionReunion,
      notes: data.notes,
    };

    const current = getLocalFallback();
    const updated = [newCard, ...current];
    saveLocalFallback(updated);
    return newCard;
  },

  async update(id: string, data: Partial<CardItem>): Promise<CardItem> {
    try {
      const res = await fetch(`/api/v1/cards/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        if (json?.success && json.data) {
          const list = getLocalFallback().map((c) => (c.id === id ? json.data : c));
          saveLocalFallback(list);
          return json.data;
        }
      } else {
        // Réponse explicite du serveur (404, 400…) : c'est une erreur métier,
        // pas une coupure réseau. Le repli local masquerait le problème.
        throw new Error(json?.error || `Erreur ${res.status}`);
      }
    } catch (err) {
      if (err instanceof Error && !/Failed to fetch|NetworkError|Load failed/i.test(err.message)) {
        throw err;
      }
      // Coupure réseau : repli sur le cache local.
    }

    const current = getLocalFallback();
    const index = current.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('Carte non trouvée');

    const prev = current[index];
    const quantiteDemandee =
      data.quantiteDemandee !== undefined ? Number(data.quantiteDemandee) : prev.quantiteDemandee;
    const quantiteFinie = data.quantiteFinie !== undefined ? Number(data.quantiteFinie) : prev.quantiteFinie;
    const resteAProduire = Math.max(0, quantiteDemandee - quantiteFinie);

    let statut = data.statut ?? prev.statut;
    if (data.quantiteFinie !== undefined && data.statut === undefined) {
      if (quantiteFinie >= quantiteDemandee && quantiteDemandee > 0) {
        statut = 'TERMINE';
      }
    }

    const { dateStr, timeStr } = getNowParis();
    const updatedCard: CardItem = {
      ...prev,
      ...data,
      quantiteDemandee,
      quantiteFinie,
      resteAProduire,
      statut,
      dateDernierPoint: dateStr,
      heureDernierPoint: timeStr,
      pointFaitAujourdhui: true,
    };

    current[index] = updatedCard;
    saveLocalFallback(current);
    return updatedCard;
  },

  /**
   * Remplace la carte entière (PUT). Utilisé par la modale d'édition, qui gère
   * toutes les zones d'un coup : un PATCH recalculerait le statut à partir des
   * quantités, ce qui écraserait un choix fait dans la modale.
   */
  async replace(id: string, data: CardFormData): Promise<CardItem> {
    try {
      const res = await fetch(`/api/v1/cards/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        if (json?.success && json.data) {
          const list = getLocalFallback().map((c) => (c.id === id ? json.data : c));
          saveLocalFallback(list);
          return json.data;
        }
      } else {
        throw new Error(json?.error || `Erreur ${res.status}`);
      }
    } catch (err) {
      if (err instanceof Error && !/Failed to fetch|NetworkError|Load failed/i.test(err.message)) {
        throw err;
      }
      // Coupure réseau : repli sur le cache local.
    }

    const current = getLocalFallback();
    const index = current.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('Carte non trouvée');

    const { dateStr, timeStr } = getNowParis();
    const quantiteDemandee = Number(data.quantiteDemandee) || 0;
    const quantiteFinie = Number(data.quantiteFinie) || 0;
    const updatedCard: CardItem = {
      ...(current[index] as CardItem),
      ...data,
      quantiteDemandee,
      quantiteFinie,
      resteAProduire: Math.max(0, quantiteDemandee - quantiteFinie),
      dateDernierPoint: dateStr,
      heureDernierPoint: timeStr,
      pointFaitAujourdhui: true,
    } as CardItem;

    current[index] = updatedCard;
    saveLocalFallback(current);
    return updatedCard;
  },

  async delete(id: string): Promise<void> {
    try {
      await fetch(`/api/v1/cards/${id}`, { method: 'DELETE' });
    } catch {
      // Ignore
    }
    const current = getLocalFallback().filter((c) => c.id !== id);
    saveLocalFallback(current);
  },

  /**
   * Remet la base dans son état de démonstration. Le seed vit côté serveur,
   * la seule source de vérité : on ne se contente plus de vider le cache local.
   */
  async resetDefaults(): Promise<CardItem[]> {
    try {
      const res = await fetch('/api/v1/reset', { method: 'POST' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          saveLocalFallback(json.data);
          return json.data;
        }
      }
    } catch {
      // Hors ligne : on garde l'affichage actuel plutôt que de vider l'écran.
    }
    return getLocalFallback();
  },
};

/** Catalogue des types de jalons, source de vérité côté serveur. */
export const jalonApi = {
  async getAll(): Promise<JalonCatalogue[]> {
    try {
      const res = await fetch('/api/v1/jalons');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) return json.data as JalonCatalogue[];
      }
    } catch {
      // Hors ligne : on garde le catalogue de départ, l'affichage reste utilisable.
    }
    return CATALOGUE_INITIAL;
  },

  /** Ajoute un type de jalon au catalogue global, donc disponible sur toutes les cartes. */
  async create(code: string, libelle: string): Promise<JalonCatalogue> {
    const res = await fetch('/api/v1/jalons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, libelle }),
    });
    const json = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !json.success) {
      throw new Error(json?.error || `Erreur ${res.status}`);
    }
    return json.data as JalonCatalogue;
  },

  async remove(code: string): Promise<void> {
    const res = await fetch(`/api/v1/jalons/${encodeURIComponent(code)}`, { method: 'DELETE' });
    const json = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !json.success) {
      throw new Error(json?.error || `Erreur ${res.status}`);
    }
  },
};
