import { useMemo, useState } from "react";
import { X, Palette } from "lucide-react";
import { Cartouche, SectionLabel } from "./Panel";
import type { GeoJSONFeature, LayerStyleConfig } from "../types";

const PALETTE = [
    "#2563eb", // bleu
    "#16a34a", // vert
    "#dc2626", // rouge
    "#ea580c", // orange
    "#9333ea", // violet
    "#0891b2", // cyan
    "#ca8a04", // jaune
    "#374151", // gris foncé
    "#7c3aed", // indigo
    "#be123c", // rose
    "#14532d", // vert foncé
    "#0f766e", // turquoise
];

// Réexporté depuis types.ts pour garder le nom "SymbologyConfig" utilisé
// partout ailleurs dans le code, sans dupliquer la définition du type.
export type SymbologyConfig = LayerStyleConfig;

interface SymbologyPanelProps {
    layerName: string;
    features: GeoJSONFeature[];
    currentConfig: SymbologyConfig | null;
    onApply: (config: SymbologyConfig | null) => void;
    onClose: () => void;
}

export function SymbologyPanel({ layerName, features, currentConfig, onApply, onClose }: SymbologyPanelProps) {
    const availableFields = useMemo(() => {
        const keys = new Set<string>();
        features.forEach((f) => Object.keys(f.properties || {}).forEach((k) => keys.add(k)));
        return Array.from(keys).filter((k) => !["layer_id", "created_at", "updated_at"].includes(k));
    }, [features]);

    const [mode, setMode] = useState<"uniform" | "attribute">(currentConfig ? "attribute" : "uniform");
    const [field, setField] = useState(currentConfig?.field ?? availableFields[0] ?? "");
    const [colors, setColors] = useState<Record<string, string>>(currentConfig?.colors ?? {});
    const [uniformColor, setUniformColor] = useState(
        currentConfig?.defaultColor ?? "#2563eb"
    );

    // Remplissage (polygones)
    const [fillEnabled, setFillEnabled] = useState(currentConfig?.fill?.enabled ?? true);
    const [fillOpacity, setFillOpacity] = useState(currentConfig?.fill?.opacity ?? 0.35);

    // Contour (polygones / lignes)
    const [strokeEnabled, setStrokeEnabled] = useState(currentConfig?.stroke?.enabled ?? true);
    const [strokeColor, setStrokeColor] = useState(currentConfig?.stroke?.color ?? "#1c1917");
    const [strokeWidth, setStrokeWidth] = useState(currentConfig?.stroke?.width ?? 2.5);

    const distinctValues = useMemo(() => {
        if (!field) return [];
        const values = new Set<string>();
        features.forEach((f) => {
            const v = f.properties?.[field];
            if (v !== undefined && v !== null) values.add(String(v));
        });
        return Array.from(values);
    }, [features, field]);

    function autoAssignColors(targetField: string) {
        const values = new Set<string>();
        features.forEach((f) => {
            const v = f.properties?.[targetField];
            if (v !== undefined && v !== null) values.add(String(v));
        });
        const assigned: Record<string, string> = {};
        Array.from(values).forEach((v, i) => {
            assigned[v] = PALETTE[i % PALETTE.length];
        });
        setColors(assigned);
    }

    function handleFieldChange(newField: string) {
        setField(newField);
        autoAssignColors(newField);
    }

    function handleApply() {
        if (mode === "uniform") {
            onApply({
                field: "",
                colors: {},
                defaultColor: uniformColor,

                fill: {
                    enabled: fillEnabled,
                    opacity: fillOpacity,
                },

                stroke: {
                    enabled: strokeEnabled,
                    color: strokeColor,
                    width: strokeWidth,
                }
            });
        } else {
            onApply({
                field,
                colors,
                defaultColor: "#9ca3af",

                fill: {
                    enabled: fillEnabled,
                    opacity: fillOpacity,
                },

                stroke: {
                    enabled: strokeEnabled,
                    color: strokeColor,
                    width: strokeWidth,
                }
            });
        }
        onClose();
    }

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4">
            <Cartouche className="max-h-[80vh] w-full max-w-md overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                    <SectionLabel icon={Palette}>Symbologie · {layerName}</SectionLabel>
                    <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
                        <X size={18} />
                    </button>
                </div>

                <div className="mb-4 flex gap-2">
                    <button
                        onClick={() => setMode("uniform")}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${mode === "uniform" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                            }`}
                    >
                        Couleur unique
                    </button>
                    <button
                        onClick={() => setMode("attribute")}
                        className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${mode === "attribute" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                            }`}
                    >
                        Par attribut
                    </button>
                </div>

                {mode === "uniform" && (
                    <>
                        <label className="mb-2 block text-xs font-medium text-ink-700">
                            Couleur de la couche
                        </label>

                        <div className="mb-5 flex flex-wrap gap-2">
                            {PALETTE.map((color) => (
                                <button
                                    key={color}
                                    onClick={() => setUniformColor(color)}
                                    className={`h-8 w-8 rounded-full border-2 transition ${uniformColor === color
                                        ? "border-black scale-110"
                                        : "border-white"
                                        }`}
                                    style={{ backgroundColor: color }}
                                />
                            ))}
                        </div>

                        <div className="mb-4">
                            <label className="mb-1 block text-xs text-ink-600">
                                Couleur personnalisée
                            </label>

                            <input
                                type="color"
                                value={uniformColor}
                                onChange={(e) => setUniformColor(e.target.value)}
                                className="h-10 w-full cursor-pointer rounded border border-ink-300"
                            />
                        </div>

                        <div className="rounded-lg border border-ink-300 bg-paper-100 p-3">
                            <div className="mb-2 text-xs font-medium text-ink-600">
                                Aperçu
                            </div>

                            <div
                                className="h-10 rounded"
                                style={{ backgroundColor: uniformColor, opacity: fillEnabled ? fillOpacity : 1 }}
                            />
                        </div>
                    </>
                )}

                {mode === "attribute" && (
                    <>
                        <label className="mb-1 block text-xs font-medium text-ink-700">Champ à styliser</label>
                        <select
                            value={field}
                            onChange={(e) => handleFieldChange(e.target.value)}
                            className="rounded-lg mb-4 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                        >
                            {availableFields.map((f) => (
                                <option key={f} value={f}>
                                    {f}
                                </option>
                            ))}
                        </select>

                        {distinctValues.length === 0 ? (
                            <p className="text-xs text-ink-400">Aucune valeur trouvée pour ce champ.</p>
                        ) : (
                            <div className="max-h-56 space-y-2 overflow-y-auto">
                                {distinctValues.map((value) => (
                                    <div key={value} className="flex items-center gap-2">
                                        <input
                                            type="color"
                                            value={colors[value] ?? "#9ca3af"}
                                            onChange={(e) => setColors((prev) => ({ ...prev, [value]: e.target.value }))}
                                            className="h-7 w-9 flex-shrink-0 cursor-pointer rounded border border-ink-300"
                                        />
                                        <span className="flex-1 truncate text-xs text-ink-700">{value}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                <div className="mt-5 border-t border-ink-300/60 pt-4">
                    <div className="mb-3 flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
                            <input
                                type="checkbox"
                                checked={fillEnabled}
                                onChange={(e) => setFillEnabled(e.target.checked)}
                                className="cursor-pointer"
                            />
                            Remplissage
                        </label>
                        <span className="font-data text-[11px] text-ink-500">
                            {Math.round(fillOpacity * 100)}%
                        </span>
                    </div>
                    <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={fillOpacity}
                        disabled={!fillEnabled}
                        onChange={(e) => setFillOpacity(Number(e.target.value))}
                        className="mb-4 w-full disabled:opacity-40"
                    />

                    <div className="mb-3 flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-medium text-ink-700">
                            <input
                                type="checkbox"
                                checked={strokeEnabled}
                                onChange={(e) => setStrokeEnabled(e.target.checked)}
                                className="cursor-pointer"
                            />
                            Contour
                        </label>
                        <span className="font-data text-[11px] text-ink-500">{strokeWidth.toFixed(1)} px</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            value={strokeColor}
                            disabled={!strokeEnabled}
                            onChange={(e) => setStrokeColor(e.target.value)}
                            className="h-8 w-10 flex-shrink-0 cursor-pointer rounded border border-ink-300 disabled:opacity-40"
                        />
                        <input
                            type="range"
                            min={0.5}
                            max={8}
                            step={0.5}
                            value={strokeWidth}
                            disabled={!strokeEnabled}
                            onChange={(e) => setStrokeWidth(Number(e.target.value))}
                            className="flex-1 disabled:opacity-40"
                        />
                    </div>
                </div>

                <div className="mt-5 flex gap-2">
                    <button
                        onClick={onClose}
                        className="rounded-lg flex-1 border border-ink-300 py-2 text-sm text-ink-600 hover:bg-paper-100"
                    >
                        Annuler
                    </button>
                    <button
                        onClick={handleApply}
                        className="rounded-lg flex-1 bg-ink-900 py-2 text-sm font-medium text-white hover:bg-copper-600"
                    >
                        Appliquer
                    </button>
                </div>
            </Cartouche>
        </div>
    );
}
