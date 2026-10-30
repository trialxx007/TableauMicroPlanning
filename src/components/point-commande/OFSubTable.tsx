import React, { useId, useMemo, useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { OrdreFabrication, SousOrdreFabrication, CardStatus, OFType, OF_TYPES, OF_DESTINATIONS, DestinationCatalogue, normalizeOFType } from '@/src/types/card.ts';
import { EnCoursGrid } from './EnCoursCasesSection.tsx';
import { EditableItemName } from '@/src/components/ui/EditableItemName.tsx';
import { useInspectionsParCarte } from '@/src/context/InspectionsParCarteContext.tsx';
import { useLectureSeule } from '@/src/context/ProfilContext.tsx';
import { destinationApi } from '@/src/services/api.ts';
import {
  Check,
  ChevronDown,
  ChevronUp,
  Search,
  Plus,
  Lock,
  Unlock,
  Trash2,
  X,
} from 'lucide-react';

// Chevron dessiné en fond du champ Destination (l'apparence native est retirée).
const CHEVRON_DESTINATION =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6l6 -6'/%3E%3C/svg%3E\")";

interface OFSubTableProps {
  cardId: string;
  totalDemandee: number;
  ofs: OrdreFabrication[];
  onUpdateOFs: (newOfs: OrdreFabrication[]) => void;
  onChangeTotalDemandee?: (n: number) => void;
  isAddingOF?: boolean;
  onCloseAddOF?: () => void;
  lectureSeule?: boolean;
}

export function normalizeCases(cases: number[] | undefined, nbCases: number, totalAssigne: number): number[] {
  const src = cases && cases.length ? cases : [];
  const intermediaires = src.slice(0, Math.max(0, src.length - 1));
  const next = intermediaires.slice(0, Math.max(0, nbCases - 1));
  while (next.length < nbCases - 1) {
    next.push(0);
  }
  next.push(totalAssigne);
  return next;
}

type CasesOwner = {
  nbCases?: number;
  casesEnCours?: number[];
  quantiteDemandee: number;
};

export function computeOfQuantiteFinie(owner: CasesOwner): number {
  const nb = owner.nbCases || 5;
  const total = Number(owner.quantiteDemandee) || 0;
  return Number(normalizeCases(owner.casesEnCours, nb, total)[0]) || 0;
}

const OF_TYPE_KEYS = Object.keys(OF_TYPES) as OFType[];

interface TraitantPickerProps {
  value: OFType;
  onChange: (t: OFType) => void;
}

const TraitantPicker: React.FC<TraitantPickerProps> = ({ value, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative shrink-0" ref={pickerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        title="Cliquer pour changer de traitant"
        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md border text-[11px] font-bold shadow-2xs cursor-pointer ${OF_TYPES[value].classe}`}
      >
        {value}
        <ChevronDown
          className={`w-2.5 h-2.5 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-0.5 z-30 flex gap-0.5 bg-white border border-slate-300 rounded-lg shadow-lg p-0.5">
          {OF_TYPE_KEYS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                onChange(t);
                setIsOpen(false);
              }}
              title={OF_TYPES[t].label}
              className={`px-2 py-0.5 rounded text-[11px] font-bold border cursor-pointer ${
                value === t
                  ? OF_TYPES[t].classe
                  : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const getStatusBadge = (statut: CardStatus) => {
  switch (statut) {
    case 'TERMINE':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    case 'EN_COURS':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'BLOQUE':
      return 'bg-rose-100 text-rose-800 border-rose-300';
    case 'EN_ATTENTE':
    default:
      return 'bg-amber-100 text-amber-800 border-amber-300';
  }
};

interface DestinationComboProps {
  value: string | undefined;
  options: (DestinationCatalogue & { inCatalogue: boolean })[];
  onChange: (value: string | undefined) => void;
  title: string;
  lectureSeule: boolean;
  onCreate: (destination: DestinationCatalogue) => Promise<void>;
  onDelete: (code: string) => Promise<void>;
}

const DestinationCombo: React.FC<DestinationComboProps> = ({
  value,
  options,
  onChange,
  title,
  lectureSeule,
  onCreate,
  onDelete,
}) => {
  const [open, setOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [autoCode, setAutoCode] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [codeError, setCodeError] = useState('');
  const [nameError, setNameError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingCode, setDeletingCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(
    null
  );
  const normalizedSearch = normalizeDestinationSearch(search);
  const filteredOptions = options.filter((destination) =>
    normalizeDestinationSearch(`${destination.code} ${destination.label}`).includes(
      normalizedSearch
    )
  );
  if (!search.trim()) {
    filteredOptions.unshift({ code: '', label: 'Aucune destination', inCatalogue: false });
  }
  const selectedCode = value?.toUpperCase() ?? '';
  const activeOption = filteredOptions[activeIndex];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPopoverPosition(null);
      return;
    }

    const positionPopover = () => {
      const trigger = triggerRef.current;
      const panel = panelRef.current;
      if (!trigger || !panel) return;

      const anchor = trigger.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const margin = 8;
      const gap = 4;
      const left = Math.max(
        margin,
        Math.min(anchor.right - width, window.innerWidth - width - margin)
      );
      const below = window.innerHeight - anchor.bottom - margin;
      const top =
        below >= height || below >= anchor.top - margin
          ? Math.min(anchor.bottom + gap, window.innerHeight - height - margin)
          : Math.max(margin, anchor.top - height - gap);
      setPopoverPosition({ top, left });
    };

    positionPopover();
    window.addEventListener('resize', positionPopover);
    window.addEventListener('scroll', positionPopover, true);
    return () => {
      window.removeEventListener('resize', positionPopover);
      window.removeEventListener('scroll', positionPopover, true);
    };
  }, [open, formOpen, filteredOptions.length, search]);

  useEffect(() => {
    if (formOpen) codeRef.current?.focus();
    else if (open) searchRef.current?.focus();
  }, [formOpen, open]);

  function close() {
    setOpen(false);
    setFormOpen(false);
    setSearch('');
    setActiveIndex(0);
  }

  function openForm(prefillName = '') {
    setName(prefillName);
    setCode(firstTwoLetters(prefillName));
    setAutoCode(Boolean(prefillName));
    setCodeError('');
    setNameError('');
    setSubmitError('');
    setFormOpen(true);
  }

  function cancelForm() {
    setFormOpen(false);
    setCode('');
    setName('');
    setAutoCode(false);
    setCodeError('');
    setNameError('');
    setSubmitError('');
  }

  function moveActiveOption(direction: 1 | -1) {
    if (!filteredOptions.length) return;
    setActiveIndex((current) => (current + direction + filteredOptions.length) % filteredOptions.length);
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveOption(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveOption(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeOption) selectDestination(activeOption.code);
      else if (search.trim()) openForm(search.trim());
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  function handleOptionKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveOption(event.key === 'ArrowDown' ? 1 : -1);
      searchRef.current?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  function selectDestination(destination: string | undefined) {
    onChange(destination);
    close();
  }

  function handleNameChange(nextName: string) {
    setName(nextName);
    if (!code || autoCode) {
      setCode(firstTwoLetters(nextName));
      setAutoCode(Boolean(nextName));
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    const normalizedCode = code.trim().toUpperCase();
    const normalizedName = name.trim();
    const duplicate = options.some(
      (destination) =>
        Boolean(normalizedCode) && destination.code.toUpperCase() === normalizedCode
    );
    setCodeError(
      !normalizedCode
        ? 'Le code est requis'
        : duplicate
          ? 'Ce code existe déjà'
          : ''
    );
    setNameError(normalizedName ? '' : 'Le nom est requis');
    setSubmitError('');
    if (!normalizedCode || !normalizedName || duplicate) return;

    setSaving(true);
    try {
      await onCreate({ code: normalizedCode, label: normalizedName });
      close();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erreur lors de l’ajout';
      if (message.toLowerCase().includes('existe déjà')) setCodeError('Ce code existe déjà');
      else setSubmitError(message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(destination: DestinationCatalogue) {
    const confirmed = window.confirm(
      `Supprimer ${destination.code} · ${destination.label} du catalogue des destinations ? Les OF déjà renseignés ne seront pas modifiés.`
    );
    if (!confirmed) return;

    setDeleteError('');
    setDeletingCode(destination.code);
    try {
      await onDelete(destination.code);
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'Erreur lors de la suppression'
      );
    } finally {
      setDeletingCode(null);
    }
  }

  return (
    <span className="relative inline-flex shrink-0">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label="Destination"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open && !formOpen ? listId : undefined}
        disabled={lectureSeule}
        title={title}
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            setFormOpen(false);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setFormOpen(false);
          } else if (event.key === 'Escape' && open) {
            event.preventDefault();
            close();
          }
        }}
        style={{
          backgroundImage: CHEVRON_DESTINATION,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 6px center',
          backgroundSize: '14px',
        }}
        className={`h-6 w-28 appearance-none truncate pl-2 pr-7 text-left text-[11px] font-bold rounded-md border focus:outline-hidden focus:ring-1 focus:ring-blue-400 ${lectureSeule ? 'cursor-default' : 'cursor-pointer'} ${
          value ? 'bg-white text-slate-700 border-slate-200' : 'bg-white text-slate-500 border-slate-300'
        }`}
      >
        {value ?? 'Destination'}
      </button>

      {open &&
        createPortal(
        <div
          ref={panelRef}
          style={{
            position: 'fixed',
            top: popoverPosition?.top ?? 0,
            left: popoverPosition?.left ?? 0,
            zIndex: 60,
            visibility: popoverPosition ? 'visible' : 'hidden',
          }}
          className="w-64 overflow-hidden rounded-lg border border-slate-300 bg-white shadow-lg"
        >
          {formOpen ? (
            <form
              noValidate
              onSubmit={handleSubmit}
              className="p-3"
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  cancelForm();
                }
              }}
            >
              <h3 className="mb-2 text-xs font-bold text-slate-800">Nouvelle destination</h3>
              <label htmlFor={`${listId}-code`} className="mb-1 block text-[11px] font-semibold text-slate-600">
                Code
              </label>
              <input
                ref={codeRef}
                id={`${listId}-code`}
                type="text"
                maxLength={3}
                required
                value={code}
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? `${listId}-code-error` : undefined}
                onChange={(event) => {
                  setCode(event.target.value.slice(0, 3).toUpperCase());
                  setAutoCode(false);
                  setCodeError('');
                }}
                className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs uppercase focus:outline-hidden focus:ring-1 focus:ring-blue-400"
              />
              {codeError && <p id={`${listId}-code-error`} className="mt-1 text-[11px] text-red-600">{codeError}</p>}
              <label htmlFor={`${listId}-name`} className="mb-1 mt-2 block text-[11px] font-semibold text-slate-600">
                Nom
              </label>
              <input
                id={`${listId}-name`}
                type="text"
                required
                value={name}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? `${listId}-name-error` : undefined}
                onChange={(event) => handleNameChange(event.target.value)}
                className="h-8 w-full rounded-md border border-slate-300 bg-white px-2 text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-400"
              />
              {nameError && <p id={`${listId}-name-error`} className="mt-1 text-[11px] text-red-600">{nameError}</p>}
              {submitError && <p role="alert" className="mt-1 text-[11px] text-red-600">{submitError}</p>}
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelForm}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Ajouter
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="border-b border-slate-200 p-2">
                <div className="flex h-8 items-center gap-2 rounded-md border border-slate-300 px-2 focus-within:ring-1 focus-within:ring-blue-400">
                  <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="text"
                    role="searchbox"
                    aria-label="Rechercher une destination"
                    aria-autocomplete="list"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-activedescendant={activeOption ? `${listId}-${activeIndex}` : undefined}
                    value={search}
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={handleSearchKeyDown}
                    placeholder="Rechercher…"
                    className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-slate-400"
                  />
                </div>
              </div>
              {deleteError && (
                <p role="alert" className="px-3 pt-2 text-[11px] text-red-600">
                  {deleteError}
                </p>
              )}
              <div id={listId} role="listbox" aria-label="Destinations" className="max-h-44 overflow-y-auto p-1">
                {filteredOptions.length ? (
                  filteredOptions.map((destination, index) => (
                    <div
                      role="group"
                      aria-label={destination.code}
                      key={destination.code}
                      className="flex items-center rounded-md"
                    >
                      <button
                        id={`${listId}-${index}`}
                        type="button"
                        role="option"
                        aria-selected={destination.code.toUpperCase() === selectedCode}
                        tabIndex={-1}
                        onMouseEnter={() => setActiveIndex(index)}
                        onKeyDown={handleOptionKeyDown}
                        onClick={() => selectDestination(destination.code || undefined)}
                        className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs ${
                          index === activeIndex ||
                          destination.code.toUpperCase() === selectedCode
                            ? 'bg-blue-50 text-blue-800'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="w-4 shrink-0">
                          {destination.code.toUpperCase() === selectedCode && (
                            <Check
                              className="h-3.5 w-3.5 text-blue-600"
                              aria-hidden="true"
                            />
                          )}
                        </span>
                        <span className="truncate">
                          {destination.code
                            ? `${destination.code} · ${destination.label}`
                            : destination.label}
                        </span>
                      </button>
                      {destination.inCatalogue && !lectureSeule && (
                        <button
                          type="button"
                          aria-label={`Supprimer ${destination.code} du catalogue`}
                          title={`Supprimer ${destination.code} du catalogue`}
                          disabled={deletingCode !== null}
                          onClick={() => handleDelete(destination)}
                          className="mr-1 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  ))
                ) : search.trim() ? (
                  <button
                    type="button"
                    role="option"
                    aria-selected="false"
                    onClick={() => openForm(search.trim())}
                    className="w-full rounded-md px-2 py-2 text-left text-xs text-blue-600 hover:bg-blue-50"
                  >
                    Créer "{search.trim()}"
                  </button>
                ) : (
                  <p className="px-2 py-2 text-xs text-slate-500">Aucune destination</p>
                )}
              </div>
              {!lectureSeule && (
                <button
                  type="button"
                  onClick={() => openForm()}
                  className="sticky bottom-0 flex w-full items-center gap-1.5 border-t border-slate-200 bg-white px-3 py-2 text-left text-xs font-semibold text-blue-600 hover:bg-blue-50"
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Ajouter une destination
                </button>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </span>
  );
};

function normalizeDestinationSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase();
}

function firstTwoLetters(value: string): string {
  return [...value].filter((character) => /\p{L}/u.test(character)).slice(0, 2).join('').toUpperCase();
}

/** Le total d'un OF divisé en sous-OF est la somme de ses sous-OF. */
function recalcOFDepuisSousOfs(of: OrdreFabrication): OrdreFabrication {
  const sous = of.sousOfs || [];
  if (sous.length === 0) return of;
  const quantiteDemandee = sous.reduce((s, x) => s + (Number(x.quantiteDemandee) || 0), 0);
  const quantiteFinie = sous.reduce((s, x) => s + computeOfQuantiteFinie(x), 0);
  return {
    ...of,
    quantiteDemandee,
    quantiteFinie,
    resteAProduire: Math.max(0, quantiteDemandee - quantiteFinie),
  };
}

export const OFSubTable: React.FC<OFSubTableProps> = ({
  cardId,
  totalDemandee,
  ofs,
  onUpdateOFs,
  onChangeTotalDemandee,
  isAddingOF = false,
  onCloseAddOF,
  lectureSeule: lectureSeuleProp = false,
}) => {
  // Inspection de la carte (colonne Inspection du Suivi Global) : sert de
  // référence pour afficher l'avancement des contrôles de chaque OF.
  const { parCarte } = useInspectionsParCarte();
  const lectureSeule = useLectureSeule() || lectureSeuleProp;
  const [newQuantite, setNewQuantite] = useState<number>(50);
  const [newNbCases, setNewNbCases] = useState<number>(5);
  const [newCases, setNewCases] = useState<number[]>(() => normalizeCases(undefined, 5, 50));
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [destinations, setDestinations] = useState<DestinationCatalogue[]>(() =>
    OF_DESTINATIONS.map(({ code, label }) => ({ code, label }))
  );

  useEffect(() => {
    destinationApi.getAll().then(setDestinations);
  }, []);

  const totalAlloue = ofs.reduce((sum, o) => sum + o.quantiteDemandee, 0);
  const totalFinie = ofs.reduce((sum, o) => sum + computeOfQuantiteFinie(o), 0);
  const soldeNonAlloue = Math.max(0, totalDemandee - totalAlloue);
  const ecartAlloue = totalAlloue - totalDemandee;

  const closeAddOF = () => {
    if (onCloseAddOF) onCloseAddOF();
  };

  const handleChangeNbCases = (ofId: string, nb: number) => {
    onUpdateOFs(ofs.map((o) => (o.id === ofId ? { ...o, nbCases: nb } : o)));
  };

  useEffect(() => {
    if (isAddingOF) {
      const qte = soldeNonAlloue > 0 ? soldeNonAlloue : 50;
      setNewQuantite(qte);
      setNewNbCases(5);
      setNewCases(normalizeCases(undefined, 5, qte));
    }
  }, [isAddingOF, soldeNonAlloue]);

  useEffect(() => {
    if (isAddingOF && isCollapsed) {
      setIsCollapsed(false);
    }
  }, [isAddingOF, isCollapsed]);

  // Destinations proposées dans la combobox : le catalogue des pays (FR, US, ES,
  // MX…) puis celles déjà portées par les OF de la carte (hors catalogue).
  const optionsDestination = useMemo(() => {
    const parCode = new Map<string, { label: string; inCatalogue: boolean }>();
    for (const destination of destinations) {
      parCode.set(destination.code.toUpperCase(), {
        label: destination.label,
        inCatalogue: true,
      });
    }
    for (const o of ofs) {
      const code = o.destination?.trim().toUpperCase();
      if (code && !parCode.has(code)) parCode.set(code, { label: code, inCatalogue: false });
    }
    return [...parCode.entries()].map(([code, destination]) => ({
      code,
      label: destination.label,
      inCatalogue: destination.inCatalogue,
    }));
  }, [destinations, ofs]);

  const handleCreateDestination = async (
    ofId: string,
    destination: DestinationCatalogue
  ) => {
    const created = await destinationApi.create(destination.code, destination.label);
    setDestinations((current) =>
      current.some((item) => item.code.toUpperCase() === created.code.toUpperCase())
        ? current
        : [...current, created]
    );
    handleUpdateSingleOF(ofId, { destination: created.code });
  };

  const handleDeleteDestination = async (code: string) => {
    await destinationApi.delete(code);
    setDestinations((current) =>
      current.filter((destination) => destination.code.toUpperCase() !== code.toUpperCase())
    );
  };

  const handleCreateOF = (e: React.FormEvent) => {
    e.preventDefault();
    const numeros = ofs
      .map((o) => parseInt((o.codeOF || '').replace(/\D/g, ''), 10))
      .filter((n) => !Number.isNaN(n));
    const nextIndex = (numeros.length ? Math.max(...numeros) : 0) + 1;
    const defaultCode = `OF${nextIndex}`;
    const newOF: OrdreFabrication = {
      id: `OF-${Date.now().toString().slice(-5)}`,
      codeOF: defaultCode,
      titre: '',
      ordreRDL: ofs.length + 1,
      type: 'I',
      nomExecutant: OF_TYPES['I'].label,
      quantiteDemandee: Number(newQuantite),
      quantiteFinie: 0,
      resteAProduire: Number(newQuantite),
      statut: 'EN_ATTENTE',
      nbCases: newNbCases,
      casesEnCours: normalizeCases(newCases, newNbCases, Number(newQuantite)),
      sousOfs: [],
    };
    onUpdateOFs([...ofs, newOF]);
    closeAddOF();
  };

  const handleDeleteOF = (ofId: string) => {
    const nextOfs = ofs.filter((o) => o.id !== ofId);
    onUpdateOFs(nextOfs.map((o, idx) => ({ ...o, ordreRDL: idx + 1 })));
  };

  const handleUpdateSingleOF = (ofId: string, updates: Partial<OrdreFabrication>) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      const updated = { ...o, ...updates };
      if (updates.statut !== undefined && updates.isLocked === undefined) {
        updated.isLocked = updates.statut === 'TERMINE' || updates.statut === 'BLOQUE';
      }
      const qteDemandee =
        updates.quantiteDemandee !== undefined
          ? Number(updates.quantiteDemandee)
          : o.quantiteDemandee;
      updated.quantiteDemandee = qteDemandee;
      updated.casesEnCours = normalizeCases(updated.casesEnCours, updated.nbCases || 5, qteDemandee);
      const qteFinie = computeOfQuantiteFinie(updated);
      updated.quantiteFinie = qteFinie;
      updated.resteAProduire = Math.max(0, qteDemandee - qteFinie);

      if (qteFinie !== o.quantiteFinie && updates.statut === undefined) {
        if (qteFinie >= qteDemandee && qteDemandee > 0) {
          updated.statut = 'TERMINE';
          updated.isLocked = true;
        } else if (qteFinie > 0 && o.statut === 'EN_ATTENTE') {
          updated.statut = 'EN_COURS';
        }
      }
      return updated;
    });
    onUpdateOFs(nextOfs);
  };

  /** Réordonne les OF : le plus haut devient le plus prioritaire (le code OF reste inchangé). */
  const handleMoveOF = (index: number, direction: 'UP' | 'DOWN') => {
    const cible = direction === 'UP' ? index - 1 : index + 1;
    if (cible < 0 || cible >= ofs.length) return;
    const copie = [...ofs];
    [copie[index], copie[cible]] = [copie[cible], copie[index]];
    onUpdateOFs(copie.map((o, idx) => ({ ...o, ordreRDL: idx + 1 })));
  };

  /** Divise l'OF en créant un sous-OF. Le premier hérite du total de l'OF. */
  const handleDirectAddSousOF = (ofId: string) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      const existants = o.sousOfs || [];
      const nextNum = existants.length + 1;
      const premier = existants.length === 0;
      const qte = premier ? Number(o.quantiteDemandee) || 0 : 0;
      const nbCases = premier ? o.nbCases || 5 : 5;
      const newSousOF: SousOrdreFabrication = {
        id: `SOF-${Date.now().toString().slice(-6)}`,
        codeSousOF: `${o.codeOF}.${nextNum}`,
        titre: '',
        type: o.type,
        nomExecutant: o.nomExecutant,
        quantiteDemandee: qte,
        quantiteFinie: 0,
        statut: 'EN_ATTENTE',
        nbCases,
        casesEnCours: normalizeCases(premier ? o.casesEnCours : undefined, nbCases, qte),
      };
      return recalcOFDepuisSousOfs({ ...o, sousOfs: [...existants, newSousOF] });
    });
    onUpdateOFs(nextOfs);
  };

  const handleUpdateSousOF = (
    ofId: string,
    sousOFId: string,
    updates: Partial<SousOrdreFabrication>
  ) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      const nextSousOfs = (o.sousOfs || []).map((sof) => {
        if (sof.id !== sousOFId) return sof;
        const updated = { ...sof, ...updates };
        if (updates.statut !== undefined && updates.isLocked === undefined) {
          updated.isLocked = updates.statut === 'TERMINE' || updates.statut === 'BLOQUE';
        }
        const nbCases = updated.nbCases || 5;
        const total =
          updates.quantiteDemandee !== undefined
            ? Number(updates.quantiteDemandee)
            : sof.quantiteDemandee;
        updated.quantiteDemandee = total;
        updated.casesEnCours = normalizeCases(updated.casesEnCours, nbCases, total);
        updated.quantiteFinie = computeOfQuantiteFinie(updated);
        return updated;
      });
      return recalcOFDepuisSousOfs({ ...o, sousOfs: nextSousOfs });
    });
    onUpdateOFs(nextOfs);
  };

  const handleDeleteSousOF = (ofId: string, sousOFId: string) => {
    const nextOfs = ofs.map((o) => {
      if (o.id !== ofId) return o;
      const nextSousOfs = (o.sousOfs || []).filter((sof) => sof.id !== sousOFId);
      if (nextSousOfs.length === 0) {
        return { ...o, sousOfs: [] };
      }
      return recalcOFDepuisSousOfs({ ...o, sousOfs: nextSousOfs });
    });
    onUpdateOFs(nextOfs);
  };

  return (
    <fieldset
      disabled={lectureSeule}
      className="bg-slate-50/90 p-2 rounded-xl border border-slate-200 mt-1 space-y-1.5 min-w-0"
    >
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-white rounded-lg border border-slate-200 text-[11px] text-slate-600 shadow-2xs">
        <label className="font-semibold text-slate-700 whitespace-nowrap">
          Quantité totale à répartir
        </label>
        <input
          type="number"
          min={1}
          value={totalDemandee}
          onChange={(e) => onChangeTotalDemandee?.(Math.max(0, Number(e.target.value)))}
          disabled={!onChangeTotalDemandee}
          title="Quantité totale qui sera divisée entre les OF"
          className="w-20 text-xs font-semibold px-2 py-0.5 rounded-lg border border-slate-300 bg-white disabled:bg-slate-100 disabled:text-slate-500"
        />
        <span className="text-slate-300">•</span>
        <span>
          Total alloué : <b className="text-slate-900">{totalAlloue.toLocaleString('fr-FR')}</b> /{' '}
          {totalDemandee.toLocaleString('fr-FR')}
        </span>
        <span>•</span>
        {ecartAlloue > 0 ? (
          <span className="text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5 font-bold">
            Sur-alloué : {ecartAlloue.toLocaleString('fr-FR')}
          </span>
        ) : ecartAlloue < 0 ? (
          <span className="text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 font-semibold">
            Reste à allouer : {Math.abs(ecartAlloue).toLocaleString('fr-FR')}
          </span>
        ) : (
          <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 font-bold">
            Tout alloué
          </span>
        )}
        <span>•</span>
        <span>
          Produit fini : <b className="text-slate-900">{totalFinie.toLocaleString('fr-FR')}</b> /{' '}
          {totalDemandee.toLocaleString('fr-FR')}
        </span>
        {ofs.length > 0 && (
          <button
            type="button"
            onClick={() => setIsCollapsed((c) => !c)}
            className="ml-auto p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            aria-label={isCollapsed ? 'Expand OF cards' : 'Collapse OF cards'}
            title={isCollapsed ? 'Expand OF cards' : 'Collapse OF cards'}
          >
            {isCollapsed ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {isAddingOF && (
        <div
          onSubmit={handleCreateOF}
          className="bg-white p-3.5 rounded-xl border border-slate-300 shadow-xs space-y-3 animate-in fade-in"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-bold text-slate-900">Ajouter un OF</h4>
            <button
              type="button"
              onClick={closeAddOF}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Quantité confiée
              </label>
              <input
                type="number"
                min={1}
                value={newQuantite}
                onChange={(e) => {
                  const qte = Math.max(0, Number(e.target.value));
                  setNewQuantite(qte);
                  setNewCases((prev) => normalizeCases(prev, newNbCases, qte));
                }}
                className="w-full text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
              />
            </div>

            <EnCoursGrid
              nbCases={newNbCases}
              casesEnCours={newCases}
              onChangeCaseValue={(idx, val) => {
                const next = normalizeCases(newCases, newNbCases, Number(newQuantite));
                next[idx] = val;
                setNewCases(next);
                setNewQuantite(next[next.length - 1]);
              }}
              onChangeNbCases={(n) => {
                setNewNbCases(n);
                setNewCases((prev) => normalizeCases(prev, n, Number(newQuantite)));
              }}
              showSelector={true}
              total={newQuantite}
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeAddOF}
              className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer shadow-2xs"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleCreateOF}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-black rounded-lg cursor-pointer shadow-2xs"
            >
              Enregistrer l'OF
            </button>
          </div>
        </div>
      )}

      {ofs.length === 0 ? (
        <div className="text-center py-2.5 bg-white rounded-xl border border-dashed border-slate-300 text-[11px] text-slate-500">
          Aucun OF pour cette carte. Cliquez sur "Ajouter un OF".
        </div>
      ) : !isCollapsed ? (
        <div className="space-y-1.5">
          {ofs.map((ofItem, index) => {
            const displayIndex = index + 1;
            const labelOF = ofItem.codeOF || `OF${displayIndex}`;
            const sousOfs = ofItem.sousOfs || [];
            const hasSubOfs = sousOfs.length > 0;
            const isOfLocked =
              ofItem.isLocked ?? (ofItem.statut === 'TERMINE' || ofItem.statut === 'BLOQUE');
            const ofNbCases = ofItem.nbCases || 5;
            const ofCases = normalizeCases(ofItem.casesEnCours, ofNbCases, ofItem.quantiteDemandee);

            // Référence d'inspection de cet OF (colonne Inspection du Suivi
            // Global) : 1 ✓ dès qu'un contrôle est passé, 2 ✓ seulement quand
            // tout est complet. Le CC ne compte pas comme un 3e ✓ : tant qu'il
            // reste à faire, on affiche une seule coche et le libellé « CC ».
            const valeursInspection = parCarte[cardId]?.valeurs ?? [];
            const controlePasse = (pct: 50 | 100) =>
              valeursInspection.some(
                (v) =>
                  v.type !== 'CC' &&
                  (v.ofIndex ?? 0) === index &&
                  (v.pct ?? 50) === pct &&
                  v.resultat === 'P'
              );
            // Un contrôle à 100 % doit avoir été saisi (exister) pour que le CC
            // soit envisageable ; avant cela, on n'affiche jamais « CC ».
            const i100Existe = valeursInspection.some(
              (v) =>
                v.type !== 'CC' &&
                (v.ofIndex ?? 0) === index &&
                (v.pct ?? 50) === 100
            );
            const ccPasse = valeursInspection.some(
              (v) =>
                v.type === 'CC' && (v.ofIndex ?? 0) === index && v.resultat === 'P'
            );
            // La seconde coche n'apparaît qu'une fois tout terminé : I 50 % et
            // I 100 % validés, et le CC passé lorsqu'il est requis.
            const toutComplet =
              controlePasse(50) && controlePasse(100) && (!i100Existe || ccPasse);
            const nbControlesPasses = toutComplet
              ? 2
              : controlePasse(50) || controlePasse(100)
              ? 1
              : 0;
            const ccEnAttente = i100Existe && !ccPasse;

            return (
              <div
                key={ofItem.id}
                className={`bg-white rounded-xl border shadow-2xs overflow-hidden ${
                  isOfLocked ? 'border-amber-300' : 'border-slate-300'
                }`}
              >
                <div className="p-1.5 bg-slate-100/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1.5">
                  <fieldset
                    disabled={lectureSeule || isOfLocked}
                    className="flex items-center gap-1.5 flex-wrap"
                  >
                    <div className="flex items-center gap-1">
                      <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded text-[11px] border border-slate-300 shadow-2xs">
                        {labelOF}
                      </span>
                      <div className="flex flex-col -space-y-1">
                        <button
                          type="button"
                          disabled={lectureSeule || isOfLocked || index === 0}
                          onClick={() => handleMoveOF(index, 'UP')}
                          title={`Monter ${labelOF} (plus prioritaire)`}
                          aria-label={`Monter ${labelOF}`}
                          className="p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-20 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
                        >
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          disabled={lectureSeule || isOfLocked || index === ofs.length - 1}
                          onClick={() => handleMoveOF(index, 'DOWN')}
                          title={`Descendre ${labelOF}`}
                          aria-label={`Descendre ${labelOF}`}
                          className="p-0.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200 disabled:opacity-20 disabled:hover:bg-transparent rounded transition-colors cursor-pointer"
                        >
                          <ChevronDown className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    <EditableItemName
                      value={ofItem.titre}
                      defaultValue=""
                      placeholder="Nom de l'OF..."
                      onSave={(nom) => handleUpdateSingleOF(ofItem.id, { titre: nom })}
                      disabled={lectureSeule || isOfLocked}
                      className="text-xs font-bold text-slate-900 bg-white border border-slate-200 rounded"
                    />
                    {hasSubOfs && (
                      <span className="text-[10px] font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">
                        {sousOfs.length} sous-OF
                      </span>
                    )}
                  </fieldset>

                  {/* Actions de l'OF */}
                  <div className="flex items-center gap-1">
                    <select
                      value={ofItem.statut}
                      disabled={lectureSeule}
                      aria-label={`Statut de ${labelOF}`}
                      title={`Statut de ${labelOF}`}
                      onChange={(event) =>
                        handleUpdateSingleOF(ofItem.id, {
                          statut: event.target.value as CardStatus,
                        })
                      }
                      className={`max-w-28 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
                        lectureSeule ? 'cursor-default' : 'cursor-pointer'
                      } ${getStatusBadge(ofItem.statut)}`}
                    >
                      <option value="EN_ATTENTE">En attente</option>
                      <option value="EN_COURS">En cours</option>
                      <option value="TERMINE">Terminé</option>
                      <option value="BLOQUE">Bloqué</option>
                    </select>
                    <button
                      type="button"
                      disabled={lectureSeule}
                      aria-label={isOfLocked ? `Déverrouiller ${labelOF}` : `Verrouiller ${labelOF}`}
                      title={
                        isOfLocked
                          ? `Déverrouiller ${labelOF} pour le modifier`
                          : `Verrouiller ${labelOF}`
                      }
                      onClick={() =>
                        handleUpdateSingleOF(ofItem.id, { isLocked: !isOfLocked })
                      }
                      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold transition-colors disabled:cursor-default disabled:opacity-50 ${
                        isOfLocked
                          ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                          : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {isOfLocked ? (
                        <Unlock className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <Lock className="h-3 w-3" aria-hidden="true" />
                      )}
                      {isOfLocked ? 'Déverrouiller' : 'Verrouiller'}
                    </button>
                    <button
                      type="button"
                      disabled={lectureSeule || isOfLocked}
                      onClick={() => handleDirectAddSousOF(ofItem.id)}
                      title={`Ajouter un sous-OF à ${labelOF}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded transition-colors shadow-2xs cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Sous OF</span>
                    </button>
                    <button
                      type="button"
                      disabled={lectureSeule || isOfLocked}
                      onClick={() => handleDeleteOF(ofItem.id)}
                      title={`Supprimer ${labelOF}`}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <fieldset
                  disabled={lectureSeule || isOfLocked}
                  className="p-2 space-y-2 disabled:cursor-not-allowed"
                >
                  {hasSubOfs ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-500 border-b border-slate-200 pb-0.5">
                        <span>Sous-OF de {labelOF} ({sousOfs.length})</span>
                        <span className="text-slate-400 font-semibold">
                          Total confié : {ofItem.quantiteDemandee.toLocaleString('fr-FR')}
                        </span>
                      </div>

                      {sousOfs.map((sof) => {
                        const isSousOFLocked =
                          sof.isLocked ?? (sof.statut === 'TERMINE' || sof.statut === 'BLOQUE');
                        const sofNbCases = sof.nbCases || 5;
                        const sofCases = normalizeCases(
                          sof.casesEnCours,
                          sofNbCases,
                          sof.quantiteDemandee
                        );
                        return (
                          <div
                            key={sof.id}
                            className="bg-slate-50/70 rounded-lg border border-slate-200 p-1.5 space-y-1.5"
                          >
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-bold text-slate-700 bg-white px-1.5 py-0.5 rounded text-[10px] border border-slate-300 shadow-2xs">
                                {sof.codeSousOF}
                              </span>
                              <EditableItemName
                                value={sof.titre}
                                defaultValue=""
                                placeholder="Nom du sous-OF..."
                                onSave={(nom) =>
                                  handleUpdateSousOF(ofItem.id, sof.id, { titre: nom })
                                }
                                disabled={isSousOFLocked}
                                className="text-xs font-bold text-slate-900"
                              />
                              <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-slate-300 shadow-2xs">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  Assig.
                                </span>
                                <input
                                  type="number"
                                  min={0}
                                  disabled={isSousOFLocked}
                                  value={sof.quantiteDemandee}
                                  onChange={(e) =>
                                    handleUpdateSousOF(ofItem.id, sof.id, {
                                      quantiteDemandee: Math.max(
                                        0,
                                        parseInt(e.target.value, 10) || 0
                                      ),
                                    })
                                  }
                                  className="w-12 px-1 py-0.5 text-[11px] font-bold text-center text-slate-900 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:outline-hidden [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                                  Fini
                                </span>
                                <span className="w-12 px-1 py-0.5 text-[11px] font-bold text-center text-slate-500 bg-slate-100 border border-slate-200 rounded">
                                  {computeOfQuantiteFinie(sof)}
                                </span>
                              </div>
                              <select
                                value={sof.statut}
                                disabled={isOfLocked}
                                onChange={(e) =>
                                  handleUpdateSousOF(ofItem.id, sof.id, {
                                    statut: e.target.value as CardStatus,
                                  })
                                }
                                className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border cursor-pointer ${getStatusBadge(
                                  sof.statut
                                )}`}
                              >
                                <option value="EN_COURS">En cours</option>
                                <option value="EN_ATTENTE">En attente</option>
                                <option value="TERMINE">Terminé</option>
                                <option value="BLOQUE">Bloqué</option>
                              </select>
                              <button
                                type="button"
                                disabled={isOfLocked}
                                aria-label={
                                  isSousOFLocked
                                    ? `Déverrouiller ${sof.codeSousOF}`
                                    : `Verrouiller ${sof.codeSousOF}`
                                }
                                title={
                                  isSousOFLocked
                                    ? `Déverrouiller ${sof.codeSousOF} pour le modifier`
                                    : `Verrouiller ${sof.codeSousOF}`
                                }
                                onClick={() =>
                                  handleUpdateSousOF(ofItem.id, sof.id, {
                                    isLocked: !isSousOFLocked,
                                  })
                                }
                                className={`rounded border p-1 transition-colors disabled:cursor-default disabled:opacity-50 ${
                                  isSousOFLocked
                                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                                    : 'border-slate-300 bg-white text-slate-500 hover:bg-slate-100'
                                }`}
                              >
                                {isSousOFLocked ? (
                                  <Unlock className="h-3 w-3" aria-hidden="true" />
                                ) : (
                                  <Lock className="h-3 w-3" aria-hidden="true" />
                                )}
                              </button>
                              <button
                                type="button"
                                disabled={isSousOFLocked}
                                onClick={() => handleDeleteSousOF(ofItem.id, sof.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title="Supprimer ce sous-OF"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>

                            <EnCoursGrid
                              nbCases={sofNbCases}
                              casesEnCours={sofCases}
                              onChangeCaseValue={(idx, val) =>
                                handleUpdateSousOF(ofItem.id, sof.id, {
                                  casesEnCours: normalizeCases(
                                    sofCases.map((c, i) => (i === idx ? val : c)),
                                    sofNbCases,
                                    sof.quantiteDemandee
                                  ),
                                })
                              }
                              onChangeNbCases={(n) =>
                                handleUpdateSousOF(ofItem.id, sof.id, { nbCases: n })
                              }
                              disabled={isSousOFLocked}
                              showSelector={true}
                              total={sof.quantiteDemandee}
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-1.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <label className="text-[11px] text-slate-600 font-medium">
                            Quantité confiée
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={ofItem.quantiteDemandee}
                            onChange={(e) =>
                              handleUpdateSingleOF(ofItem.id, {
                                quantiteDemandee: Math.max(0, Number(e.target.value)),
                              })
                            }
                            className="w-14 text-xs font-semibold px-2 py-0.5 rounded-lg border border-slate-300 bg-white"
                          />
                          <select
                            value={normalizeOFType(ofItem.type)}
                            onChange={(e) => {
                              const t = e.target.value as OFType;
                              handleUpdateSingleOF(ofItem.id, {
                                type: t,
                                nomExecutant: OF_TYPES[t].label,
                              });
                            }}
                            title={`Traitant : ${OF_TYPES[normalizeOFType(ofItem.type)].label}`}
                            className={`text-[11px] font-bold rounded-lg px-1.5 py-0.5 border cursor-pointer ${OF_TYPES[normalizeOFType(ofItem.type)].classe}`}
                          >
                            {(['L', 'O', 'I', 'BDA'] as OFType[]).map((t) => (
                              <option key={t} value={t} title={OF_TYPES[t].label}>
                                {t}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center gap-2.5">
                          {/* Combobox Destination : catalogue des pays (FR, US, ES,
                              MX…) + destinations déjà utilisées, avec possibilité
                              d'en ajouter une nouvelle via le bouton "+" qui
                              bascule en mode édition inline. */}
                          <DestinationCombo
                            value={ofItem.destination}
                            options={optionsDestination}
                            onChange={(dest) =>
                              handleUpdateSingleOF(ofItem.id, { destination: dest })
                            }
                            title={
                              ofItem.destination
                                ? `Destination : ${optionsDestination.find(
                                    (destination) =>
                                      destination.code.toUpperCase() ===
                                      ofItem.destination?.toUpperCase()
                                  )?.label ?? ofItem.destination}`
                                : 'Choisir la destination de cet OF'
                            }
                            lectureSeule={lectureSeule || isOfLocked}
                            onCreate={(destination) =>
                              handleCreateDestination(ofItem.id, destination)
                            }
                            onDelete={handleDeleteDestination}
                          />
                          {(nbControlesPasses > 0 || ccEnAttente) && (
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full pl-2 py-0.5 ${
                                ccEnAttente ? 'pr-2.5' : 'pr-2'
                              } ${
                                nbControlesPasses > 0
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-slate-100 text-slate-400'
                              }`}
                              title={
                                `Contrôles passés : ${nbControlesPasses}/2` +
                                (i100Existe
                                  ? ccPasse
                                    ? ' • CC OK'
                                    : ' • CC en attente'
                                  : '')
                              }
                            >
                              {nbControlesPasses > 0 && (
                                <span className="inline-flex items-center">
                                  {Array.from({ length: nbControlesPasses }).map(
                                    (_, i) => (
                                      <Check
                                        key={i}
                                        className="-ml-1.5 first:ml-0 w-[15px] h-[15px]"
                                        strokeWidth={3}
                                      />
                                    )
                                  )}
                                </span>
                              )}
                              {ccEnAttente && (
                                <>
                                  <span
                                    className={`w-px h-3 ${
                                      nbControlesPasses > 0
                                        ? 'bg-emerald-300'
                                        : 'bg-slate-300'
                                    }`}
                                  />
                                  <span className="text-[10px] font-bold tracking-wide leading-none">
                                    CC
                                  </span>
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <EnCoursGrid
                        nbCases={ofNbCases}
                        casesEnCours={ofCases}
                        onChangeCaseValue={(idx, val) =>
                          handleUpdateSingleOF(ofItem.id, {
                            casesEnCours: normalizeCases(
                              ofCases.map((c, i) => (i === idx ? val : c)),
                              ofNbCases,
                              ofItem.quantiteDemandee
                            ),
                          })
                        }
                        onChangeNbCases={(n) => handleChangeNbCases(ofItem.id, n)}
                        disabled={isOfLocked}
                        showSelector={true}
                        total={ofItem.quantiteDemandee}
                      />
                    </>
                  )}
                </fieldset>
              </div>
            );
          })}
        </div>
      ) : null}
    </fieldset>
  );
};
