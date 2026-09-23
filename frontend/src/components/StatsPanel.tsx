import { useEffect, useMemo, useState } from "react";
import { X, BarChart3, Calculator } from "lucide-react";
import { area as turfArea, booleanPointInPolygon, centroid, distance as turfDistance } from "@turf/turf";
import { Cartouche, SectionLabel } from "./Panel";
import { getZoneSummary } from "../api/features";
import type { GeoJSONFeature } from "../types";

interface LayerForStats {
    id: number;
    name: string;
    color: string;
    geometry_type: string;
    data: { features: GeoJSONFeature[] } | null;
}

/**
 * Longueur (en km) de la portion d'une ligne qui tombe à l'intérieur d'un
 * polygone. Méthode approchée (estimation rapide, calculée dans le
 * navigateur) : on découpe la ligne en segments et on additionne ceux
 * dont le point milieu tombe dans le polygone. Le bouton "Calcul précis"
 * du panneau permet d'obtenir la valeur exacte, calculée côté serveur
 * via un vrai découpage géométrique PostGIS (ST_Intersection).
 */
function lineLengthInsidePolygon(line: GeoJSONFeature, polygon: GeoJSONFeature): number {
    const geom = line.geometry;
    const lines: [number, number][][] =
        geom.type === "LineString"
            ? [geom.coordinates as [number, number][]]
            : geom.type === "MultiLineString"
                ? (geom.coordinates as [number, number][][])
                : [];

    let totalKm = 0;
    for (const coords of lines) {
        for (let i = 0; i < coords.length - 1; i++) {
            const [lng1, lat1] = coords[i];
            const [lng2, lat2] = coords[i + 1];
            const midpoint: [number, number] = [(lng1 + lng2) / 2, (lat1 + lat2) / 2];
            try {
                if (booleanPointInPolygon(midpoint, polygon as any)) {
                    totalKm += turfDistance([lng1, lat1], [lng2, lat2], { units: "kilometers" });
                }
            } catch {
                // segment ponctuellement invalide : ignoré sans bloquer le calcul global
            }
        }
    }
    return totalKm;
}

function featureName(feature: GeoJSONFeature): string {
    const props = feature.properties || {};
    return props.nom || props.name || props.NOM || props.libelle || `Objet #${feature.id}`;
}

export function StatsPanel({ layers, onClose }: { layers: LayerForStats[]; onClose: () => void }) {
    const polygonLayers = layers.filter((l) => l.geometry_type === "Polygon" || l.geometry_type === "MultiPolygon");
    const [referenceLayerId, setReferenceLayerId] = useState<number | null>(polygonLayers[0]?.id ?? null);

    // Résultats exacts (calculés côté PostGIS via le bouton "Calcul précis"),
    // indexés par `${layerId}-${zoneId}`. Tant qu'une case n'y figure pas,
    // le tableau affiche l'estimation calculée côté client.
    const [precise, setPrecise] = useState<Record<string, number>>({});
    const [isComputingPrecise, setIsComputingPrecise] = useState(false);
    const [preciseError, setPreciseError] = useState<string | null>(null);

    // Changer de couche de référence invalide les résultats précis déjà
    // calculés (les zone_id ne correspondent plus aux mêmes objets).
    useEffect(() => {
        setPrecise({});
        setPreciseError(null);
    }, [referenceLayerId]);

    const referenceLayer = layers.find((l) => l.id === referenceLayerId) ?? null;
    const otherLayers = layers.filter((l) => l.id !== referenceLayerId);
    const pointLayers = otherLayers.filter((l) => l.geometry_type === "Point");
    const lineLayers = otherLayers.filter((l) => l.geometry_type === "LineString");

    const stats = useMemo(() => {
        if (!referenceLayer?.data) return [];

        return referenceLayer.data.features.map((zone) => {
            const surfaceKm2 = (() => {
                try {
                    return turfArea(zone as any) / 1_000_000;
                } catch {
                    return 0;
                }
            })();

            const pointCounts: Record<string, number> = {};
            const lineLengths: Record<string, number> = {};

            for (const layer of otherLayers) {
                if (!layer.data) continue;

                if (layer.geometry_type === "Point") {
                    let count = 0;
                    for (const feature of layer.data.features) {
                        const point =
                            feature.geometry.type === "Point"
                                ? (feature.geometry.coordinates as [number, number])
                                : (centroid(feature as any).geometry.coordinates as [number, number]);
                        try {
                            if (booleanPointInPolygon(point, zone as any)) count++;
                        } catch {
                            // géométrie invalide ponctuelle : ignorée
                        }
                    }
                    pointCounts[layer.name] = count;
                }

                if (layer.geometry_type === "LineString") {
                    let totalKm = 0;
                    for (const feature of layer.data.features) {
                        totalKm += lineLengthInsidePolygon(feature, zone);
                    }
                    lineLengths[layer.name] = totalKm;
                }
            }

            return {
                zoneId: zone.id as number,
                name: featureName(zone),
                surfaceKm2,
                pointCounts,
                lineLengths,
            };
        });
    }, [referenceLayer, otherLayers]);

    const totalSurface = stats.reduce((sum, s) => sum + s.surfaceKm2, 0);

    async function handleComputePrecise() {
        if (!referenceLayer) return;
        setIsComputingPrecise(true);
        setPreciseError(null);
        try {
            const newPrecise: Record<string, number> = {};
            for (const layer of [...pointLayers, ...lineLayers]) {
                const summary = await getZoneSummary(referenceLayer.id, layer.id);
                for (const r of summary.results) {
                    const value = layer.geometry_type === "Point" ? r.count ?? 0 : r.length_km ?? 0;
                    newPrecise[`${layer.id}-${r.zone_id}`] = value;
                }
            }
            setPrecise(newPrecise);
        } catch (err) {
            console.error(err);
            setPreciseError("Le calcul précis a échoué. Vérifie que le backend est démarré et à jour (route /api/stats/zone-summary).");
        } finally {
            setIsComputingPrecise(false);
        }
    }

    function renderCell(layerId: number, zoneId: number, approxValue: number, isCount: boolean) {
        const key = `${layerId}-${zoneId}`;
        const exact = precise[key];
        if (exact !== undefined) {
            return <span className="font-semibold text-pine-700">{isCount ? exact : exact.toFixed(2)}</span>;
        }
        return <span className="text-ink-600">{isCount ? approxValue : approxValue.toFixed(2)}</span>;
    }

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4">
            <Cartouche className="max-h-[80vh] w-full max-w-4xl overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                    <SectionLabel icon={BarChart3}>Statistiques spatiales</SectionLabel>
                    <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
                        <X size={18} />
                    </button>
                </div>

                {polygonLayers.length === 0 ? (
                    <p className="text-sm text-ink-500">Aucune couche de type Polygon trouvée pour servir de référence.</p>
                ) : (
                    <>
                        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-ink-700">
                                    Couche de référence (communes, quartiers...)
                                </label>
                                <select
                                    value={referenceLayerId ?? ""}
                                    onChange={(e) => setReferenceLayerId(Number(e.target.value))}
                                    className="rounded-lg w-full max-w-xs border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                                >
                                    {polygonLayers.map((l) => (
                                        <option key={l.id} value={l.id}>
                                            {l.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <button
                                onClick={handleComputePrecise}
                                disabled={isComputingPrecise || (pointLayers.length === 0 && lineLayers.length === 0)}
                                className="flex items-center gap-2 rounded-lg bg-ink-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-50"
                            >
                                <Calculator size={14} />
                                {isComputingPrecise ? "Calcul en cours..." : "Calcul précis (PostGIS)"}
                            </button>
                        </div>

                        {preciseError && (
                            <p className="mb-3 border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-xs text-signal-600">
                                {preciseError}
                            </p>
                        )}

                        {Object.keys(precise).length > 0 && (
                            <p className="mb-3 flex items-center gap-1.5 text-xs text-ink-500">
                                <span className="inline-block h-2 w-2 rounded-full bg-pine-700" />
                                Valeurs en <span className="font-semibold text-pine-700">vert</span> = calcul exact (serveur) ·
                                les autres restent une estimation
                            </p>
                        )}

                        <div className="mb-4 grid grid-cols-3 gap-3">
                            <StatCard label={referenceLayer?.name ?? "Zones"} value={stats.length} />
                            <StatCard label="Surface totale" value={`${totalSurface.toFixed(1)} km²`} />
                            <StatCard
                                label="Objets (autres couches)"
                                value={otherLayers.reduce((sum, l) => sum + (l.data?.features.length ?? 0), 0)}
                            />
                        </div>

                        <div className="rounded-lg overflow-x-auto border border-ink-300/30">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-paper-100 font-data uppercase tracking-wide text-ink-500">
                                    <tr>
                                        <th className="px-3 py-2 font-medium">{referenceLayer?.name}</th>
                                        <th className="px-3 py-2 font-medium">Surface (km²)</th>
                                        {pointLayers.map((l) => (
                                            <th key={l.id} className="px-3 py-2 font-medium">
                                                {l.name} (nb)
                                            </th>
                                        ))}
                                        {lineLayers.map((l) => (
                                            <th key={l.id} className="px-3 py-2 font-medium">
                                                {l.name} (km)
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-ink-300/20">
                                    {stats.map((s, i) => (
                                        <tr key={i} className="hover:bg-paper-100">
                                            <td className="px-3 py-2 font-medium text-ink-800">{s.name}</td>
                                            <td className="font-data px-3 py-2 text-ink-600">{s.surfaceKm2.toFixed(2)}</td>
                                            {pointLayers.map((l) => (
                                                <td key={l.id} className="font-data px-3 py-2">
                                                    {renderCell(l.id, s.zoneId, s.pointCounts[l.name] ?? 0, true)}
                                                </td>
                                            ))}
                                            {lineLayers.map((l) => (
                                                <td key={l.id} className="font-data px-3 py-2">
                                                    {renderCell(l.id, s.zoneId, s.lineLengths[l.name] ?? 0, false)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Cartouche>
        </div>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="rounded-lg border border-ink-300/30 bg-white px-3 py-2.5 text-center">
            <p className="font-data text-lg font-semibold text-ink-900">{value}</p>
            <p className="text-xs text-ink-500">{label}</p>
        </div>
    );
}
