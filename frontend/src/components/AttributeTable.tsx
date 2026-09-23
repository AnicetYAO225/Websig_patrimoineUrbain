import { useState } from "react";
import { MapPin, Pencil, Search, Trash2, X } from "lucide-react";
import type { GeoJSONFeature } from "../types";

const HIDDEN_KEYS = ["layer_id", "created_at", "updated_at"];

interface AttributeTableProps {
    layerName: string;
    features: GeoJSONFeature[];
    onClose: () => void;
    onLocate: (feature: GeoJSONFeature) => void;
    onEdit: (feature: GeoJSONFeature) => void;
    onDelete: (feature: GeoJSONFeature) => void;
}

export function AttributeTable({
    layerName,
    features,
    onClose,
    onLocate,
    onEdit,
    onDelete,
}: AttributeTableProps) {
    // Colonnes = union de toutes les clés de propriétés réellement présentes
    // (chaque couche peut avoir des attributs différents d'un objet à l'autre).
    const columns = Array.from(
        features.reduce((keys, f) => {
            Object.keys(f.properties || {}).forEach((k) => {
                if (!HIDDEN_KEYS.includes(k)) keys.add(k);
            });
            return keys;
        }, new Set<string>())
    );

    const [filter, setFilter] = useState("");

    const filteredFeatures = features.filter((feature) => {
        const q = filter.trim().toLowerCase();
        if (!q) return true;
        return Object.entries(feature.properties || {}).some(
            ([k, v]) => !HIDDEN_KEYS.includes(k) && String(v).toLowerCase().includes(q)
        );
    });

    return (
        <div className="absolute inset-x-0 bottom-0 z-[15] flex h-72 flex-col border-t border-ink-300/40 bg-white shadow-lg">
            <div className="flex flex-shrink-0 items-center justify-between gap-4 border-b border-ink-300/30 px-4 py-2.5">
                <p className="flex-shrink-0 font-data text-[11px] font-medium uppercase tracking-widest text-ink-500">
                    Table attributaire · <span className="text-ink-800">{layerName}</span>{" "}
                    <span className="text-ink-400">
                        ({filteredFeatures.length}
                        {filter ? ` / ${features.length}` : ""})
                    </span>
                </p>

                <div className="flex flex-1 items-center gap-2 max-w-xs">
                    <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-ink-300/40 px-2 py-1">
                        <Search size={13} className="flex-shrink-0 text-ink-400" />
                        <input
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            placeholder="Filtrer..."
                            className="w-full text-xs text-ink-900 outline-none placeholder:text-ink-400"
                        />
                        {filter && (
                            <button onClick={() => setFilter("")} className="text-ink-400 hover:text-ink-700">
                                <X size={12} />
                            </button>
                        )}
                    </div>
                </div>

                <button onClick={onClose} className="flex-shrink-0 text-ink-400 hover:text-ink-700" aria-label="Fermer la table">
                    <X size={16} />
                </button>
            </div>

            <div className="flex-1 overflow-auto">
                <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-paper-100 font-data uppercase tracking-wide text-ink-500">
                        <tr>
                            <th className="px-3 py-2 font-medium">#</th>
                            {columns.map((col) => (
                                <th key={col} className="px-3 py-2 font-medium">
                                    {col}
                                </th>
                            ))}
                            <th className="px-3 py-2 font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-300/20">
                        {filteredFeatures.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length + 2} className="px-3 py-6 text-center text-ink-400">
                                    {filter ? `Aucun résultat pour "${filter}".` : "Aucun objet dans cette couche."}
                                </td>
                            </tr>
                        ) : (
                            filteredFeatures.map((feature) => (
                                <tr key={feature.id} className="hover:bg-paper-100">
                                    <td className="font-data px-3 py-2 text-ink-400">{feature.id}</td>
                                    {columns.map((col) => (
                                        <td key={col} className="px-3 py-2 text-ink-700">
                                            {feature.properties?.[col] ?? <span className="text-ink-300">—</span>}
                                        </td>
                                    ))}
                                    <td className="px-3 py-2">
                                        <div className="flex items-center gap-2.5">
                                            <button
                                                onClick={() => onLocate(feature)}
                                                title="Localiser sur la carte"
                                                className="text-ink-500 hover:text-copper-600"
                                            >
                                                <MapPin size={14} />
                                            </button>
                                            <button
                                                onClick={() => onEdit(feature)}
                                                title="Modifier"
                                                className="text-ink-500 hover:text-copper-600"
                                            >
                                                <Pencil size={14} />
                                            </button>
                                            <button
                                                onClick={() => onDelete(feature)}
                                                title="Supprimer"
                                                className="text-ink-500 hover:text-signal-600"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}