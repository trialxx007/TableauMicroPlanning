import { useState, useEffect, useMemo, useRef } from 'react';
import { CardFormData, CardItem, CardStatus, JalonCatalogue, normalizeOFType } from './types/card.ts';
import { cardApi, jalonApi } from './services/api.ts';
import { Header } from './components/layout/Header.tsx';
import { StatsOverview, KpiFilterType } from './components/ui/StatsOverview.tsx';
import { FilterBar, SortField, SortOrder } from './components/ui/FilterBar.tsx';
import { CardTable } from './components/point-commande/CardTable.tsx';
import { ArchiveView } from './components/point-commande/ArchiveView.tsx';
import { CardModal } from './components/point-commande/CardModal.tsx';
import { HistoriqueView } from './components/historique/HistoriqueView.tsx';
import { SuiviGlobalView } from './components/suivi-global/SuiviGlobalView.tsx';
import { TableauxOFsView } from './components/point-commande/TableauxOFsView.tsx';
import { DeveloppementView } from './components/DeveloppementView.tsx';
import { AppPage } from './components/layout/ViewSwitcher.tsx';
import { LoginScreen } from './components/layout/LoginScreen.tsx';
import { JalonCatalogueProvider } from './context/JalonCatalogueContext.tsx';
import { ProfilProvider } from './context/ProfilContext.tsx';
import { InspectionsParCarteProvider, InspectionsParCarte } from './context/InspectionsParCarteContext.tsx';
import { getEtatJalon, PREFIXE_JALON_MANQUANT } from './utils/jalons.ts';
import { getNowParis } from './utils/dateFrance.ts';
import {
  Profil,
  SessionProfil,
  effacerSession,
  enregistrerSession,
  lireSession,
  ongletsAutorises,
} from './utils/auth.ts';
import { RefreshCw, FileSpreadsheet, Plus } from 'lucide-react';

export default function App() {
  const [session, setSession] = useState<SessionProfil | null>(() => lireSession());
  const [currentPage, setCurrentPage] = useState<AppPage>(() => {
    const sauvegarde = sessionStorage.getItem('aic_vue_actuelle_v1');
    const memoire: AppPage =
      sauvegarde === 'suivi-global' ||
      sauvegarde === 'point-journalier' ||
      sauvegarde === 'archive' ||
      sauvegarde === 'tableaux-ofs' ||
      sauvegarde === 'historique' ||
      sauvegarde === 'developpement'
        ? sauvegarde
        : 'point-journalier';
    // La session est relue ici, pas au rendu suivant : sinon le premier écran
    // afficherait un onglet interdit (ex. Production sur « Point Commande »).
    const sessionInitiale = lireSession();
    const autorises = sessionInitiale ? ongletsAutorises(sessionInitiale.profil.id) : null;
    return autorises && !autorises.includes(memoire) ? autorises[0] : memoire;
  });
  const [cards, setCards] = useState<CardItem[]>([]);
  const [catalogue, setCatalogue] = useState<JalonCatalogue[]>([]);
  const [inspectionsParCarte, setInspectionsParCarte] =
    useState<InspectionsParCarte>({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [flagFilter, setFlagFilter] = useState('ALL');
  const [selectedClient, setSelectedClient] = useState('ALL');
  const [kpiFilter, setKpiFilter] = useState<KpiFilterType>('ALL');
  const [sortField, setSortField] = useState<SortField>('resteAProduire');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CardItem | null>(null);
  const [createPrefill, setCreatePrefill] = useState<Partial<CardFormData> | null>(null);
  const onCreateCardRef = useRef<((card: CardItem) => void) | null>(null);
  const [notification, setNotification] = useState<string | null>(null);
  const [isMeetingFilterActive, setIsMeetingFilterActive] = useState(false);

  const fetchCards = async (silent = false) => {
    try {
      const [jalons, data] = await Promise.all([jalonApi.getAll(), cardApi.getAll()]);
      setCatalogue((prev) => (JSON.stringify(prev) === JSON.stringify(jalons) ? prev : jalons));
      setCards((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data));
    } catch (e) {
      if (!silent) console.error('Erreur chargement cartes', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchCards(true);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    sessionStorage.setItem('aic_vue_actuelle_v1', currentPage);
  }, [currentPage]);

  useEffect(() => {
    // La redirection à la connexion est faite par `handleConnexion` : ce garde-fou
    // ne couvre que la navigation interne (session restaurée ou profil modifié).
    if (!session) return;
    const autorises = ongletsAutorises(session.profil.id);
    if (!autorises.some((onglet) => onglet === currentPage)) {
      setCurrentPage(autorises[0]);
    }
  }, [session, currentPage]);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const lectureSeule = session?.profil.id === 'utilisateur';
  const ficheLectureSeule = session?.profil.id === 'utilisateur' || session?.profil.id === 'production';

  const getStatusLabel = (s: CardStatus) => {
    switch (s) {
      case 'EN_COURS':
        return 'En cours';
      case 'TERMINE':
        return 'Terminé';
      case 'BLOQUE':
        return 'Bloqué';
      case 'EN_ATTENTE':
        return 'En attente';
      default:
        return s;
    }
  };

  const handleCreateOrUpdate = async (formData: CardFormData) => {
    if (ficheLectureSeule) return;
    const { timeStr } = getNowParis();
    if (editingCard) {
      const updated = await cardApi.replace(editingCard.id, formData);
      setCards((prev) => prev.map((c) => (c.id === editingCard.id ? updated : c)));
      showNotification(`Carte ${updated.modele} mise à jour en réunion à ${timeStr}`);
    } else {
      const created = await cardApi.create(formData);
      setCards((prev) => [created, ...prev]);
      showNotification(`Nouvelle carte ${created.modele} ajoutée au point de production`);
      onCreateCardRef.current?.(created);
      onCreateCardRef.current = null;
    }
  };

  const handleUpdateCard = async (id: string, updates: Partial<CardItem>) => {
    if (lectureSeule) return;
    try {
      const { timeStr } = getNowParis();
      const updated = await cardApi.update(id, updates);
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));

      if (updates.statut !== undefined) {
        showNotification(
          `Statut "${getStatusLabel(updates.statut)}" validé pour ${updated.modele} à ${timeStr}`
        );
      } else if (updates.quantiteFinie !== undefined) {
        showNotification(
          `Point enregistré : ${updated.modele} (${updated.quantiteFinie}/${updated.quantiteDemandee}) à ${timeStr}`
        );
      } else if (updates.jalons !== undefined) {
        showNotification(`Jalons mis à jour pour ${updated.modele}`);
      } else if (Object.hasOwn(updates, 'dateTerminaison')) {
        if (updates.dateTerminaison) {
          showNotification(`Modèle ${updated.modele} archivé`);
        } else {
          showNotification(`Modèle ${updated.modele} réactivé`);
        }
      }
    } catch (e) {
      console.error('Erreur mise à jour', e);
    }
  };

  const handleDeleteCard = async (id: string) => {
    if (lectureSeule) return;
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    if (window.confirm(`Confirmez-vous la suppression de la carte "${card.modele}" (${card.batch}) ?`)) {
      await cardApi.delete(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
      showNotification(`Carte ${card.modele} supprimée`);
    }
  };

  const handleOpenEdit = (card: CardItem) => {
    setEditingCard(card);
    setIsModalOpen(true);
  };

  const handleOpenCreate = () => {
    if (ficheLectureSeule) return;
    setCreatePrefill(null);
    setEditingCard(null);
    setIsModalOpen(true);
  };

  const handleOpenCreateCard = (
    prefill: Partial<CardFormData> | null,
    onCreated: (card: CardItem) => void
  ) => {
    if (ficheLectureSeule) return;
    setCreatePrefill(prefill);
    onCreateCardRef.current = onCreated;
    setEditingCard(null);
    setIsModalOpen(true);
  };

  const handleSortChange = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder(field === 'resteAProduire' || field === 'quantiteDemandee' ? 'desc' : 'asc');
    }
  };

  const activeCards = useMemo(() => cards.filter((card) => !card.dateTerminaison), [cards]);
  const archivedCards = useMemo(
    () => cards.filter((card) => Boolean(card.dateTerminaison)),
    [cards]
  );

  const pendingReviewCount = useMemo(() => {
    return activeCards.filter((c) => c.statut === 'BLOQUE' || !c.pointFaitAujourdhui || c.statut === 'EN_ATTENTE').length;
  }, [activeCards]);

  const uniqueClients = useMemo(() => {
    return Array.from(new Set(activeCards.map((c) => c.client))).sort();
  }, [activeCards]);

  const jalonsUtilises = useMemo(() => {
    const codes = new Set(activeCards.flatMap((c) => (c.jalons ?? []).map((j) => j.code)));
    return catalogue.filter((j) => codes.has(j.code));
  }, [activeCards, catalogue]);

  const filteredCards = useMemo(() => {
    return activeCards
      .filter((card) => {
        if (isMeetingFilterActive) {
          if (card.statut !== 'BLOQUE' && card.statut !== 'EN_ATTENTE' && card.pointFaitAujourdhui) {
            return false;
          }
        }

        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase().trim();
          const matchClient = card.client.toLowerCase().includes(q);
          const matchBatch = card.batch.toLowerCase().includes(q);
          const matchModele = card.modele.toLowerCase().includes(q);
          if (!matchClient && !matchBatch && !matchModele) {
            return false;
          }
        }

        if (statusFilter !== 'ALL' && card.statut !== statusFilter) {
          return false;
        }

        if (selectedClient !== 'ALL' && card.client !== selectedClient) {
          return false;
        }

        if (flagFilter === 'OK_PROD' && !card.okProd) return false;
        if (flagFilter === 'OK_PROD_PENDING' && card.okProd) return false;
        if (
          flagFilter === 'HAS_SOUS_TRAITANCE' &&
          (!card.ofs || !card.ofs.some((o) => normalizeOFType(o.type) === 'O'))
        ) {
          return false;
        }
        const codeManquant = flagFilter.startsWith(PREFIXE_JALON_MANQUANT)
          ? flagFilter.slice(PREFIXE_JALON_MANQUANT.length)
          : null;
        if (codeManquant) {
          const porte = (card.jalons ?? []).some((j) => j.code === codeManquant);
          if (porte && !getEtatJalon(card, codeManquant).valide) return false;
        }
        if (flagFilter === 'ALL_VALIDATED') {
          const ports = card.jalons ?? [];
          if (ports.length === 0 || !ports.every((j) => j.valide)) return false;
        }

        if (kpiFilter === 'RDL') {
          if ((card.jalons ?? []).some((j) => j.code === 'RDL') && !getEtatJalon(card, 'RDL').valide) {
            return false;
          }
        } else if (kpiFilter === 'ALERTE') {
          if (card.statut !== 'BLOQUE') return false;
        }

        return true;
      })
      .sort((a, b) => {
        let diff = 0;
        if (sortField === 'resteAProduire') {
          diff = a.resteAProduire - b.resteAProduire;
        } else if (sortField === 'quantiteDemandee') {
          diff = a.quantiteDemandee - b.quantiteDemandee;
        } else if (sortField === 'client') {
          diff = a.client.localeCompare(b.client);
        } else if (sortField === 'statut') {
          diff = a.statut.localeCompare(b.statut);
        } else if (sortField === 'dateCreation') {
          diff = a.dateCreation.localeCompare(b.dateCreation);
        }
        return sortOrder === 'asc' ? diff : -diff;
      });
  }, [
    activeCards,
    catalogue,
    isMeetingFilterActive,
    searchQuery,
    statusFilter,
    selectedClient,
    flagFilter,
    kpiFilter,
    sortField,
    sortOrder,
  ]);

  const handleJalonAjoute = async () => {
    const [jalons, data] = await Promise.all([jalonApi.getAll(), cardApi.getAll()]);
    setCatalogue(jalons);
    setCards(data);
  };

  const handleReactivateCard = async (id: string) => {
    await handleUpdateCard(id, { dateTerminaison: '' });
  };

  const handleConnexion = (profil: Profil) => {
    setSession(enregistrerSession(profil.id));
    // Redirection immédiate vers le premier onglet autorisé : sans cela, le profil
    // Production resterait sur « Point Commande » jusqu'au prochain rendu.
    const autorises = ongletsAutorises(profil.id);
    if (autorises.length > 0) {
      setCurrentPage(autorises[0]);
      sessionStorage.setItem('aic_vue_actuelle_v1', autorises[0]);
    }
  };

  const handleDeconnexion = () => {
    effacerSession();
    setSession(null);
  };

  if (!session) {
    return <LoginScreen onConnecter={handleConnexion} />;
  }

  return (
    <ProfilProvider valeur={{ profil: session.profil, lectureSeule }}>
    <InspectionsParCarteProvider
      value={{ parCarte: inspectionsParCarte, setParCarte: setInspectionsParCarte }}
    >
    <JalonCatalogueProvider catalogue={catalogue}>
      <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{notification}</span>
        </div>
      )}

      {(currentPage === 'point-journalier' || currentPage === 'archive') && (
        <Header
          onOpenCreateModal={handleOpenCreate}
          currentPage={currentPage}
          onChangePage={setCurrentPage}
          cardsCount={currentPage === 'archive' ? archivedCards.length : activeCards.length}
          profil={session.profil}
          onDeconnexion={handleDeconnexion}
        />
      )}

      <div key={currentPage} className="flex-1 flex flex-col animate-page-in">
      {currentPage === 'point-journalier' ? (
        activeCards.length === 0 ? (
          <main className="flex-1 page-container py-6">
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-900 mb-1">Aucune carte en cours</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4">
                {ficheLectureSeule
                  ? 'Aucune carte à afficher pour le moment.'
                  : 'Ajoutez votre première carte de commande pour démarrer le point journalier.'}
              </p>
              {!ficheLectureSeule && (
                <button
                  onClick={handleOpenCreate}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  Carte
                </button>
              )}
            </div>
          </main>
        ) : (
        <main className="flex-1 page-container py-6">
          <>
            <StatsOverview
              cards={activeCards}
              activeFilter={kpiFilter}
              onSelectFilter={setKpiFilter}
              isMeetingFilterActive={isMeetingFilterActive}
              onToggleMeetingFilter={() => setIsMeetingFilterActive((prev) => !prev)}
              pendingReviewCount={pendingReviewCount}
            />

        {kpiFilter !== 'ALL' && (
          <div className="mb-4 bg-slate-900 text-white rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2.5 text-xs">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  kpiFilter === 'ALERTE' ? 'bg-rose-500 animate-pulse' : 'bg-purple-400'
                }`}
              />
              <span>
                Filtre sélectionné depuis le tableau de bord :{' '}
                <strong
                  className={kpiFilter === 'ALERTE' ? 'text-rose-300' : 'text-purple-300'}
                >
                  {kpiFilter === 'RDL' ? 'RDL (Réunion De Lancement)' : 'Alerte et priorité'}
                </strong>
                {' — '}
                {filteredCards.length} carte(s) concernée(s) affichée(s)
              </span>
            </div>
            <button
              onClick={() => setKpiFilter('ALL')}
              className="text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer self-start sm:self-auto flex items-center gap-1.5"
            >
              <span>× Réinitialiser le filtre (Afficher toutes les cartes)</span>
            </button>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              Tableau de Bord — Réunion Journalière d'Atelier
            </h2>
            <p className="text-xs text-slate-500">
              Changement immédiat des statuts, arbitrage des blocages et point des ordres de fabrication textile
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => fetchCards()}
              className="p-1.5 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Actualiser la liste"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          flagFilter={flagFilter}
          onFlagFilterChange={setFlagFilter}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          uniqueClients={uniqueClients}
          selectedClient={selectedClient}
          onClientChange={setSelectedClient}
          jalonsUtilises={jalonsUtilises}
        />

        <CardTable
          cards={filteredCards}
          onUpdateCard={handleUpdateCard}
          onEditCard={handleOpenEdit}
          onDeleteCard={handleDeleteCard}
          onOpenCreate={handleOpenCreate}
        />
          </> )
        </main>
        )
      ) : currentPage === 'archive' ? (
        <ArchiveView cards={archivedCards} onReactivateCard={handleReactivateCard} />
      ) : currentPage === 'suivi-global' ? (
        <main className="flex-1 w-full">
          <SuiviGlobalView
            onChangePage={setCurrentPage}
            cards={activeCards}
            onUpdateCard={handleUpdateCard}
            profil={session.profil}
            onDeconnexion={handleDeconnexion}
            onOpenCardModal={(card) => {
              setEditingCard(card);
              setIsModalOpen(true);
            }}
            onOpenCreateCard={handleOpenCreateCard}
          />
        </main>
      ) : currentPage === 'historique' ? (
        <main className="flex-1 w-full">
          <HistoriqueView
            onChangePage={setCurrentPage}
            profil={session.profil}
            onDeconnexion={handleDeconnexion}
          />
        </main>
      ) : currentPage === 'tableaux-ofs' ? (
        <main className="flex-1 w-full">
          <TableauxOFsView
            cards={activeCards}
            onUpdateCard={handleUpdateCard}
            onChangePage={setCurrentPage}
            profil={session.profil}
            onDeconnexion={handleDeconnexion}
            onOpenCardModal={(card) => {
              setEditingCard(card);
              setIsModalOpen(true);
            }}
          />
        </main>
      ) : (
        <main className="flex-1 w-full">
          <DeveloppementView
            onChangePage={setCurrentPage}
            profil={session.profil}
            onDeconnexion={handleDeconnexion}
          />
        </main>
      )}
      </div>

      <CardModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCard(null);
          setCreatePrefill(null);
          onCreateCardRef.current = null;
        }}
        onSubmit={handleCreateOrUpdate}
        initialData={editingCard}
        createPrefill={editingCard ? null : createPrefill}
        onJalonAjoute={handleJalonAjoute}
        lectureSeule={ficheLectureSeule}
      />
      </div>
    </JalonCatalogueProvider>
    </InspectionsParCarteProvider>
    </ProfilProvider>
  );
}