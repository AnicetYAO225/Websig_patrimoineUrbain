import { useEffect, useState } from "react";
import { X, GitMerge } from "lucide-react";
import { Cartouche, SectionLabel } from "./Panel";
import * as featuresApi from "../api/features";
import * as joinsApi from "../api/joins";
import type { GeoJSONFeature, Layer } from "../types";

interface JoinModalProps {
    targetLayer: Layer;
    layers: Layer[];
    onClose: () => void;
    onJoined: () => void;
}

function extractFields(features: GeoJSONFeature[]): string[] {
    const keys = new Set<string>();
    features.forEach((f) =>
        Object.keys(f.properties || {}).forEach((k) => {
            if (!["layer_id", "created_at", "updated_at"].includes(k)) keys.add(k);
        })
    );
    return Array.from(keys);
}

export function JoinModal({ targetLayer, layers, onClose, onJoined }: JoinModalProps) {
    const otherLayers = layers.filter((l) => l.id !== targetLayer.id);

    const [joinType, setJoinType] = useState<"spatial" | "attribute">("attribute");
    const [sourceLayerId, setSourceLayerId] = useState<number | null>(otherLayers[0]?.id ?? null);
    const [predicate, setPredicate] = useState<"intersects" | "within" | "contains">("intersects");
    const [targetKeyField, setTargetKeyField] = useState("");
    const [sourceKeyField, setSourceKeyField] = useState("");
    const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

    const [targetFields, setTargetFields] = useState<string[]>([]);
    const [sourceFields, setSourceFields] = useState<string[]>([]);
    const [isLoadingFields, setIsLoadingFields] = useState(true);

    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<{ updated_count: number; unmatched_count: number } | null>(null);

    useEffect(() => {
        featuresApi.listFeatures(targetLayer.id).then((fc) => setTargetFields(extractFields(fc.features)));
    }, [targetLayer.id]);

    useEffect(() => {
        if (!sourceLayerId) return;
        setIsLoadingFields(true);
        setSelectedFields(new Set());
        featuresApi
            .listFeatures(sourceLayerId)
            .then((fc) => setSourceFields(extractFields(fc.features)))
            .finally(() => setIsLoadingFields(false));
    }, [sourceLayerId]);

    function toggleField(field: string) {
        setSelectedFields((prev) => {
            const next = new Set(prev);
            if (next.has(field)) next.delete(field);
            else next.add(field);
            return next;
        });
    }

    async function handleRun() {
        if (!sourceLayerId) return;
        setIsRunning(true);
        setError(null);
        try {
            const fields = selectedFields.size > 0 ? Array.from(selectedFields) : null;
            const res =
                joinType === "attribute"
                    ? await joinsApi.joinAttribute(targetLayer.id, {
                        source_layer_id: sourceLayerId,
                        target_key_field: targetKeyField,
                        source_key_field: sourceKeyField,
                        fields,
                    })
                    : await joinsApi.joinSpatial(targetLayer.id, {
                        source_layer_id: sourceLayerId,
                        predicate,
                        fields,
                    });
            setResult(res);
            onJoined();
        } catch (err: any) {
            setError(err?.response?.data?.detail || "Erreur lors de la jointure.");
        } finally {
            setIsRunning(false);
        }
    }

    const canRun = sourceLayerId !== null && (joinType === "spatial" || (targetKeyField && sourceKeyField));

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4">
            <Cartouche className="max-h-[85vh] w-full max-w-md overflow-y-auto p-6">
                <div className="mb-4 flex items-center justify-between">
                    <SectionLabel icon={GitMerge}>Jointure · {targetLayer.name}</SectionLabel>
                    <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
                        <X size={18} />
                    </button>
                </div>

                {!result ? (
                    <>
                        <div className="mb-4 flex gap-2">
                            <button
                                onClick={() => setJoinType("attribute")}
                                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${joinType === "attribute" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                                    }`}
                            >
                                Attributaire
                            </button>
                            <button
                                onClick={() => setJoinType("spatial")}
                                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${joinType === "spatial" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                                    }`}
                            >
                                Spatiale
                            </button>
                        </div>

                        <label className="mb-1 block text-xs font-medium text-ink-700">Couche source (fournit les attributs)</label>
                        <select
                            value={sourceLayerId ?? ""}
                            onChange={(e) => setSourceLayerId(Number(e.target.value))}
                            className="rounded-lg mb-4 w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                        >
                            {otherLayers.map((l) => (
                                <option key={l.id} value={l.id}>
                                    {l.name}
                                </option>
                            ))}
                        </select>

                        {joinType === "attribute" ? (
                            <div className="mb-4 grid grid-cols-2 gap-2">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-ink-700">
                                        Champ clé — {targetLayer.name}
                                    </label>
                                    <select
                                        value={targetKeyField}
                                        onChange={(e) => setTargetKeyField(e.target.value)}
                                        className="rounded-lg w-full border border-ink-300 px-2 py-1.5 text-sm outline-none focus:border-copper-600"
                                    >
                                        <option value="">—</option>
                                        {targetFields.map((f) => (
                                            <option key={f} value={f}>
                                                {f}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-ink-700">Champ clé — source</label>
                                    <select
                                        value={sourceKeyField}
                                        onChange={(e) => setSourceKeyField(e.target.value)}
                                        className="rounded-lg w-full border border-ink-300 px-2 py-1.5 text-sm outline-none focus:border-copper-600"
                                    >
                                        <option value="">—</option>
                                        {sourceFields.map((f) => (
                                            <option key={f} value={f}>
                                                {f}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div className="mb-4">
                                <label className="mb-1 block text-xs font-medium text-ink-700">Relation spatiale</label>
                                <select
                                    value={predicate}
                                    onChange={(e) => setPredicate(e.target.value as any)}
                                    className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm outline-none focus:border-copper-600"
                                >
                                    <option value="intersects">Intersecte</option>
                                    <option value="within">Est à l'intérieur de</option>
                                    <option value="contains">Contient</option>
                                </select>
                            </div>
                        )}

                        <label className="mb-1 block text-xs font-medium text-ink-700">
                            Attributs à copier depuis la source {selectedFields.size === 0 && "(tous par défaut)"}
                        </label>
                        <div className="mb-4 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-ink-300/30 p-2">
                            {sourceFields.length === 0 ? (
                                <p className="text-xs text-ink-400">
                                    {isLoadingFields ? "Chargement..." : "Aucun attribut trouvé sur cette couche."}
                                </p>
                            ) : (
                                sourceFields.map((f) => (
                                    <label key={f} className="flex items-center gap-2 text-xs text-ink-700">
                                        <input
                                            type="checkbox"
                                            checked={selectedFields.has(f)}
                                            onChange={() => toggleField(f)}
                                            className="accent-copper-600"
                                        />
                                        {f}
                                    </label>
                                ))
                            )}
                        </div>

                        <p className="mb-4 text-[11px] text-ink-400">
                            La jointure met à jour les attributs des objets de "{targetLayer.name}" directement (les objets sans
                            correspondance ne sont pas modifiés). Chaque modification reste tracée dans l'historique de l'objet.
                        </p>

                        {error && (
                            <p className="mb-3 border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-xs text-signal-600">
                                {error}
                            </p>
                        )}

                        <button
                            onClick={handleRun}
                            disabled={!canRun || isRunning}
                            className="rounded-lg flex w-full items-center justify-center gap-2 bg-ink-900 py-2.5 text-sm font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-60"
                        >
                            {isRunning ? "Jointure en cours..." : "Lancer la jointure"}
                        </button>
                    </>
                ) : (
                    <div className="space-y-3">
                        <p className="text-sm text-pine-700">
                            {result.updated_count} objet{result.updated_count > 1 ? "s" : ""} mis à jour.
                        </p>
                        {result.unmatched_count > 0 && (
                            <p className="text-sm text-copper-600">
                                {result.unmatched_count} objet{result.unmatched_count > 1 ? "s" : ""} sans correspondance (non
                                modifié{result.unmatched_count > 1 ? "s" : ""}).
                            </p>
                        )}
                        <button
                            onClick={onClose}
                            className="rounded-lg w-full border border-ink-300 py-2 text-sm text-ink-600 hover:bg-paper-100"
                        >
                            Fermer
                        </button>
                    </div>
                )}
            </Cartouche>
        </div>
    );
}
