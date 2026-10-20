import { CardFormData, CardItem, JalonCategorie, JalonCatalogue } from '../types/card.ts';
import { CATALOGUE_INITIAL, cataloguePourType, categorieParCode } from '../data/mockJalons.ts';
import { getNowParis } from '../utils/dateFrance.ts';
import { normaliserDateJalon, normaliserSemaine } from '../utils/jalons.ts';

/**
 * Cache hors ligne. La v6 correspond au passage aux jalons dynamiques : un cache
 * plus ancien contient les colonnes dt/tc/sms/rdl et doit être jeté, sinon les
 * cartes s'afficheraient sans aucun jalon.
 */
const STORAGE_KEY = 'point_commande_cards_cache_textile_v6';

/** Clé de session du profil connecté (miroir de `utils/auth.ts`). */
const SESSION_KEY = 'aic_session_profil_v1';

/**
 * Identifiant du profil connecté, lu au moment de la requête (jamais mis en
 * cache : l'utilisateur peut se déconnecter/reconnecter sans recharger le module).
 * Sert l'en-tête `X-Profil-Id` qui alimente le journal des modifications.
 */
function profilCourant(): string {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return 'inconnu';
    const parsed: unknown = JSON.parse(raw);
    const id = (parsed as { profilId?: unknown })?.profilId;
    return typeof id === 'string' && id ? id : 'inconnu';
  } catch {
    return 'inconnu';
  }
}

/** En-têtes JSON communs, avec le profil auteur pour le journal côté serveur. */
function entetesJson(): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Profil-Id': profilCourant() };
}

/** En-tête seul, pour les requêtes sans corps (DELETE). */
function enteteProfil(): Record<string, string> {
  return { 'X-Profil-Id': profilCourant() };
}

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
        headers: entetesJson(),
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
      batch: data.batch,
      modele: data.modele,
      ...(data.typeCarte ? { typeCarte: data.typeCarte } : {}),
      jalons: Array.isArray(data.jalons)
        ? data.jalons.map((j) => ({
            code: j.code,
            valide: Boolean(j.valide),
            ...(normaliserSemaine(j.semaine) != null
              ? { semaine: normaliserSemaine(j.semaine) as number }
              : {}),
            ...(normaliserDateJalon(j.date) != null ? { date: normaliserDateJalon(j.date) as string } : {}),
            ...(j.tbc ? { tbc: true } : {}),
          }))
        : cataloguePourType(data.typeCarte ?? 'R').map((j) => ({
            code: j.code,
            valide: false,
          })),
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
        headers: entetesJson(),
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
        headers: entetesJson(),
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
      await fetch(`/api/v1/cards/${id}`, { method: 'DELETE', headers: enteteProfil() });
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

/**
 * Jalons. Le catalogue (codes + intitulés + grandeur) est partagé par tout le monde,
 * mais un jalon ajouté est propre à la carte visée : les autres cartes n'en portent pas.
 */
export const jalonApi = {
  async getAll(): Promise<JalonCatalogue[]> {
    try {
      const res = await fetch('/api/v1/jalons');
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data)) {
          // Un serveur plus ancien n'envoie pas la grandeur : on la déduit du code
          // plutôt que de laisser un jalon sans couleur.
          return (json.data as JalonCatalogue[]).map((j) => ({
            ...j,
            categorie: j.categorie ?? categorieParCode(j.code),
          }));
        }
      }
    } catch {
      // Hors ligne : on garde le catalogue de départ, l'affichage reste utilisable.
    }
    return CATALOGUE_INITIAL;
  },

  /**
   * Ajoute un jalon à la carte `cardId`. Sans `cardId`, seul l'enregistrement au
   * catalogue partagé est fait, ce qui ne crée aucun état sur les cartes.
   * `categorie` détermine la couleur : vert pour une nomenclature, bleu pour un
   * statut. Absente, elle est déduite du code.
   */
  async create(
    code: string,
    libelle: string,
    categorie: JalonCategorie = 'STATUT',
    cardId?: string
  ): Promise<JalonCatalogue> {
    const res = await fetch('/api/v1/jalons', {
      method: 'POST',
      headers: entetesJson(),
      body: JSON.stringify({ code, libelle, categorie, ...(cardId ? { cardId } : {}) }),
    });
    const json = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !json.success) {
      throw new Error(json?.error || `Erreur ${res.status}`);
    }
    return json.data as JalonCatalogue;
  },

  /** Change la grandeur d'un code du catalogue : toutes les cartes se recolent. */
  async setCategorie(code: string, categorie: JalonCategorie): Promise<JalonCatalogue> {
    const res = await fetch(`/api/v1/jalons/${encodeURIComponent(code)}`, {
      method: 'PATCH',
      headers: entetesJson(),
      body: JSON.stringify({ categorie }),
    });
    const json = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !json.success) {
      throw new Error(json?.error || `Erreur ${res.status}`);
    }
    return json.data as JalonCatalogue;
  },

  /** Retire le jalon de cette carte seulement : le catalogue et les autres cartes restent intacts. */
  async removeFromCard(cardId: string, code: string): Promise<void> {
    const res = await fetch(
      `/api/v1/cards/${encodeURIComponent(cardId)}/jalons/${encodeURIComponent(code)}`,
      { method: 'DELETE', headers: enteteProfil() }
    );
    const json = await res.json().catch(() => ({ success: false }));
    if (!res.ok || !json.success) {
      throw new Error(json?.error || `Erreur ${res.status}`);
    }
  },
};

/* ------------------------------------------------------------------ suivi global layout */

export interface SuiviGlobalLayoutRow {
  id: string;
  nom: string;
  categorieId: string;
  dotColor: string;
  modeleEnCoursCards: (unknown | null)[];
  inspections: unknown[];
  prochainsLancementsCards: unknown[];
  expeditionCards?: unknown[];
  alertes?: unknown[];
}

export const suiviGlobalApi = {
  async getLayout(): Promise<SuiviGlobalLayoutRow[]> {
    try {
      const res = await fetch('/api/v1/suivi-layout');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    } catch {
      // Fallback localStorage si serveur indisponible
    }
    // Fallback localStorage (pour compatibilité / hors ligne)
    try {
      const raw = localStorage.getItem('suivi_global_rows_v3');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  },

  async setLayout(rows: SuiviGlobalLayoutRow[]): Promise<void> {
    try {
      const res = await fetch('/api/v1/suivi-layout', {
        method: 'PUT',
        headers: entetesJson(),
        body: JSON.stringify({ rows }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
    } catch (e) {
      console.warn('Erreur sauvegarde layout serveur, fallback localStorage', e);
    }
    // Fallback localStorage toujours écrit pour accès immédiat
    try {
      localStorage.setItem('suivi_global_rows_v3', JSON.stringify(rows));
    } catch {}
  },
};

/* ---------------------------------------------------------- historique (audit) */

/** Une entrée du journal des modifications, telle que servie par l'API. */
export interface EntreeHistorique {
  id: number;
  at: string;
  profil: string;
  action: string;
  cible: string;
  details?: string;
}

/** Filtres de lecture de l'historique. Tous optionnels. */
export interface FiltresHistorique {
  profil?: string;
  /** AAAA-MM-JJ (fuseau du site), borne basse incluse. */
  dateMin?: string;
  /** AAAA-MM-JJ (fuseau du site), borne haute incluse. */
  dateMax?: string;
  limit?: number;
}

/** Journal des modifications (onglet Direction). */
export const historiqueApi = {
  async getAll(filtres: FiltresHistorique = {}): Promise<EntreeHistorique[]> {
    const params = new URLSearchParams();
    if (filtres.profil) params.set('profil', filtres.profil);
    if (filtres.dateMin) params.set('dateMin', filtres.dateMin);
    if (filtres.dateMax) params.set('dateMax', filtres.dateMax);
    if (filtres.limit) params.set('limit', String(filtres.limit));
    const suffixe = params.toString();
    try {
      const res = await fetch(`/api/v1/historique${suffixe ? `?${suffixe}` : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) return json.data as EntreeHistorique[];
    } catch {
      // Serveur indisponible : l'onglet affichera une liste vide.
    }
    return [];
  },

  /** Vide le journal (supprime les entrées, garde la table). */
  async vider(): Promise<boolean> {
    try {
      const res = await fetch('/api/v1/historique', {
        method: 'DELETE',
        headers: enteteProfil(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
