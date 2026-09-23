import { useEffect, useState, type FormEvent } from "react";
import { Layers as LayersIcon, Plus, Trash2, UploadCloud, GitMerge, Scissors, Download, ChevronDown } from "lucide-react";
import { Layout } from "../components/Layout";
import { ImportIntoLayerModal } from "../components/ImportIntoLayerModal";
import { Cartouche, SectionLabel, StatusDot, TABLE_HEAD_CLASS } from "../components/Panel";
import { RoleGuard } from "../components/RoleGuard";
import { ImportGeoJSONPanel } from "../components/ImportGeoJSONPanel";
import { JoinModal } from "../components/JoinModal";
import { ExtractionModal } from "../components/ExtractionModal";
import * as layersApi from "../api/layers";
import * as exportsApi from "../api/exports";
import { getErrorMessage } from "../lib/errors";
import type { GeometryType, Layer } from "../types";

type ActivePanel = "none" | "import" | "empty";

export function LayersPage() {
  const [layers, setLayers] = useState<Layer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activePanel, setActivePanel] = useState<ActivePanel>("none");
  const [importTargetLayer, setImportTargetLayer] = useState<Layer | null>(null);
  const [joinTargetLayer, setJoinTargetLayer] = useState<Layer | null>(null);
  const [extractionSourceLayer, setExtractionSourceLayer] = useState<Layer | null>(null);
  const [exportMenuLayerId, setExportMenuLayerId] = useState<number | null>(null);

  function refresh() {
    setIsLoading(true);
    layersApi.listLayers().then((data) => {
      setLayers(data);
      setIsLoading(false);
    });
  }

  useEffect(refresh, []);

  async function handleDelete(id: number) {
    if (!confirm("Supprimer cette couche et tous ses objets géographiques ?")) return;
    await layersApi.deleteLayer(id);
    refresh();
  }

  function toggle(panel: ActivePanel) {
    setActivePanel((prev) => (prev === panel ? "none" : panel));
  }

  return (
    <Layout>
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div>
            <p className="font-data text-xs uppercase tracking-widest text-copper-600">Administration</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">Couches SIG</h1>
          </div>
          <RoleGuard roles={["ADMIN", "SUPER_ADMIN"]}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                onClick={() => toggle("empty")}
                className="rounded-lg flex items-center justify-center gap-2 border border-ink-300 px-4 py-2 text-sm text-ink-700 transition-colors hover:bg-paper-100"
              >
                <Plus size={15} />
                Couche vide
              </button>
              <button
                onClick={() => toggle("import")}
                className="rounded-lg flex items-center justify-center gap-2 bg-ink-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-copper-600"
              >
                <UploadCloud size={15} />
                Importer des données
              </button>
            </div>
          </RoleGuard>
        </div>

        {activePanel === "import" && (
          <RoleGuard roles={["ADMIN", "SUPER_ADMIN"]}>
            <ImportGeoJSONPanel
              onImported={() => {
                refresh();
              }}
            />
          </RoleGuard>
        )}

        {activePanel === "empty" && (
          <RoleGuard roles={["ADMIN", "SUPER_ADMIN"]}>
            <LayerForm
              onCreated={() => {
                setActivePanel("none");
                refresh();
              }}
            />
          </RoleGuard>
        )}

        <Cartouche className="mt-6 p-5">
          <SectionLabel icon={LayersIcon}>{layers.length} couche{layers.length > 1 ? "s" : ""}</SectionLabel>
          <div className="rounded-lg overflow-x-auto border border-ink-300/30">
            <table className="w-full text-left text-sm">
              <thead className={TABLE_HEAD_CLASS}>
                <tr>
                  <th className="px-4 py-2.5 font-medium">Nom</th>
                  <th className="px-4 py-2.5 font-medium">Slug</th>
                  <th className="px-4 py-2.5 font-medium">Type</th>
                  <th className="px-4 py-2.5 font-medium">Objets</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 font-medium">Statut</th>
                  <RoleGuard roles={["ADMIN", "SUPER_ADMIN"]}>
                    <th className="w-[440px] px-4 py-2.5 font-medium">Actions</th>
                  </RoleGuard>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-300/20">
                {isLoading && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-ink-400">
                      Chargement...
                    </td>
                  </tr>
                )}
                {layers.map((layer) => (
                  <tr key={layer.id}>
                    <td className="px-4 py-2.5 font-medium text-ink-800">{layer.name}</td>
                    <td className="px-4 py-2.5 max-w-[150px]">
                      <span className="font-data block truncate text-ink-500" title={layer.slug}>
                        {layer.slug}
                      </span>
                    </td>
                    <td className="font-data px-4 py-2.5 text-ink-500">{layer.geometry_type}</td>
                    <td className="font-data px-4 py-2.5 text-ink-500">{layer.feature_count}</td>
                    <td className="px-4 py-2.5 text-xs text-ink-500">
                      {layer.source ? (
                        <span title={layer.license ?? undefined}>
                          {layer.source}
                          {layer.source_date ? ` · ${layer.source_date}` : ""}
                        </span>
                      ) : (
                        <span className="text-ink-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusDot active={layer.is_visible} activeLabel="Visible" inactiveLabel="Masquée" />
                    </td>
                    <RoleGuard roles={["ADMIN", "SUPER_ADMIN"]}>
                      <td className="px-4 py-2.5">
                        <div className="flex min-w-max items-center gap-3">
                          <button
                            onClick={() => setJoinTargetLayer(layer)}
                            className="flex items-center gap-1 text-xs text-ink-600 hover:underline"
                          >
                            <GitMerge size={13} />
                            Jointure
                          </button>

                          <button
                            onClick={() => setExtractionSourceLayer(layer)}
                            className="flex items-center gap-1 text-xs text-ink-600 hover:underline"
                          >
                            <Scissors size={13} />
                            Extraire
                          </button>

                          <button
                            onClick={() => setImportTargetLayer(layer)}
                            className="flex items-center gap-1 text-xs text-copper-600 hover:underline"
                          >
                            <UploadCloud size={13} />
                            Importer
                          </button>

                          <div className="relative">
                            <button
                              onClick={() => setExportMenuLayerId(exportMenuLayerId === layer.id ? null : layer.id)}
                              className="flex items-center gap-1 text-xs text-ink-600 hover:underline"
                            >
                              <Download size={13} />
                              Exporter
                              <ChevronDown size={11} />
                            </button>
                            {exportMenuLayerId === layer.id && (
                              <div className="absolute right-0 z-10 mt-1 w-40 overflow-hidden rounded-lg border border-ink-300/40 bg-white py-1 shadow-lg">
                                {(["geojson", "csv", "xlsx", "shapefile"] as const).map((fmt) => (
                                  <button
                                    key={fmt}
                                    onClick={() => {
                                      exportsApi.exportLayer(layer.id, fmt);
                                      setExportMenuLayerId(null);
                                    }}
                                    className="block w-full px-3 py-2 text-left text-xs text-ink-700 hover:bg-paper-100"
                                  >
                                    {fmt === "geojson"
                                      ? "GeoJSON"
                                      : fmt === "csv"
                                        ? "CSV"
                                        : fmt === "xlsx"
                                          ? "Excel (.xlsx)"
                                          : "Shapefile (.zip)"}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          <button
                            onClick={() => handleDelete(layer.id)}
                            className="flex items-center gap-1 text-xs text-signal-600 hover:underline"
                          >
                            <Trash2 size={13} />
                            Supprimer
                          </button>
                        </div>
                      </td>
                    </RoleGuard>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Cartouche>
      </div>

      {importTargetLayer && (
        <ImportIntoLayerModal
          layerId={importTargetLayer.id}
          layerName={importTargetLayer.name}
          onClose={() => setImportTargetLayer(null)}
          onImported={refresh}
        />
      )}

      {joinTargetLayer && (
        <JoinModal
          targetLayer={joinTargetLayer}
          layers={layers}
          onClose={() => setJoinTargetLayer(null)}
          onJoined={refresh}
        />
      )}

      {extractionSourceLayer && (
        <ExtractionModal
          sourceLayer={extractionSourceLayer}
          layers={layers}
          onClose={() => setExtractionSourceLayer(null)}
        />
      )}
    </Layout>
  );
}

function LayerForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [geometryType, setGeometryType] = useState<GeometryType>("Point");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await layersApi.createLayer({ name, slug, description, geometry_type: geometryType });
      onCreated();
    } catch (err: any) {
      setError(getErrorMessage(err, "Erreur lors de la création de la couche."));
    }
  }

  return (
    <Cartouche className="mt-4 p-5">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700">Nom</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
            placeholder="Ex: Bornes incendie"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700">Slug (identifiant technique)</label>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
            className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
            placeholder="Ex: fire_hydrants"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700">Type de géométrie</label>
          <select
            value={geometryType}
            onChange={(e) => setGeometryType(e.target.value as GeometryType)}
            className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
          >
            <option value="Point">Point</option>
            <option value="LineString">LineString</option>
            <option value="Polygon">Polygon</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-700">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
          />
        </div>

        {error && (
          <p className="col-span-full border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-sm text-signal-600">
            {error}
          </p>
        )}

        <div className="col-span-full">
          <button
            type="submit"
            className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-copper-600"
          >
            Créer la couche
          </button>
        </div>
      </form>
    </Cartouche>
  );
}
