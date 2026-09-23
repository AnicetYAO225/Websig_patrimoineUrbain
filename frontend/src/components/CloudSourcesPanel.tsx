
#cloudsourcePanel

import { useEffect, useMemo, useState } from "react";
import type { RefObject } from "react";
import {
  Cloud,
  Flame,
  Satellite as SatelliteIcon,
  Sprout,
  Droplets,
  Leaf,
  AlertTriangle,
  Map as MapIcon,
  Search,
  Download,
  X,
  Loader2,
} from "lucide-react";
import { Cartouche, SectionLabel } from "./Panel";
import { listCloudSources, searchCloudSource, importCloudDataset } from "../api/cloudSourcesApi";
import type { CloudCategory, CloudDatasetResult, CloudSource } from "../types/cloudSources";
import { CLOUD_CATEGORY_LABELS } from "../types/cloudSources";
import type { MapCanvasHandle } from "./MapCanvas";

// alias local pour éviter d'importer ComponentType juste pour ce record
type ComponentTypeIcon = typeof Cloud;

const CATEGORY_ICONS: Record<CloudCategory, ComponentTypeIcon> = {
  satellite: SatelliteIcon,
  fire: Flame,
  agriculture: Sprout,
  water: Droplets,
  environment: Leaf,
  disaster: AlertTriangle,
  osm: MapIcon,
};

const ALL_CATEGORIES: CloudCategory[] = [
  "satellite",
  "fire",
  "disaster",
  "environment",
  "agriculture",
  "water",
  "osm",
];

interface CloudSourcesPanelProps {
  mapRef: RefObject<MapCanvasHandle>;
  /** Appelé après un import réussi, pour que MapPage recharge la liste des couches (loadAll()). */
  onLayerImported: () => void;
  onClose: () => void;
}

export function CloudSourcesPanel({ mapRef, onLayerImported, onClose }: CloudSourcesPanelProps) {
  const [category, setCategory] = useState<CloudCategory>("satellite");
  const [sources, setSources] = useState<CloudSource[]>([]);
  const [loadingSources, setLoadingSources] = useState(false);
  const [selectedSource, setSelectedSource] = useState<CloudSource | null>(null);

  const [query, setQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [results, setResults] = useState<CloudDatasetResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [importDraft, setImportDraft] = useState<CloudDatasetResult | null>(null);
  const [layerNameDraft, setLayerNameDraft] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  useEffect(() => {
    setLoadingSources(true);
    setSelectedSource(null);
    setResults([]);
    listCloudSources(category)
      .then(setSources)
      .catch(() => setSources([]))
      .finally(() => setLoadingSources(false));
  }, [category]);

  const bbox = useMemo(() => mapRef.current?.getBounds() ?? null, [selectedSource]);

  async function handleSearch() {
    if (!selectedSource) return;
    const currentBbox = mapRef.current?.getBounds();
    if (!currentBbox) {
      setSearchError("Impossible de lire l'emprise actuelle de la carte.");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const res = await searchCloudSource(selectedSource.id, currentBbox, {
        q: query || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setResults(res.results);
    } catch (err: any) {
      setSearchError(
        err?.response?.data?.detail ?? "La recherche a échoué. Le service distant est peut-être indisponible."
      );
    } finally {
      setSearching(false);
    }
  }

  function openImportDraft(result: CloudDatasetResult) {
    setImportDraft(result);
    setLayerNameDraft(
      result.title.length <= 60 ? result.title : `${selectedSource?.name ?? "Import"} — ${result.date ?? ""}`
    );
    setImportError(null);
  }

  async function confirmImport() {
    if (!selectedSource || !importDraft) return;
    const currentBbox = mapRef.current?.getBounds();
    setImporting(true);
    setImportError(null);
    try {
      const res = await importCloudDataset(selectedSource.id, {
        dataset_id: importDraft.dataset_id,
        layer_name: layerNameDraft.trim() || importDraft.title,
        bbox: currentBbox ?? undefined,
      });
      setImportSuccess(`Couche créée : ${res.feature_count} objet(s) importé(s).`);
      setImportDraft(null);
      onLayerImported();
      setTimeout(() => setImportSuccess(null), 4000);
    } catch (err: any) {
      setImportError(err?.response?.data?.detail ?? "L'import a échoué.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1500] flex items-center justify-center bg-ink-900/50 p-4 print:hidden">
      <Cartouche className="flex h-[85vh] w-full max-w-4xl flex-col overflow-hidden p-0">
        {/* En-tête */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-ink-300/40 px-5 py-4">
          <SectionLabel icon={Cloud}>Données cloud</SectionLabel>
          <button
            onClick={onClose}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-ink-500 hover:bg-ink-900/5"
            aria-label="Fermer"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Colonne catégories */}
          <div className="w-40 flex-shrink-0 overflow-y-auto border-r border-ink-300/40 bg-paper-100/40 p-2">
            {ALL_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICONS[cat];
              const active = category === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium transition-colors ${
                    active ? "bg-copper-600 text-white" : "text-ink-600 hover:bg-paper-100"
                  }`}
                >
                  <Icon size={14} />
                  {CLOUD_CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>

          {/* Colonne sources */}
          <div className="w-56 flex-shrink-0 overflow-y-auto border-r border-ink-300/40 p-2">
            {loadingSources && (
              <div className="flex items-center gap-2 px-2 py-3 text-xs text-ink-400">
                <Loader2 size={13} className="animate-spin" /> Chargement...
              </div>
            )}
            {!loadingSources && sources.length === 0 && (
              <p className="px-2 py-3 text-xs text-ink-400">Aucune source dans cette catégorie.</p>
            )}
            {sources.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setSelectedSource(s);
                  setResults([]);
                  setSearchError(null);
                }}
                className={`mb-1.5 w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                  selectedSource?.id === s.id
                    ? "border-copper-600 bg-copper-100/40"
                    : "border-ink-300/30 hover:bg-paper-100"
                }`}
              >
                <p className="text-xs font-medium text-ink-800">{s.name}</p>
                <p className="mt-0.5 font-data text-[10px] text-ink-400">{s.provider}</p>
              </button>
            ))}
          </div>

          {/* Colonne résultats */}
          <div className="flex min-w-0 flex-1 flex-col">
            {!selectedSource && (
              <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-ink-400">
                Choisis une source dans la liste pour lancer une recherche sur l'emprise actuelle de la carte.
              </div>
            )}

            {selectedSource && (
              <>
                <div className="flex-shrink-0 border-b border-ink-300/40 p-3">
                  <p className="mb-2 text-xs text-ink-500">{selectedSource.description}</p>
                  {selectedSource.default_zoom_hint && (
                    <p className="mb-2 text-[10px] italic text-ink-400">{selectedSource.default_zoom_hint}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Mot-clé (optionnel)"
                      className="w-40 rounded-lg border border-ink-300 px-2.5 py-1.5 text-xs text-ink-900 outline-none focus:border-copper-600"
                    />
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="rounded-lg border border-ink-300 px-2.5 py-1.5 text-xs text-ink-900 outline-none focus:border-copper-600"
                    />
                    <span className="text-xs text-ink-400">→</span>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="rounded-lg border border-ink-300 px-2.5 py-1.5 text-xs text-ink-900 outline-none focus:border-copper-600"
                    />
                    <button
                      onClick={handleSearch}
                      disabled={searching}
                      className="ml-auto flex items-center gap-1.5 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-copper-600 disabled:opacity-50"
                    >
                      {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                      Rechercher sur cette emprise
                    </button>
                  </div>
                  {!bbox && (
                    <p className="mt-1.5 text-[10px] text-ink-400">
                      Astuce : positionne la carte sur la zone qui t'intéresse avant de lancer la recherche.
                    </p>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto p-3">
                  {searchError && (
                    <p className="mb-3 rounded-lg border-l-2 border-signal-600 bg-signal-100 px-3 py-2.5 text-xs text-signal-600">
                      {searchError}
                    </p>
                  )}
                  {importSuccess && (
                    <p className="mb-3 rounded-lg border-l-2 border-pine-600 bg-pine-100 px-3 py-2.5 text-xs text-pine-700">
                      {importSuccess}
                    </p>
                  )}
                  {!searching && results.length === 0 && !searchError && (
                    <p className="text-xs text-ink-400">Aucun résultat pour l'instant — lance une recherche.</p>
                  )}

                  <div className="grid grid-cols-2 gap-2.5">
                    {results.map((r) => (
                      <div key={r.dataset_id} className="rounded-lg border border-ink-300/30 p-2.5">
                        {r.thumbnail_url && (
                          <img
                            src={r.thumbnail_url}
                            alt=""
                            className="mb-2 h-24 w-full rounded object-cover"
                            loading="lazy"
                          />
                        )}
                        <p className="text-xs font-medium text-ink-800">{r.title}</p>
                        {r.description && <p className="mt-0.5 text-[10px] text-ink-500">{r.description}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-data text-[10px] text-ink-400">
                          {r.date && <span>{r.date}</span>}
                          {r.feature_count != null && <span>· {r.feature_count} objet(s)</span>}
                          {r.geometry_type && <span>· {r.geometry_type}</span>}
                        </div>
                        <button
                          onClick={() => openImportDraft(r)}
                          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-ink-300 py-1.5 text-[11px] font-medium text-ink-700 hover:border-copper-600 hover:text-copper-600"
                        >
                          <Download size={12} />
                          Importer comme couche
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Cartouche>

      {/* Confirmation d'import : nom de la future couche */}
      {importDraft && (
        <div className="fixed inset-0 z-[1600] flex items-center justify-center bg-ink-900/60 p-4">
          <Cartouche className="w-full max-w-sm p-6">
            <h3 className="font-display text-sm font-semibold text-ink-900">Importer « {importDraft.title} »</h3>
            <label className="mb-1 mt-4 block text-xs font-medium text-ink-700">Nom de la nouvelle couche</label>
            <input
              value={layerNameDraft}
              onChange={(e) => setLayerNameDraft(e.target.value)}
              className="w-full rounded-lg border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
              autoFocus
            />
            {importError && <p className="mt-2 text-xs text-signal-600">{importError}</p>}
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setImportDraft(null)}
                disabled={importing}
                className="rounded-lg flex-1 border border-ink-300 py-2 text-sm text-ink-600 hover:bg-paper-100 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                onClick={confirmImport}
                disabled={importing || !layerNameDraft.trim()}
                className="rounded-lg flex flex-1 items-center justify-center gap-1.5 bg-ink-900 py-2 text-sm font-medium text-white hover:bg-copper-600 disabled:opacity-50"
              >
                {importing && <Loader2 size={14} className="animate-spin" />}
                Importer
              </button>
            </div>
          </Cartouche>
        </div>
      )}
    </div>
  );
}
