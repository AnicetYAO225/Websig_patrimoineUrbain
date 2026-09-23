import { useState, type FormEvent } from "react";
import { CheckCircle2, Plus, X } from "lucide-react";
import { Cartouche } from "./Panel";
import { getErrorMessage } from "../lib/errors";

interface PropertyRow {
  key: string;
  value: string;
}

export function FeaturePropertiesModal({
  layerName,
  initialProperties,
  onSubmit,
  onCancel,
}: {
  layerName: string;
  initialProperties?: Record<string, string>;
  onSubmit: (properties: Record<string, string>) => Promise<void>;
  onCancel: () => void;
}) {
  const isEditing = Boolean(initialProperties);
  const [rows, setRows] = useState<PropertyRow[]>(
    initialProperties && Object.keys(initialProperties).length > 0
      ? Object.entries(initialProperties).map(([key, value]) => ({ key, value: String(value) }))
      : [{ key: "", value: "" }]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateRow(index: number, field: keyof PropertyRow, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addRow() {
    setRows((prev) => [...prev, { key: "", value: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const properties: Record<string, string> = {};
      for (const row of rows) {
        if (row.key.trim()) properties[row.key.trim()] = row.value;
      }
      await onSubmit(properties);
    } catch (err: any) {
      setError(getErrorMessage(err, isEditing ? "Erreur lors de la modification de l'objet." : "Erreur lors de la création de l'objet."));
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4">
      <Cartouche className="w-full max-w-md p-6">
        <h2 className="font-display text-base font-semibold text-ink-900">
          {isEditing ? "Modifier l'objet" : "Nouvel objet"} · {layerName}
        </h2>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-500">
          <CheckCircle2 size={13} className="text-pine-700" />
          {isEditing
            ? "Modifie les attributs puis enregistre."
            : "Géométrie dessinée - renseigne maintenant ses attributs (optionnel)."}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input
                placeholder="Attribut (ex: état)"
                value={row.key}
                onChange={(e) => updateRow(i, "key", e.target.value)}
                className="rounded-lg w-1/2 border border-ink-300 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-copper-600"
              />
              <input
                placeholder="Valeur (ex: Fonctionnel)"
                value={row.value}
                onChange={(e) => updateRow(i, "value", e.target.value)}
                className="rounded-lg w-1/2 border border-ink-300 px-2 py-1.5 text-sm text-ink-900 outline-none focus:border-copper-600"
              />
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="px-1 text-ink-400 hover:text-signal-600"
                  aria-label="Supprimer cet attribut"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1 text-xs font-medium text-copper-600 hover:underline"
          >
            <Plus size={13} />
            Ajouter un attribut
          </button>

          {error && (
            <p className="border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-sm text-signal-600">
              {error}
            </p>
          )}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg flex-1 border border-ink-300 py-2 text-sm text-ink-600 hover:bg-paper-100"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg flex-1 bg-ink-900 py-2 text-sm font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-60"
            >
              {isSubmitting ? "Enregistrement..." : isEditing ? "Modifier" : "Enregistrer"}
            </button>
          </div>
        </form>
      </Cartouche>
    </div>
  );
}
