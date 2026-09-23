import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { CartographyModal } from "../components/CartographyModal";
import { SymbologyPanel, type SymbologyConfig } from "../components/SymbologyPanel";
import { CloudSourcesPanel } from "../components/CloudSourcesPanel";
import {
  Layers as LayersIcon,
  PanelLeftClose,
  PanelLeftOpen,
  MapPin,
  Plus,
  Search,
  Table2,
  BarChart3,
  Radar,
  Palette,
  MapPinned,
  Cloud,
  X,
} from "lucide-react";
import { Layout } from "../components/Layout";
import { RoleGuard } from "../components/RoleGuard";
import { useAuth } from "../context/AuthContext";
import { MapCanvas, type MapCanvasHandle } from "../components/MapCanvas";
import { HistoryModal } from "../components/HistoryModal";
import { FeaturePropertiesModal } from "../components/FeaturePropertiesModal";
import { AttributeTable } from "../components/AttributeTable";
import { StatsPanel } from "../components/StatsPanel";
import { SpatialSearchPanel } from "../components/SpatialSearchPanel";
import { SectionLabel } from "../components/Panel";
import * as layersApi from "../api/layers";
import * as featuresApi from "../api/features";
import { getGeometryCenter } from "../lib/geo";
import type { GeoJSONFeature, GeoJSONFeatureCollection, GeoJSONGeometry, Layer } from "../types";

// Palette de couleurs assignée aux couches dans l'ordre d'affichage
const COLORS = ["#a6602e", "#2c473e", "#5b6b78", "#8a3f2f", "#3f6355", "#7a5a3a", "#4a5a68"];

const GEOMETRY_LABELS: Record<string, string> = {
  Point: "un point",
  LineString: "une ligne",
  Polygon: "un polygone",
};

// Propriétés couramment utilisées comme "nom" d'un objet, dans l'ordre de préférence
const LABEL_PROPERTY_CANDIDATES = ["nom", "name", "NOM", "libelle", "label"];

interface LayerWithData extends Layer {
  color: string;
  data: GeoJSONFeatureCollection | null;
  visible: boolean;
}

interface SearchResult {
  layerId: number;
  layerName: string;
  label: string;
  feature: GeoJSONFeature;
}

function featureLabel(feature: GeoJSONFeature): string {
  for (const key of LABEL_PROPERTY_CANDIDATES) {
    const value = feature.properties?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return `Objet #${feature.id}`;
}

export function MapPage() {
  const { user } = useAuth();
  const mapRef = useRef<MapCanvasHandle>(null);
  const [layers, setLayers] = useState<LayerWithData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [historyFeatureId, setHistoryFeatureId] = useState<number | null>(null);

  // Couche actuellement ciblée par le mode "dessin" (null = dessin désactivé)
  const [drawingLayer, setDrawingLayer] = useState<LayerWithData | null>(null);

  // Géométrie dessinée en attente de validation (ouvre le formulaire de propriétés)
  const [pendingGeometry, setPendingGeometry] = useState<GeoJSONGeometry | null>(null);
  const [editingFeature, setEditingFeature] = useState<{
    layerId: number;
    layerName: string;
    featureId: number;
    properties: Record<string, string>;
  } | null>(null);

  // Couche dont la table attributaire est actuellement ouverte (null = fermée)
  const [attributeTableLayerId, setAttributeTableLayerId] = useState<number | null>(null);
  const [cartographyOpen, setCartographyOpen] = useState(false);
  // Couche dont le panneau de symbologie est actuellement ouvert (null = fermé)
  const [symbologyLayerId, setSymbologyLayerId] = useState<number | null>(null);
  // Configuration de symbologie par couche (hydratée depuis le backend au chargement)
  const [layerSymbologies, setLayerSymbologies] = useState<Record<number, SymbologyConfig | null>>({});
  const [labelsVisible, setLabelsVisible] = useState<Record<number, boolean>>({});
  const [statsOpen, setStatsOpen] = useState(false);
  const [spatialSearchOpen, setSpatialSearchOpen] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [pickedPoint, setPickedPoint] = useState<{ lng: number; lat: number } | null>(null);
  const [highlightResults, setHighlightResults] = useState<GeoJSONFeatureCollection | null>(null);
  const [searchRadius, setSearchRadius] = useState(500);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Panneau d'import de sources distantes (cloud) : WFS, GeoJSON hébergé, etc.
  const [cloudPanelOpen, setCloudPanelOpen] = useState(false);

  async function loadAll() {
    setLoadError(null);
    try {
      const rawLayers = await layersApi.listLayers();
      const withData = await Promise.all(
        rawLayers.map(async (layer, i) => {
          try {
            const data = await featuresApi.listFeatures(layer.id);
            return { ...layer, color: COLORS[i % COLORS.length], data, visible: true };
          } catch (err) {
            // Une couche qui échoue à charger ne doit jamais faire disparaître
            // toutes les autres : elle apparaît vide plutôt que de tout bloquer.
            console.error(`Impossible de charger les objets de la couche "${layer.name}"`, err);
            return {
              ...layer,
              color: COLORS[i % COLORS.length],
              data: { type: "FeatureCollection" as const, features: [] },
              visible: true,
            };
          }
        })
      );
      setLayers(withData);

      // Hydrate la symbologie de chaque couche depuis ce que le backend a
      // renvoyé (style_config), pour qu'elle survive au rechargement de page.
      // ⚠️ Suppose que layersApi.listLayers() renvoie bien un champ
      // "style_config" par couche, et que le backend le stocke réellement —
      // à vérifier côté API si la persistance ne semble pas fonctionner.
      const initialSymbologies: Record<number, SymbologyConfig | null> = {};
      withData.forEach((l) => {
        initialSymbologies[l.id] = (l as any).style_config ?? null;
      });
      setLayerSymbologies(initialSymbologies);
    } catch (err) {
      console.error("Impossible de charger les couches", err);
      setLoadError(
        "Impossible de charger les couches. Vérifie que le backend est démarré et accessible, puis recharge la page."
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  // Sur mobile/tablette, le panneau des couches est un tiroir superposé :
  // il vaut mieux qu'il soit fermé par défaut pour ne pas masquer la carte
  // au premier chargement. Sur desktop (lg+), il reste ouvert comme avant.
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(false);
    }
  }, []);

  function toggleLayer(id: number) {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l)));
  }

  function toggleDrawingLayer(layer: LayerWithData) {
    setDrawingLayer((prev) => (prev?.id === layer.id ? null : layer));
  }

  async function handleCreateFeature(properties: Record<string, string>) {
    if (!drawingLayer || !pendingGeometry) return;
    await featuresApi.createFeature(drawingLayer.id, pendingGeometry, properties);
    setPendingGeometry(null);
    setDrawingLayer(null);
    await loadAll(); // rafraîchit toutes les couches pour afficher le nouvel objet
  }

  function handleCancelFeature() {
    setPendingGeometry(null);
    // On laisse drawingLayer actif : l'utilisateur peut redessiner directement
  }

  function handleEditFeature(layerId: number, feature: any) {
    const layer = layers.find((l) => l.id === layerId);
    if (!layer) return;
    const cleanProps: Record<string, string> = {};
    for (const [k, v] of Object.entries(feature.properties || {})) {
      if (!["layer_id", "created_at", "updated_at"].includes(k)) {
        cleanProps[k] = String(v);
      }
    }
    setEditingFeature({
      layerId,
      layerName: layer.name,
      featureId: feature.id as number,
      properties: cleanProps,
    });
  }

  async function handleUpdateFeature(properties: Record<string, string>) {
    if (!editingFeature) return;
    await featuresApi.updateFeature(editingFeature.featureId, properties);
    setEditingFeature(null);
    await loadAll();
  }

  async function handleDeleteFeature(_layerId: number, feature: any) {
    if (!confirm("Supprimer définitivement cet objet ?")) return;
    await featuresApi.deleteFeature(feature.id as number);
    await loadAll();
  }

  function handleLocateFeature(feature: GeoJSONFeature) {
    const [lng, lat] = getGeometryCenter(feature.geometry);
    const rows = Object.entries(feature.properties || {})
      .filter(([k]) => !["layer_id", "created_at", "updated_at"].includes(k))
      .map(([k, v]) => `<b>${k}</b>: ${v}`)
      .join("<br/>");
    mapRef.current?.flyTo(lng, lat, rows || undefined);
  }

  function handleEditFeatureFromTable(layerId: number, feature: GeoJSONFeature) {
    handleEditFeature(layerId, feature);
  }

  async function handleDeleteFeatureFromTable(feature: GeoJSONFeature) {
    if (!confirm("Supprimer définitivement cet objet ?")) return;
    await featuresApi.deleteFeature(feature.id as number);
    await loadAll();
  }

  async function handleApplySymbology(layerId: number, config: SymbologyConfig | null) {
    setLayerSymbologies((prev) => ({ ...prev, [layerId]: config }));
    try {
      await layersApi.updateLayerStyle(layerId, config);
    } catch (err) {
      console.error("Impossible d'enregistrer la symbologie", err);
    }
  }

  // --- Recherche d'objets (ex: une commune) à travers toutes les couches chargées ---
  const searchResults: SearchResult[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];

    const results: SearchResult[] = [];
    for (const layer of layers) {
      if (!layer.data) continue;
      for (const feature of layer.data.features) {
        const label = featureLabel(feature);
        if (label.toLowerCase().includes(q)) {
          results.push({ layerId: layer.id, layerName: layer.name, label, feature });
        }
      }
    }
    return results.slice(0, 20);
  }, [search, layers]);

  function handleSelectResult(result: SearchResult) {
    const [lng, lat] = getGeometryCenter(result.feature.geometry);
    const rows = Object.entries(result.feature.properties || {})
      .filter(([k]) => !["layer_id", "created_at", "updated_at"].includes(k))
      .map(([k, v]) => `<b>${k}</b>: ${v}`)
      .join("<br/>");
    mapRef.current?.flyTo(lng, lat, `<strong>${result.layerName}</strong><br/>${rows}`);
    setShowResults(false);
  }

  const totalVisibleFeatures = layers
    .filter((l) => l.visible)
    .reduce((sum, l) => sum + (l.data?.features.length ?? 0), 0);

  const mapLayers = useMemo(
    () =>
      layers
        .filter((l) => l.data)
        .map((l) => ({
          id: l.id,
          color: l.color,
          geometryType: l.geometry_type,
          data: l.data as GeoJSONFeatureCollection,
          visible: l.visible,
          symbology: layerSymbologies[l.id] ?? null,
          showLabels: labelsVisible[l.id] ?? false,
        })),
    [layers, layerSymbologies, labelsVisible]
  );

  const layerLabel = useCallback(
    (layerId: number) => layers.find((l) => l.id === layerId)?.name ?? "",
    [layers]
  );

  const canDraw = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN" || user?.role === "AGENT";
  const drawTargets = useMemo(() => {
    if (!canDraw) return [];
    const seenTypes = new Set<string>();
    const targets: { id: number; name: string; geometryType: Layer["geometry_type"] }[] = [];
    for (const layer of layers) {
      if (!seenTypes.has(layer.geometry_type)) {
        seenTypes.add(layer.geometry_type);
        targets.push({ id: layer.id, name: layer.name, geometryType: layer.geometry_type });
      }
    }
    return targets;
  }, [layers, canDraw]);

  function handleToggleDrawTarget(layerId: number) {
    const layer = layers.find((l) => l.id === layerId);
    if (layer) toggleDrawingLayer(layer);
  }

  const attributeTableLayer = attributeTableLayerId
    ? layers.find((l) => l.id === attributeTableLayerId) ?? null
    : null;

  return (
    <Layout>
      <div className="relative flex h-full overflow-hidden">
        {/* Fond assombri derrière le panneau des couches, mobile/tablette uniquement */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-[4] bg-ink-900/40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden
          />
        )}

        {/* --- Panneau des couches, façon légende de carte (repliable) ---
            Mobile/tablette (< lg) : tiroir superposé sur la carte.
            Desktop (lg+) : colonne statique qui pousse la carte, comme avant. */}
        {sidebarOpen && (
          <aside className="rounded-lg fixed inset-y-0 left-0 z-[5] flex w-[85vw] max-w-sm flex-shrink-0 flex-col overflow-y-auto border-r border-ink-300/40 bg-white p-5 shadow-xl lg:static lg:w-80 lg:max-w-none lg:shadow-none">
            <div className="mb-1 flex items-center justify-between">
              <SectionLabel icon={MapPin}>Couches</SectionLabel>
              <button
                onClick={() => setSidebarOpen(false)}
                className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-ink-500 hover:bg-ink-900/5 lg:hidden"
                aria-label="Fermer le panneau des couches"
              >
                <X size={15} />
              </button>
            </div>

            <button
              onClick={() => setStatsOpen(true)}
              className="mb-4 flex items-center gap-2 rounded-lg border border-ink-300/40 px-3 py-2 text-xs font-medium text-ink-700 hover:bg-paper-100"
            >
              <BarChart3 size={14} className="text-copper-600" />
              Statistiques
            </button>

            <button
              onClick={() => setCartographyOpen(true)}
              className="mb-4 flex items-center gap-2 rounded-lg border border-ink-300/40 px-3 py-2 text-xs font-medium text-ink-700 hover:bg-paper-100"
            >
              <MapPinned size={14} className="text-copper-600" />
              Cartographie
            </button>

            <button
              onClick={() => setSpatialSearchOpen(true)}
              className="mb-4 flex items-center gap-2 rounded-lg border border-ink-300/40 px-3 py-2 text-xs font-medium text-ink-700 hover:bg-paper-100"
            >
              <Radar size={14} className="text-copper-600" />
              Recherche spatiale
            </button>

            <RoleGuard roles={["SUPER_ADMIN", "ADMIN", "AGENT"]}>
              <button
                onClick={() => setCloudPanelOpen(true)}
                className="mb-4 flex items-center gap-2 rounded-lg border border-ink-300/40 px-3 py-2 text-xs font-medium text-ink-700 hover:bg-paper-100"
              >
                <Cloud size={14} className="text-copper-600" />
                Sources distantes
              </button>
            </RoleGuard>

            {isLoading && <p className="text-xs text-ink-400">Chargement des couches...</p>}
            {loadError && (
              <p className="mb-4 rounded-lg border-l-2 border-signal-600 bg-signal-100 px-3 py-2.5 text-xs text-signal-600">
                {loadError}
              </p>
            )}

            <RoleGuard roles={["SUPER_ADMIN", "ADMIN", "AGENT"]}>
              {drawingLayer && (
                <div className="mb-4 rounded-lg border-l-2 border-copper-600 bg-copper-100 px-3 py-2.5 text-xs text-ink-800">
                  Cliquez sur la carte pour dessiner {GEOMETRY_LABELS[drawingLayer.geometry_type]} sur{" "}
                  <strong>{drawingLayer.name}</strong>.
                  <button
                    onClick={() => setDrawingLayer(null)}
                    className="mt-2 block font-medium text-copper-600 hover:underline"
                  >
                    Annuler le dessin
                  </button>
                </div>
              )}
            </RoleGuard>

            <ul className="space-y-1.5">
              {layers.map((layer) => (
                <li
                  key={layer.id}
                  className="flex items-center gap-3 rounded-lg border border-ink-300/30 px-3 py-2.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={layer.visible}
                    onChange={() => toggleLayer(layer.id)}
                    className="accent-copper-600"
                  />
                  <span className="flex-1 text-ink-700">{layer.name}</span>
                  <span className="font-data text-xs text-ink-400">
                    {layer.data?.features.length ?? 0}
                  </span>

                  <button
                    onClick={() => setAttributeTableLayerId((prev) => (prev === layer.id ? null : layer.id))}
                    title={`Table attributaire de "${layer.name}"`}
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-colors ${attributeTableLayerId === layer.id
                      ? "bg-ink-900 text-white"
                      : "text-ink-500 hover:bg-ink-900/5"
                      }`}
                  >
                    <Table2 size={14} />
                  </button>
                  <button
                    onClick={() => setSymbologyLayerId(layer.id)}
                    title={`Symbologie de "${layer.name}"`}
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-ink-500 hover:bg-ink-900/5"
                  >
                    <Palette size={14} />
                  </button>

                  <RoleGuard roles={["SUPER_ADMIN", "ADMIN", "AGENT"]}>
                    <button
                      onClick={() => toggleDrawingLayer(layer)}
                      title={`Ajouter un objet sur "${layer.name}"`}
                      className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-colors ${drawingLayer?.id === layer.id
                        ? "bg-copper-600 text-white"
                        : "text-copper-600 hover:bg-copper-100"
                        }`}
                    >
                      <Plus size={14} />
                    </button>
                  </RoleGuard>
                </li>
              ))}
            </ul>

            <div className="rounded-lg mt-auto flex items-center justify-between border-t border-ink-300/30 pt-4 text-xs text-ink-500">
              <span>Objets affichés</span>
              <span className="font-data font-semibold text-ink-800">{totalVisibleFeatures}</span>
            </div>
          </aside>
        )}

        {/* --- Carte --- */}
        <div className="relative min-w-0 flex-1">
          {/* Repli/dépli du panneau des couches */}
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              title="Afficher les couches"
              className="absolute -left-0.5 top-2 z-20 -translate-y-1/2 rounded-r-lg border border-l-0 border-ink-300/40 bg-white p-2 shadow-md transition-all duration-300 hover:bg-paper-100"
            >
              <PanelLeftOpen size={18} />
            </button>
          )}
          {sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(false)}
              title="Masquer les couches"
              className="absolute -left-0.5 top-2 z-20 hidden -translate-y-1/2 rounded-r-lg border border-l-0 border-ink-300/40 bg-white p-2 shadow-md transition-all duration-300 hover:bg-paper-100 lg:block"
            >
              <PanelLeftClose size={18} />
            </button>
          )}

          {/* Recherche d'objets, repliée en bouton bleu par défaut */}
          <div className="absolute left-1/2 top-3 z-[5] w-[min(90vw,18rem)] -translate-x-1/2">
            {!searchOpen ? (
              <button
                onClick={() => setSearchOpen(true)}
                title="Rechercher"
                className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-ink-900 text-white shadow-sm transition-colors hover:bg-copper-600"
              >
                <Search size={14} />
              </button>
            ) : (
              <div className="w-full">
                <div className="flex overflow-hidden rounded-lg border border-ink-300/40 bg-white shadow-sm">
                  <span className="flex items-center pl-3 text-ink-400">
                    <Search size={15} />
                  </span>
                  <input
                    autoFocus
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setShowResults(true);
                    }}
                    onFocus={() => setShowResults(true)}
                    placeholder="Rechercher un objet/une entité"
                    className="min-w-0 flex-1 px-2.5 py-2.5 text-sm text-ink-900 outline-none placeholder:text-ink-400"
                  />
                  <button
                    onClick={() => {
                      setSearch("");
                      setShowResults(false);
                      setSearchOpen(false);
                    }}
                    className="flex items-center px-3 text-ink-400 hover:text-ink-700"
                    aria-label="Fermer la recherche"
                  >
                    <X size={14} />
                  </button>
                </div>

                {showResults && search.trim().length >= 2 && (
                  <div className="mt-1 max-h-72 overflow-y-auto rounded-lg border border-ink-300/40 bg-white shadow-lg">
                    {searchResults.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-ink-400">Aucun résultat pour "{search}".</p>
                    ) : (
                      searchResults.map((result, i) => (
                        <button
                          key={`${result.layerId}-${result.feature.id}-${i}`}
                          onClick={() => handleSelectResult(result)}
                          className="rounded-lg flex w-full items-center gap-2 border-b border-ink-300/20 px-3 py-2.5 text-left text-sm last:border-0 hover:bg-paper-100"
                        >
                          <MapPin size={13} className="flex-shrink-0 text-copper-600" />
                          <span className="flex-1 text-ink-800">{result.label}</span>
                          <span className="font-data text-[11px] text-ink-400">{result.layerName}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <MapCanvas
            ref={mapRef}
            layers={mapLayers}
            layerLabel={layerLabel}
            drawingGeometryType={drawingLayer?.geometry_type ?? null}
            onFeatureDrawn={(geometry) => setPendingGeometry(geometry)}
            drawTargets={drawTargets}
            activeDrawLayerId={drawingLayer?.id ?? null}
            onToggleDrawTarget={handleToggleDrawTarget}
            onEditFeature={handleEditFeature}
            onDeleteFeature={handleDeleteFeature}
            searchCenter={pickedPoint}
            searchRadiusM={searchRadius}
            pickMode={pickMode}
            onPointPicked={(lng, lat) => {
              setPickedPoint({ lng, lat });
              setPickMode(false);
            }}
            highlightFeatures={highlightResults}
            onShowHistory={(feature) => setHistoryFeatureId(feature.id as number)}
            onOpenCloudSources={() => setCloudPanelOpen(true)}
          />

          {highlightResults && highlightResults.features.length > 0 && !spatialSearchOpen && (
            <div className="absolute left-1/2 top-16 z-[6] flex w-[min(90vw,22rem)] -translate-x-1/2 items-center gap-3 rounded-lg border border-ink-300/40 bg-white px-3 py-2 text-xs shadow-sm">
              <span className="font-data font-medium text-ink-800">
                {highlightResults.features.length} résultat{highlightResults.features.length > 1 ? "s" : ""}
              </span>
              <button
                onClick={() => setSpatialSearchOpen(true)}
                className="font-medium text-copper-600 hover:underline"
              >
                Voir
              </button>
              <button
                onClick={() => {
                  setHighlightResults(null);
                  setPickedPoint(null);
                }}
                className="text-ink-400 hover:text-ink-700"
                aria-label="Effacer la recherche"
              >
                <X size={13} />
              </button>
            </div>
          )}

          {/* --- Table attributaire (tiroir en bas de la carte) --- */}
          {attributeTableLayer && (
            <AttributeTable
              layerName={attributeTableLayer.name}
              features={attributeTableLayer.data?.features ?? []}
              onClose={() => setAttributeTableLayerId(null)}
              onLocate={handleLocateFeature}
              onEdit={(feature) => handleEditFeatureFromTable(attributeTableLayer.id, feature)}
              onDelete={handleDeleteFeatureFromTable}
            />
          )}
        </div>
      </div>

      {drawingLayer && pendingGeometry && (
        <FeaturePropertiesModal
          layerName={drawingLayer.name}
          onSubmit={handleCreateFeature}
          onCancel={handleCancelFeature}
        />
      )}
      {editingFeature && (
        <FeaturePropertiesModal
          layerName={editingFeature.layerName}
          initialProperties={editingFeature.properties}
          onSubmit={handleUpdateFeature}
          onCancel={() => setEditingFeature(null)}
        />
      )}
      {statsOpen && <StatsPanel layers={layers} onClose={() => setStatsOpen(false)} />}
      {spatialSearchOpen && (
        <SpatialSearchPanel
          layers={layers}
          pickedPoint={pickedPoint}
          radius={searchRadius}
          onRadiusChange={setSearchRadius}
          onStartPicking={() => {
            setPickMode(true);
            setSpatialSearchOpen(false);
          }}
          onResults={setHighlightResults}
          onLocate={handleLocateFeature}
          onClose={() => setSpatialSearchOpen(false)}
          onClearResults={() => {
            setHighlightResults(null);
            setPickedPoint(null);
          }}
        />
      )}
      {cartographyOpen && (
        <CartographyModal
          layers={layers}
          labelsVisible={labelsVisible}
          onToggleLabels={(layerId) => setLabelsVisible((prev) => ({ ...prev, [layerId]: !prev[layerId] }))}
          onOpenSymbology={(layerId) => {
            setSymbologyLayerId(layerId);
            setCartographyOpen(false);
          }}
          hasCustomSymbology={(layerId) => Boolean(layerSymbologies[layerId])}
          onOpenPrint={(includedLayerIds) => {
            setCartographyOpen(false);
            mapRef.current?.openPrintModal(includedLayerIds);
          }}
          onGenerateAtlas={(layerId, titleField, includedLayerIds, onProgress) =>
            mapRef.current?.generateAtlas(layerId, titleField, includedLayerIds, onProgress) ?? Promise.resolve()
          }
          onClose={() => setCartographyOpen(false)}
        />
      )}

      {symbologyLayerId !== null && (() => {
        const target = layers.find((l) => l.id === symbologyLayerId);
        if (!target) return null;
        return (
          <SymbologyPanel
            layerName={target.name}
            features={target.data?.features ?? []}
            currentConfig={layerSymbologies[target.id] ?? null}
            onApply={(config) => handleApplySymbology(target.id, config)}
            onClose={() => setSymbologyLayerId(null)}
          />
        );
      })()}

      {historyFeatureId !== null && (
        <HistoryModal featureId={historyFeatureId} onClose={() => setHistoryFeatureId(null)} />
      )}

      {cloudPanelOpen && (
        <CloudSourcesPanel
          onClose={() => setCloudPanelOpen(false)}
          mapRef={mapRef}
          onLayerImported={() => loadAll()}
        />
      )}
    </Layout>
  );
}
