import { useEffect, useState } from "react";
import { X, History, Plus, Pencil, Trash2 } from "lucide-react";
import { Cartouche, SectionLabel } from "./Panel";
import * as historyApi from "../api/history";
import type { FeatureHistoryEntry } from "../api/history";

const ACTION_META = {
    created: { icon: Plus, label: "Création", color: "text-pine-700" },
    updated: { icon: Pencil, label: "Modification", color: "text-copper-600" },
    deleted: { icon: Trash2, label: "Suppression", color: "text-signal-600" },
};

export function HistoryModal({ featureId, onClose }: { featureId: number; onClose: () => void }) {
    const [entries, setEntries] = useState<FeatureHistoryEntry[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        historyApi
            .getFeatureHistory(featureId)
            .then(setEntries)
            .catch(() => setError("Impossible de charger l'historique de cet objet."));
    }, [featureId]);

    function diffProperties(before: Record<string, any> | null, after: Record<string, any> | null) {
        const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
        const rows: { key: string; before: any; after: any; changed: boolean }[] = [];
        keys.forEach((key) => {
            const b = before?.[key];
            const a = after?.[key];
            rows.push({ key, before: b, after: a, changed: JSON.stringify(b) !== JSON.stringify(a) });
        });
        return rows;
    }

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4">
            <Cartouche className="max-h-[80vh] w-full max-w-lg overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                    <SectionLabel icon={History}>Historique de l'objet #{featureId}</SectionLabel>
                    <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
                        <X size={18} />
                    </button>
                </div>

                {error && (
                    <p className="border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-sm text-signal-600">{error}</p>
                )}

                {!entries && !error && <p className="text-sm text-ink-400">Chargement...</p>}

                {entries && entries.length === 0 && (
                    <p className="text-sm text-ink-400">Aucune modification enregistrée pour cet objet.</p>
                )}

                {entries && entries.length > 0 && (
                    <ul className="space-y-3">
                        {entries.map((entry) => {
                            const meta = ACTION_META[entry.action];
                            const Icon = meta.icon;
                            const rows = diffProperties(entry.properties_before, entry.properties_after);
                            return (
                                <li key={entry.id} className="rounded-lg border border-ink-300/30 p-3">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className={`flex items-center gap-1.5 text-xs font-medium ${meta.color}`}>
                                            <Icon size={13} />
                                            {meta.label}
                                        </span>
                                        <span className="font-data text-[11px] text-ink-400">
                                            {new Date(entry.changed_at).toLocaleString("fr-FR")}
                                        </span>
                                    </div>

                                    {entry.action === "updated" && rows.some((r) => r.changed) && (
                                        <table className="w-full text-xs">
                                            <tbody>
                                                {rows
                                                    .filter((r) => r.changed)
                                                    .map((r) => (
                                                        <tr key={r.key} className="border-t border-ink-300/20">
                                                            <td className="py-1 pr-2 font-medium text-ink-600">{r.key}</td>
                                                            <td className="py-1 pr-2 text-signal-600 line-through">{String(r.before ?? "—")}</td>
                                                            <td className="py-1 text-pine-700">{String(r.after ?? "—")}</td>
                                                        </tr>
                                                    ))}
                                            </tbody>
                                        </table>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </Cartouche>
        </div>
    );
}
