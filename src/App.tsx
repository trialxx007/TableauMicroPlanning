import { useState, useEffect, useMemo } from 'react';
import { CardFormData, CardItem, CardStatus, JalonCatalogue } from './types/card.ts';
import { cardApi, jalonApi } from './services/api.ts';
import { Header } from './components/Header.tsx';
import { StatsOverview, KpiFilterType } from './components/StatsOverview.tsx';
import { FilterBar, SortField, SortOrder } from './components/FilterBar.tsx';
import { CardTable } from './components/CardTable.tsx';
import { CardModal } from './components/CardModal.tsx';
import { SuiviGlobalView } from './components/SuiviGlobalView.tsx';
import { AppPage } from './components/ViewSwitcher.tsx';
import { JalonCatalogueProvider } from './context/JalonCatalogueContext.tsx';
import { getEtatJalon, PREFIXE_JALON_MANQUANT } from './utils/jalons.ts';
import { getNowParis } from './utils/dateFrance.ts';
import { RefreshCw, Download, FileSpreadsheet, Check } from 'lucide-react';

export default function App() {
  const [currentPage, setCurrentPage] = useState<AppPage>('point-journalier');
  const [cards, setCards] = useState<CardItem[]>([]);
  const [catalogue, setCatalogue] = useState<JalonCatalogue[]>([]);
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
  const [notification, setNotification] = useState<string | null>(null);
  const [isMeetingFilterActive, setIsMeetingFilterActive] = useState(false);

  const fetchCards = async () => {
    try {
      // Le catalogue d'abord : les jalons affichés en dépendent.
      const [jalons, data] = await Promise.all([jalonApi.getAll(), cardApi.getAll()]);
      setCatalogue(jalons);
      setCards(data);
    } catch (e) {
      console.error('Erreur chargement cartes', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCards();
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

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
    const { timeStr } = getNowParis();
    if (editingCard) {
      // PUT explicite : la modale renvoie la carte entière, on ne veut pas qu'un
      // PATCH recalcule un statut ou un reste à produire côté serveur.
      const updated = await cardApi.replace(editingCard.id, formData);
      setCards((prev) => prev.map((c) => (c.id === editingCard.id ? updated : c)));
      showNotification(`Carte ${updated.nom} mise à jour en réunion à ${timeStr}`);
    } else {
      const created = await cardApi.create(formData);
      setCards((prev) => [created, ...prev]);
      showNotification(`Nouvelle carte ${created.nom} ajoutée au point de production`);
    }
  };

  const handleUpdateCard = async (id: string, updates: Partial<CardItem>) => {
    try {
      const { timeStr } = getNowParis();
      const updated = await cardApi.update(id, updates);
      setCards((prev) => prev.map((c) => (c.id === id ? updated : c)));

      if (updates.statut !== undefined) {
        showNotification(
          `Statut "${getStatusLabel(updates.statut)}" validé pour ${updated.nom} à ${timeStr}`
        );
      } else if (updates.quantiteFinie !== undefined) {
        showNotification(
          `Point enregistré : ${updated.nom} (${updated.quantiteFinie}/${updated.quantiteDemandee}) à ${timeStr}`
        );
      } else if (updates.jalons !== undefined) {
        showNotification(`Jalons mis à jour pour ${updated.nom}`);
      }
    } catch (e) {
      console.error('Erreur mise à jour', e);
    }
  };

  const handleDeleteCard = async (id: string) => {
    const card = cards.find((c) => c.id === id);
    if (!card) return;
    if (window.confirm(`Confirmez-vous la suppression de la carte "${card.nom}" (${card.reference}) ?`)) {
      await cardApi.delete(id);
      setCards((prev) => prev.filter((c) => c.id !== id));
      showNotification(`Carte ${card.nom} supprimée`);
    }
  };

  const handleResetData = async () => {
    if (window.confirm('Voulez-vous réinitialiser les données avec les cartes d’exemple ?')) {
      const defaults = await cardApi.resetDefaults();
      setCards(defaults);
      showNotification('Données réinitialisées (Atelier Textile Haut de Gamme)');
    }
  };

  const handleOpenEdit = (card: CardItem) => {
    setEditingCard(card);
    setIsModalOpen(true);
  };

  const handleOpenCreate = () => {
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

  // Count of cards requiring review during meeting
  const pendingReviewCount = useMemo(() => {
    return cards.filter((c) => c.statut === 'BLOQUE' || !c.pointFaitAujourdhui || c.statut === 'EN_ATTENTE').length;
  }, [cards]);

  // Unique clients for filter dropdown
  const uniqueClients = useMemo(() => {
    return Array.from(new Set(cards.map((c) => c.client))).sort();
  }, [cards]);

  // Jalons proposés au filtre : ceux qu'au moins une carte porte. Un jalon ajouté
  // sur une seule carte n'ouvre donc pas une entrée pour toutes les autres.
  const jalonsUtilises = useMemo(() => {
    const codes = new Set(cards.flatMap((c) => (c.jalons ?? []).map((j) => j.code)));
    return catalogue.filter((j) => codes.has(j.code));
  }, [cards, catalogue]);

  // Filter & sort logic
  const filteredCards = useMemo(() => {
    return cards
      .filter((card) => {
        // Meeting priority filter: show Bloqué, En attente or non reviewed today
        if (isMeetingFilterActive) {
          if (card.statut !== 'BLOQUE' && card.statut !== 'EN_ATTENTE' && card.pointFaitAujourdhui) {
            return false;
          }
        }

        // Search
        if (searchQuery.trim() !== '') {
          const q = searchQuery.toLowerCase().trim();
          const matchClient = card.client.toLowerCase().includes(q);
          const matchNom = card.nom.toLowerCase().includes(q);
          const matchRef = card.reference.toLowerCase().includes(q);
          const matchModele = card.modele.toLowerCase().includes(q);
          if (!matchClient && !matchNom && !matchRef && !matchModele) {
            return false;
          }
        }

        // Status
        if (statusFilter !== 'ALL' && card.statut !== statusFilter) {
          return false;
        }

        // Client
        if (selectedClient !== 'ALL' && card.client !== selectedClient) {
          return false;
        }

        // OK Prod, Sous-traitance et jalons (la carte porte ses propres jalons)
        if (flagFilter === 'OK_PROD' && !card.okProd) return false;
        if (flagFilter === 'OK_PROD_PENDING' && card.okProd) return false;
        if (
          flagFilter === 'HAS_SOUS_TRAITANCE' &&
          (!card.ofs || !card.ofs.some((o) => o.type === 'SOUS_TRAITANCE'))
        ) {
          return false;
        }
        // JALON_MISSING:<CODE> cible un code précis. Un jalon est propre à sa
        // carte : ne pas le porter n'est pas « en attente », la carte est donc
        // exclue seulement si elle porte le jalon sans l'avoir validé.
        const codeManquant = flagFilter.startsWith(PREFIXE_JALON_MANQUANT)
          ? flagFilter.slice(PREFIXE_JALON_MANQUANT.length)
          : null;
        if (codeManquant) {
          const porte = (card.jalons ?? []).some((j) => j.code === codeManquant);
          if (porte && !getEtatJalon(card, codeManquant).valide) return false;
        }
        // « Tous les jalons validés » : tous ceux que la carte porte, et au moins un.
        if (flagFilter === 'ALL_VALIDATED') {
          const ports = card.jalons ?? [];
          if (ports.length === 0 || !ports.every((j) => j.valide)) return false;
        }

        // Filtre cliquable depuis les 3 cartes du bandeau (Cartes / Modèles, RDL, Alerte et priorité)
        if (kpiFilter === 'RDL') {
          // Le filtre n'a de sens que pour les cartes qui portent le jalon RDL.
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
    // `catalogue` fait partie des dépendances : les filtres RDL et
    // « tous les jalons validés » en dépendent, ils doivent se recalculer
    // quand un jalon est ajouté ou retiré.
  }, [
    cards,
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

  // Export CSV for daily point report (formatted for French Excel)
  const handleExportCSV = () => {
    const { dateStr, timeStr } = getNowParis();

    // Une colonne par code réellement porté par les cartes exportées : l'export suit
    // l'ajout de jalons sans intervention. OUI = validé, S40 = planifié, NON = en
    // attente. Une carte qui ne porte pas le jalon laisse la cellule vide.
    const enteteJalon = jalonsUtilises.map((j) => `${j.code} (${j.libelle})`);
    const valeurJalon = (card: CardItem, code: string) => {
      if (!(card.jalons ?? []).some((j) => j.code === code)) return '';
      const etat = getEtatJalon(card, code);
      if (etat.valide) return 'OUI';
      const semaine = etat.semaine;
      return semaine != null ? `S${semaine}` : 'NON';
    };

    const headers = [
      'Client',
      'Modèle',
      'Nom',
      'Référence (OF)',
      ...enteteJalon,
      'Quantité Demandée',
      'Quantité Finie',
      'Reste à Produire',
      'Statut',
      'Date Dernier Point',
      'Heure Point',
      'Décision Réunion Journalière',
      'Notes Atelier',
    ];

    const echapper = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filteredCards.map((c) => [
      echapper(c.client),
      echapper(c.modele),
      echapper(c.nom),
      echapper(c.reference),
      ...jalonsUtilises.map((j) => echapper(valeurJalon(c, j.code))),
      c.quantiteDemandee,
      c.quantiteFinie,
      c.resteAProduire,
      echapper(getStatusLabel(c.statut)),
      echapper(c.dateDernierPoint),
      echapper(c.heureDernierPoint),
      echapper(c.decisionReunion),
      echapper(c.notes),
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [
        headers.map((h) => echapper(h)).join(';'),
        ...rows.map((e) => e.join(';')),
      ].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `point_reunion_journaliere_${dateStr.replace(/\//g, '-')}_${timeStr.replace(':', 'h')}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Export CSV de la réunion généré');
  };

  /** Un jalon a été ajouté ou retiré sur une carte : le catalogue partagé (intitulés)
   *  et les cartes sont rechargés, pour que colonnes, filtres et pastilles suivent. */
  const handleJalonAjoute = async () => {
    const [jalons, data] = await Promise.all([jalonApi.getAll(), cardApi.getAll()]);
    setCatalogue(jalons);
    setCards(data);
  };

  return (
    <JalonCatalogueProvider catalogue={catalogue}>
      <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      {/* Toast Notification */}
      {notification && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 border border-slate-700 animate-in fade-in slide-in-from-bottom-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
          <span>{notification}</span>
        </div>
      )}

      {/* Main Header with Paris time and meeting filter */}
      <Header
        onOpenCreateModal={handleOpenCreate}
        onResetData={handleResetData}
        currentPage={currentPage}
        onChangePage={setCurrentPage}
        cardsCount={cards.length}
        isMeetingFilterActive={isMeetingFilterActive}
        onToggleMeetingFilter={() => setIsMeetingFilterActive((prev) => !prev)}
        pendingReviewCount={pendingReviewCount}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentPage === 'point-journalier' ? (
          <>
            {/* KPI Summary Cards (Surbrillance au survol & Filtrage au clic) */}
            <StatsOverview
              cards={cards}
              activeFilter={kpiFilter}
              onSelectFilter={setKpiFilter}
            />

        {/* Bannière de filtrage actif depuis le tableau de bord */}
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
              <span>✕ Réinitialiser le filtre (Afficher toutes les cartes)</span>
            </button>
          </div>
        )}

        {/* Section title & quick actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              Tableau de Bord • Réunion Journalière d'Atelier
            </h2>
            <p className="text-xs text-slate-500">
              Changement immédiat des statuts, arbitrage des blocages et point des ordres de fabrication textile
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Exporter le relevé de réunion en CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              <span>Compte-rendu CSV</span>
            </button>
            <button
              onClick={fetchCards}
              className="p-1.5 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Actualiser la liste"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
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

        {/* Interactive Cards Table */}
        <CardTable
          cards={filteredCards}
          onUpdateCard={handleUpdateCard}
          onEditCard={handleOpenEdit}
          onDeleteCard={handleDeleteCard}
          onOpenCreate={handleOpenCreate}
        />
          </>
        ) : (
          <SuiviGlobalView
            onBackToPointJournalier={() => setCurrentPage('point-journalier')}
            cards={cards}
            onOpenCardModal={(card) => {
              setEditingCard(card);
              setIsModalOpen(true);
            }}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto py-4 border-t border-slate-200 bg-white text-center text-xs text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Point Commande Journalière • Confection Textile & Haut de Gamme</span>
          <span className="flex items-center gap-1 text-slate-500 font-medium">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            Suivi d'Atelier de Fabrication
          </span>
        </div>
      </footer>

      {/* Create / Edit Modal (Representation) */}
      <CardModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingCard(null);
        }}
        onSubmit={handleCreateOrUpdate}
        initialData={editingCard}
        onJalonAjoute={handleJalonAjoute}
      />
      </div>
    </JalonCatalogueProvider>
  );
}
