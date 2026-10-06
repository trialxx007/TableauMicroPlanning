import { CardFormData, CardItem, normalizeOFType } from '../types/card.ts';
import { INITIAL_CARDS } from '../data/mockData.ts';
import { getNowParis } from '../utils/dateFrance.ts';

const STORAGE_KEY = 'point_commande_cards_cache_textile_v6';

function normalizeCards(cards: CardItem[]): CardItem[] {
  return (cards || []).map((c) => ({
    ...c,
    ofs: (c.ofs || []).map((o) => ({ ...o, type: normalizeOFType(o.type) })),
  }));
}

function getLocalFallback(): CardItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return normalizeCards(JSON.parse(raw));
    }
  } catch (e) {
    console.warn('localStorage non accessible', e);
  }
  return [...INITIAL_CARDS];
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
        const normalized = normalizeCards(json.data);
        saveLocalFallback(normalized);
        return normalized;
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
          const created = normalizeCards([json.data])[0];
          const list = getLocalFallback();
          list.unshift(created);
          saveLocalFallback(list);
          return created;
        }
      }
    } catch {
      // Fallback local
    }

    const quantiteDemandee = Number(data.quantiteDemandee) || 0;
    const quantiteFinie = Number(data.quantiteFinie) || 0;
    const { dateStr, timeStr } = getNowParis();
    const newCard: CardItem = {
      id: `CRD-${Date.now().toString().slice(-4)}`,
      client: data.client,
      nom: data.nom,
      reference: data.reference,
      modele: data.modele,
      dt: Boolean(data.dt),
      tc: Boolean(data.tc),
      sms: Boolean(data.sms),
      rdl: Boolean(data.rdl),
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
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const updated = normalizeCards([json.data])[0];
          const list = getLocalFallback().map((c) => (c.id === id ? updated : c));
          saveLocalFallback(list);
          return updated;
        }
      }
    } catch {
      // Fallback
    }

    const current = getLocalFallback();
    const index = current.findIndex((c) => c.id === id);
    if (index === -1) throw new Error('Carte non trouvée');

    const prev = current[index];
    const quantiteDemandee = data.quantiteDemandee !== undefined ? Number(data.quantiteDemandee) : prev.quantiteDemandee;
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

  async delete(id: string): Promise<void> {
    try {
      await fetch(`/api/v1/cards/${id}`, { method: 'DELETE' });
    } catch {
      // Ignore
    }
    const current = getLocalFallback().filter((c) => c.id !== id);
    saveLocalFallback(current);
  },

  resetDefaults(): CardItem[] {
    saveLocalFallback([...INITIAL_CARDS]);
    return [...INITIAL_CARDS];
  },
};
