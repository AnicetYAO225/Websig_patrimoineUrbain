import { useEffect, useState } from "react";
import { X, Scissors } from "lucide-react";
import { Cartouche, SectionLabel } from "./Panel";
import * as featuresApi from "../api/features";
import * as exportsApi from "../api/exports";
import type { ExportFormat } from "../api/exports";
import type { GeoJSONFeature, Layer } from "../types";

const NAME_CANDIDATES = ["nom", "name", "NOM", "libelle", "label"];

function featureLabel(feature: GeoJSONFeature): string {
    for (const key of NAME_CANDIDATES) {
        const v = feature.properties?.[key];
        if (typeof v === "string" && v.trim()) return v;
    }
    return `Objet #${feature.id}`;
}

interface ExtractionModalProps {
    sourceLayer: Layer;
    layers: Layer[];
    onClose: () => void;
}

export function ExtractionModal({ sourceLayer, layers, onClose }: ExtractionModalProps) {
    const polygonLayers = layers.filter(
        (l) => l.id !== sourceLayer.id && (l.geometry_type === "Polygon" || l.geometry_type === "MultiPolygon")
    );

    const [refLayerId, setRefLayerId] = useState<number | null>(polygonLayers[0]?.id ?? null);
    const [refFeatures, setRefFeatures] = useState<GeoJSONFeature[]>([]);
    const [refFeatureId, setRefFeatureId] = useState<string>("");
    const [predicate, setPredicate] = useState<"within" | "intersects" | "contains">("within");
    const [format, setFormat] = useState<ExportFormat>("geojson");
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!refLayerId) return;
        setRefFeatureId("");
        featuresApi.listFeatures(refLayerId).then((fc) => setRefFeatures(fc.features));
    }, [refLayerId]);

    async function handleExtract() {
        if (!refLayerId) return;
        setIsRunning(true);
        setError(null);
        try {
            await exportsApi.extractFeatures(sourceLayer.id, {
                withinLayerId: refLayerId,
                withinFeatureId: refFeatureId ? Number(refFeatureId) : undefined,
                predicate,
                format,
            });
            onClose();
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Erreur lors de l'extraction.");
        } finally {
            setIsRunning(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4">
            <Cartouche className="max-h-[85vh] w-full max-w-md overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                    <SectionLabel icon={Scissors}>Extraction · {sourceLayer.name}</SectionLabel>
                    <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
                        <X size={18} />
                    </button>
                </div>

                {polygonLayers.length === 0 ? (
                    <p className="text-sm text-ink-500">Aucune couche de type Polygon disponible comme zone de référence.</p>
                ) : (
                    <>
                        <label className="mb-1 block text-xs font-medium text-ink-700">Zone de référence</label>
                        <select
                            value={refLayerId ?? ""}
                            onChange={(e) => setRefLayerId(Number(e.target.value))}
                            className="rounded-lg mb-3 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                        >
                            {polygonLayers.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </select>

                        <label className="mb-1 block text-xs font-medium text-ink-700">Entité précise (optionnel)</label>
                        <select
                            value={refFeatureId}
                            onChange={(e) => setRefFeatureId(e.target.value)}
                            className="rounded-lg mb-3 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                        >
                            <option value="">Toute la couche (n'importe laquelle des entités)</option>
                            {refFeatures.map((f) => (
                                <option key={f.id} value={f.id}>
                                    {featureLabel(f)}
                                </option>
                            ))}
                        </select>

                        <label className="mb-1 block text-xs font-medium text-ink-700">Relation spatiale</label>
                        <select
                            value={predicate}
                            onChange={(e) => setPredicate(e.target.value as any)}
                            className="rounded-lg mb-3 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                        >
                            <option value="within">Est à l'intérieur de</option>
                            <option value="intersects">Intersecte</option>
                            <option value="contains">Contient</option>
                        </select>

                        <label className="mb-1 block text-xs font-medium text-ink-700">Format d'export</label>
                        <select
                            value={format}
                            onChange={(e) => setFormat(e.target.value as ExportFormat)}
                            className="rounded-lg mb-4 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                        >
                            <option value="geojson">GeoJSON</option>
                            <option value="csv">CSV</option>
                            <option value="xlsx">Excel (.xlsx)</option>
                            <option value="shapefile">Shapefile (.zip)</option>
                        </select>

                        {error && (
                            <p className="mb-3 border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-xs text-signal-600">
                                {error}
                            </p>
                        )}

                        <button
                            onClick={handleExtract}
                            disabled={isRunning}
                            className="rounded-lg flex w-full items-center justify-center gap-2 bg-ink-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-60"
                        >
                            {isRunning ? "Extraction en cours..." : "Extraire et télécharger"}
                        </button>
                    </>
                )}
            </Cartouche>
        </div>
    );
}
