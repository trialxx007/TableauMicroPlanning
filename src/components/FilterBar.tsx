import React from 'react';
import { Search, Filter, ArrowUpDown } from 'lucide-react';
import { CardStatus } from '../types/card.ts';

export type SortField = 'resteAProduire' | 'quantiteDemandee' | 'client' | 'statut' | 'dateCreation';
export type SortOrder = 'asc' | 'desc';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  flagFilter: string; // 'ALL' | 'DT_MISSING' | 'TC_MISSING' | 'SMS_MISSING'
  onFlagFilterChange: (flag: string) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField) => void;
  uniqueClients: string[];
  selectedClient: string;
  onClientChange: (client: string) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  flagFilter,
  onFlagFilterChange,
  sortField,
  sortOrder,
  onSortChange,
  uniqueClients,
  selectedClient,
  onClientChange,
}) => {
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs mb-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Rechercher par client, modèle, nom ou référence..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 rounded-lg px-2.5 py-2 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="EN_COURS">En cours</option>
              <option value="EN_ATTENTE">En attente</option>
              <option value="TERMINE">Terminé</option>
              <option value="BLOQUE">Bloqué</option>
            </select>
          </div>

          {/* Client Filter */}
          {uniqueClients.length > 0 && (
            <select
              value={selectedClient}
              onChange={(e) => onClientChange(e.target.value)}
              className="bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 rounded-lg px-2.5 py-2 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
            >
              <option value="ALL">Tous les clients ({uniqueClients.length})</option>
              {uniqueClients.map((client) => (
                <option key={client} value={client}>
                  {client}
                </option>
              ))}
            </select>
          )}

          {/* DT / TC / SMS / RDL / OK Prod / Sous-traitance Filter */}
          <select
            value={flagFilter}
            onChange={(e) => onFlagFilterChange(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs font-medium text-slate-700 rounded-lg px-2.5 py-2 focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 cursor-pointer"
          >
            <option value="ALL">Tous les jalons & validations</option>
            <option value="OK_PROD">Accord OK Prod validé</option>
            <option value="OK_PROD_PENDING">En attente accord OK Prod</option>
            <option value="HAS_SOUS_TRAITANCE">Avec sous-traitance (OF externes)</option>
            <option value="RDL_MISSING">OF à programmer en RDL (Réunion De Lancement)</option>
            <option value="DT_MISSING">DT non validé (Dossier Technique)</option>
            <option value="TC_MISSING">TC non validé (Type Conforme)</option>
            <option value="SMS_MISSING">SMS non validé (Sales Man's Sample)</option>
            <option value="ALL_VALIDATED">DT + TC + SMS validés</option>
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-0.5">
            <button
              onClick={() => onSortChange('resteAProduire')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                sortField === 'resteAProduire'
                  ? 'bg-white text-blue-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Trier par reste à produire"
            >
              <span>Reste</span>
              {sortField === 'resteAProduire' && (
                <ArrowUpDown className="w-3 h-3 text-blue-600" />
              )}
            </button>
            <button
              onClick={() => onSortChange('quantiteDemandee')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                sortField === 'quantiteDemandee'
                  ? 'bg-white text-blue-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Trier par quantité demandée"
            >
              <span>Qté</span>
              {sortField === 'quantiteDemandee' && (
                <ArrowUpDown className="w-3 h-3 text-blue-600" />
              )}
            </button>
            <button
              onClick={() => onSortChange('client')}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                sortField === 'client'
                  ? 'bg-white text-blue-600 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Trier par client"
            >
              <span>Client</span>
              {sortField === 'client' && (
                <ArrowUpDown className="w-3 h-3 text-blue-600" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
