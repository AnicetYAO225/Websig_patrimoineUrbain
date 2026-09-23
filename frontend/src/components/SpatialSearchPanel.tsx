import { useState } from "react";
import { X, Crosshair, MapPin, Radar } from "lucide-react";
import { Cartouche, SectionLabel } from "./Panel";
import * as featuresApi from "../api/features";
import type { GeoJSONFeature, GeoJSONFeatureCollection, Layer } from "../types";

interface SpatialSearchPanelProps {
    layers: Layer[];
    pickedPoint: { lng: number; lat: number } | null;
    radius: number;
    onRadiusChange: (radius: number) => void;
    onStartPicking: () => void;
    onResults: (collection: GeoJSONFeatureCollection) => void;
    onLocate: (feature: GeoJSONFeature) => void;
    onClose: () => void;
    onClearResults: () => void;
}

export function SpatialSearchPanel({
    layers,
    pickedPoint,
    radius,
    onRadiusChange,
    onStartPicking,
    onResults,
    onLocate,
    onClose,
    onClearResults,
}: SpatialSearchPanelProps) {
    const [mode, setMode] = useState<"radius" | "intersects">("radius");
    const [sourceLayerId, setSourceLayerId] = useState<number | null>(layers[0]?.id ?? null);
    const [intersectsLayerId, setIntersectsLayerId] = useState<number | null>(null);
    const [results, setResults] = useState<GeoJSONFeature[] | null>(null);
    const [isSearching, setIsSearching] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleSearch() {
        if (!sourceLayerId) return;
        setError(null);

        if (mode === "radius" && !pickedPoint) {
            setError("Clique d'abord un point sur la carte pour définir le centre du rayon.");
            return;
        }
        if (mode === "intersects" && !intersectsLayerId) {
            setError("Choisis une couche à croiser.");
            return;
        }

        setIsSearching(true);
        try {
            const collection = await featuresApi.searchFeaturesSpatial(sourceLayerId, {
                lng: mode === "radius" ? pickedPoint?.lng : undefined,
                lat: mode === "radius" ? pickedPoint?.lat : undefined,
                radiusM: mode === "radius" ? radius : undefined,
                intersectsLayerId: mode === "intersects" ? intersectsLayerId ?? undefined : undefined,
            });
            setResults(collection.features);
            onResults(collection);
        } catch (err) {
            console.error(err);
            setError("La recherche a échoué. Vérifie que le backend est démarré.");
        } finally {
            setIsSearching(false);
        }
    }

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4">
            <Cartouche className="max-h-[85vh] w-full max-w-md overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                    <SectionLabel icon={Radar}>Recherche spatiale</SectionLabel>
                    <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
                        <X size={18} />
                    </button>
                </div>

                <div className="mb-4 flex gap-2">
                    <button
                        onClick={() => setMode("radius")}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${mode === "radius" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                            }`}
                    >
                        Par rayon
                    </button>
                    <button
                        onClick={() => setMode("intersects")}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${mode === "intersects" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                            }`}
                    >
                        Intersection
                    </button>
                </div>

                <label className="mb-1 block text-xs font-medium text-ink-700">Couche à interroger</label>
                <select
                    value={sourceLayerId ?? ""}
                    onChange={(e) => setSourceLayerId(Number(e.target.value))}
                    className="rounded-lg mb-4 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                >
                    {layers.map((l) => (
                        <option key={l.id} value={l.id}>
                            {l.name}
                        </option>
                    ))}
                </select>

                {mode === "radius" ? (
                    <>
                        <label className="mb-1 block text-xs font-medium text-ink-700">Centre du rayon</label>
                        <button
                            onClick={onStartPicking}
                            className="rounded-lg mb-3 flex w-full items-center justify-center gap-2 border border-dashed border-copper-600 px-3 py-2 text-xs font-medium text-copper-600 hover:bg-copper-100"
                        >
                            <Crosshair size={14} />
                            {pickedPoint
                                ? `Point choisi : ${pickedPoint.lat.toFixed(4)}, ${pickedPoint.lng.toFixed(4)}`
                                : "Cliquer sur la carte pour choisir le centre"}
                        </button>

                        <label className="mb-1 block text-xs font-medium text-ink-700">Rayon (mètres)</label>
                        <input
                            type="number"
                            value={radius}
                            onChange={(e) => onRadiusChange(Number(e.target.value))}
                            className="rounded-lg mb-4 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                        />
                    </>
                ) : (
                    <>
                        <label className="mb-1 block text-xs font-medium text-ink-700">Couche à croiser</label>
                        <select
                            value={intersectsLayerId ?? ""}
                            onChange={(e) => setIntersectsLayerId(Number(e.target.value))}
                            className="rounded-lg mb-4 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                        >
                            <option value="">— choisir —</option>
                            {layers
                                .filter((l) => l.id !== sourceLayerId)
                                .map((l) => (
                                    <option key={l.id} value={l.id}>
                                        {l.name}
                                    </option>
                                ))}
                        </select>
                    </>
                )}

                {error && (
                    <p className="mb-3 border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-xs text-signal-600">{error}</p>
                )}

                <button
                    onClick={handleSearch}
                    disabled={isSearching}
                    className="rounded-lg mb-4 w-full bg-ink-900 py-2 text-sm font-medium text-white hover:bg-copper-600 disabled:opacity-60"
                >
                    {isSearching ? "Recherche..." : "Lancer la recherche"}
                </button>


                {results && (
                    <div className="rounded-lg border border-ink-300/30">
                        <div className="flex items-center justify-between border-b border-ink-300/30 bg-paper-100 px-3 py-2">
                            <p className="font-data text-[11px] uppercase tracking-wide text-ink-500">
                                {results.length} résultat{results.length > 1 ? "s" : ""}
                            </p>
                            <button
                                onClick={() => {
                                    setResults(null);
                                    onClearResults();
                                }}
                                className="text-[11px] font-medium text-signal-600 hover:underline"
                            >
                                Effacer
                            </button>
                        </div>
                        <div className="max-h-52 overflow-y-auto">
                            {results.map((f, i) => (
                                <button
                                    key={i}
                                    onClick={() => onLocate(f)}
                                    className="flex w-full items-center gap-2 border-b border-ink-300/20 px-3 py-2 text-left text-xs last:border-0 hover:bg-paper-100"
                                >
                                    <MapPin size={12} className="flex-shrink-0 text-copper-600" />
                                    <span className="flex-1 text-ink-800">
                                        {f.properties?.nom || f.properties?.name || `Objet #${f.id}`}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </Cartouche>
        </div>
    );
}