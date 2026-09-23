import { useMemo, useState } from "react";
import { X, Palette, Type, Printer, MapPinned, BookOpen, Check } from "lucide-react";
import { Cartouche, SectionLabel } from "./Panel";
import type { GeoJSONFeature } from "../types";

const TITLE_FIELD_CANDIDATES = ["nom", "name", "NOM", "libelle", "label"];

interface LayerForCartography {
  id: number;
  name: string;
  color: string;
  geometry_type: string;
  visible: boolean;
  data: { features: GeoJSONFeature[] } | null;
}

interface CartographyModalProps {
  layers: LayerForCartography[];
  labelsVisible: Record<number, boolean>;
  onToggleLabels: (layerId: number) => void;
  onOpenSymbology: (layerId: number) => void;
  hasCustomSymbology: (layerId: number) => boolean;
  onOpenPrint: (includedLayerIds: number[]) => void;
  onGenerateAtlas: (
    layerId: number,
    titleField: string,
    includedLayerIds: number[],
    onProgress: (current: number, total: number) => void
  ) => Promise<void>;
  onClose: () => void;
}

export function CartographyModal({
  layers,
  labelsVisible,
  onToggleLabels,
  onOpenSymbology,
  hasCustomSymbology,
  onOpenPrint,
  onGenerateAtlas,
  onClose,
}: CartographyModalProps) {
  // Par défaut : les couches actuellement visibles sur la carte sont pré-cochées.
  const [includedIds, setIncludedIds] = useState<Set<number>>(
    () => new Set(layers.filter((l) => l.visible).map((l) => l.id))
  );

  function toggleIncluded(layerId: number) {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return next;
    });
  }

  const includedLayers = layers.filter((l) => includedIds.has(l.id));

  const polygonLayers = includedLayers.filter((l) => l.geometry_type === "Polygon" || l.geometry_type === "MultiPolygon");
  const [atlasLayerId, setAtlasLayerId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);

  const atlasLayer = layers.find((l) => l.id === atlasLayerId) ?? null;

  const availableFields = useMemo(() => {
    if (!atlasLayer?.data) return [];
    const keys = new Set<string>();
    atlasLayer.data.features.forEach((f) => Object.keys(f.properties || {}).forEach((k) => keys.add(k)));
    return Array.from(keys).filter((k) => !["layer_id", "created_at", "updated_at"].includes(k));
  }, [atlasLayer]);

  const [titleField, setTitleField] = useState<string>("");

  function handleAtlasLayerChange(layerId: number) {
    setAtlasLayerId(layerId);
    const layer = layers.find((l) => l.id === layerId);
    const fields = layer?.data
      ? Array.from(new Set(layer.data.features.flatMap((f) => Object.keys(f.properties || {}))))
      : [];
    setTitleField(TITLE_FIELD_CANDIDATES.find((c) => fields.includes(c)) ?? fields[0] ?? "");
  }

  async function handleGenerateAtlas() {
    if (!atlasLayerId || !titleField) return;
    setIsGenerating(true);
    setProgress({ current: 0, total: atlasLayer?.data?.features.length ?? 0 });
    try {
      await onGenerateAtlas(atlasLayerId, titleField, Array.from(includedIds), (current, total) =>
        setProgress({ current, total })
      );
    } finally {
      setIsGenerating(false);
      setProgress(null);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4">
      <Cartouche className="max-h-[85vh] w-full max-w-lg overflow-y-auto p-6">
        <div className="mb-4 flex items-center justify-between">
          <SectionLabel icon={MapPinned}>Cartographie</SectionLabel>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={18} />
          </button>
        </div>

        <p className="mb-2 font-data text-[10px] font-medium uppercase tracking-widest text-ink-400">
          Couches à inclure
        </p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {layers.map((layer) => {
            const isIncluded = includedIds.has(layer.id);
            return (
              <button
                key={layer.id}
                onClick={() => toggleIncluded(layer.id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${isIncluded
                  ? "border-copper-600 bg-copper-100 text-copper-700"
                  : "border-ink-300/50 text-ink-500 hover:bg-paper-100"
                  }`}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: layer.color }} />
                {layer.name}
                {isIncluded && <Check size={11} />}
              </button>
            );
          })}
        </div>
        <p className="mb-4 text-[11px] text-ink-400">
          {includedLayers.length} couche{includedLayers.length > 1 ? "s" : ""} incluse
          {includedLayers.length > 1 ? "s" : ""} dans l'impression et l'atlas.
        </p>

        {includedLayers.length > 0 && (
          <>
            <p className="mb-2 font-data text-[10px] font-medium uppercase tracking-widest text-ink-400">Style</p>
            <ul className="mb-5 space-y-1.5">
              {includedLayers.map((layer) => (
                <li
                  key={layer.id}
                  className="rounded-lg flex items-center gap-3 border border-ink-300/30 px-3 py-2 text-sm"
                >
                  <span className="flex-1 truncate text-ink-700">{layer.name}</span>
                  <button
                    onClick={() => onToggleLabels(layer.id)}
                    title={labelsVisible[layer.id] ? "Masquer les étiquettes" : "Afficher les étiquettes"}
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-colors ${labelsVisible[layer.id] ? "bg-copper-600 text-white" : "text-ink-500 hover:bg-ink-900/5"
                      }`}
                  >
                    <Type size={13} />
                  </button>
                  <button
                    onClick={() => onOpenSymbology(layer.id)}
                    title={`Symbologie de "${layer.name}"`}
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded transition-colors ${hasCustomSymbology(layer.id) ? "bg-copper-600 text-white" : "text-ink-500 hover:bg-ink-900/5"
                      }`}
                  >
                    <Palette size={13} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mb-5 border-t border-ink-300/30 pt-4">
          <p className="mb-2 font-data text-[10px] font-medium uppercase tracking-widest text-ink-400">
            Mise en page
          </p>
          <button
            onClick={() => onOpenPrint(Array.from(includedIds))}
            disabled={includedLayers.length === 0}
            className="rounded-lg flex w-full items-center justify-center gap-2 border border-ink-300 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-paper-100 disabled:opacity-50"
          >
            <Printer size={15} />
            Imprimer la vue actuelle
          </button>
        </div>

        <div className="border-t border-ink-300/30 pt-4">
          <p className="mb-2 font-data text-[10px] font-medium uppercase tracking-widest text-ink-400">
            Atlas — une page par entité
          </p>

          {polygonLayers.length === 0 ? (
            <p className="text-xs text-ink-400">
              Coche une couche de type Polygon ci-dessus pour pouvoir générer un atlas.
            </p>
          ) : (
            <>
              <label className="mb-1 block text-xs font-medium text-ink-700">Couche de référence</label>
              <select
                value={atlasLayerId ?? ""}
                onChange={(e) => handleAtlasLayerChange(Number(e.target.value))}
                className="rounded-lg mb-3 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
              >
                <option value="">— choisir —</option>
                {polygonLayers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>

              {atlasLayerId && (
                <>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Champ utilisé comme titre de page</label>
                  <select
                    value={titleField}
                    onChange={(e) => setTitleField(e.target.value)}
                    className="rounded-lg mb-4 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                  >
                    {availableFields.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleGenerateAtlas}
                    disabled={isGenerating || !titleField}
                    className="rounded-lg flex w-full items-center justify-center gap-2 bg-ink-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-60"
                  >
                    <BookOpen size={15} />
                    {isGenerating
                      ? progress
                        ? `Génération de la page ${progress.current}/${progress.total}...`
                        : "Génération..."
                      : "Générer et imprimer l'atlas"}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </Cartouche>
    </div>
  );
}
