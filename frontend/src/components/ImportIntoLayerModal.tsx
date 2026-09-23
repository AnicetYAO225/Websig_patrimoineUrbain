import { useState, type ChangeEvent } from "react";
import { UploadCloud, X, CheckCircle2, AlertTriangle } from "lucide-react";
import { Cartouche, SectionLabel } from "./Panel";
import * as featuresApi from "../api/features";
import { getErrorMessage } from "../lib/errors";
import type { ImportResult } from "../types";

type FileKind = "geojson" | "tabular" | "shapefile" | "unknown";

function detectFileKind(file: File): FileKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".json") || name.endsWith(".geojson")) return "geojson";
  if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")) return "tabular";
  if (name.endsWith(".zip")) return "shapefile";
  return "unknown";
}

export function ImportIntoLayerModal({
  layerId,
  layerName,
  onClose,
  onImported,
}: {
  layerId: number;
  layerName: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileKind, setFileKind] = useState<FileKind>("unknown");
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Étape de mapping manuel, affichée uniquement si la détection auto échoue (CSV/Excel)
  const [needsMapping, setNeedsMapping] = useState(false);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [mappingMode, setMappingMode] = useState<"latlon" | "wkt">("latlon");
  const [latField, setLatField] = useState("");
  const [lonField, setLonField] = useState("");
  const [wktField, setWktField] = useState("");

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
    setFileKind(selected ? detectFileKind(selected) : "unknown");
    setResult(null);
    setError(null);
    setNeedsMapping(false);
  }

  async function handleImport() {
    if (!file) return;
    setIsUploading(true);
    setError(null);

    try {
      if (fileKind === "geojson") {
        const res = await featuresApi.importFeatures(layerId, file);
        setResult(res);
        onImported();
      } else if (fileKind === "shapefile") {
        const res = await featuresApi.importShapefile(layerId, file);
        setResult(res);
        onImported();
      } else if (fileKind === "tabular") {
        const res = await featuresApi.importTabularFeatures(layerId, file);
        if ("needs_mapping" in res) {
          setAvailableColumns(res.columns);
          setNeedsMapping(true);
        } else {
          setResult(res);
          onImported();
        }
      } else {
        setError("Format non reconnu. Utilise un .geojson/.json, .csv, .xlsx ou un .zip (Shapefile).");
      }
    } catch (err) {
      setError(getErrorMessage(err, "Erreur lors de l'import du fichier."));
    } finally {
      setIsUploading(false);
    }
  }

  async function handleImportWithMapping() {
    if (!file) return;
    setIsUploading(true);
    setError(null);
    try {
      const mapping =
        mappingMode === "wkt" ? { wktField } : { latField, lonField };
      const res = await featuresApi.importTabularFeatures(layerId, file, mapping);
      if ("needs_mapping" in res) {
        setError("Impossible de déterminer la géométrie avec ces colonnes.");
      } else {
        setResult(res);
        onImported();
      }
    } catch (err) {
      setError(getErrorMessage(err, "Erreur lors de l'import du fichier."));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4">
      <Cartouche className="w-full max-w-md p-6">
        <div className="mb-4 flex items-center justify-between">
          <SectionLabel icon={UploadCloud}>Importer dans "{layerName}"</SectionLabel>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700">
            <X size={18} />
          </button>
        </div>

        {!needsMapping && (
          <>
            <p className="mb-4 text-xs text-ink-500">
              Formats acceptés : GeoJSON (.geojson/.json), CSV, Excel (.xlsx), ou Shapefile compressé en .zip
              (contenant .shp + .dbf, idéalement + .prj pour la reprojection automatique).
            </p>

            <input
              type="file"
              accept=".json,.geojson,.csv,.xlsx,.xls,.zip"
              onChange={handleFileChange}
              className="rounded-lg mb-4 w-full border border-ink-300 px-3 py-2 text-sm text-ink-700 outline-none file:mr-3 file:rounded file:border-0 file:bg-ink-900 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-copper-600"
            />
          </>
        )}

        {needsMapping && (
          <div className="mb-4">
            <p className="mb-3 text-xs text-ink-500">
              Impossible de détecter automatiquement les colonnes de position dans ce fichier. Indique-les
              manuellement :
            </p>

            <div className="mb-3 flex gap-2">
              <button
                onClick={() => setMappingMode("latlon")}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${mappingMode === "latlon" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                  }`}
              >
                Latitude / Longitude
              </button>
              <button
                onClick={() => setMappingMode("wkt")}
                className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${mappingMode === "wkt" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                  }`}
              >
                Colonne géométrie (WKT)
              </button>
            </div>

            {mappingMode === "latlon" ? (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Latitude</label>
                  <select
                    value={latField}
                    onChange={(e) => setLatField(e.target.value)}
                    className="rounded-lg w-full border border-ink-300 px-2 py-1.5 text-sm outline-none focus:border-copper-600"
                  >
                    <option value="">—</option>
                    {availableColumns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Longitude</label>
                  <select
                    value={lonField}
                    onChange={(e) => setLonField(e.target.value)}
                    className="rounded-lg w-full border border-ink-300 px-2 py-1.5 text-sm outline-none focus:border-copper-600"
                  >
                    <option value="">—</option>
                    {availableColumns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ) : (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-ink-700">Colonne WKT</label>
                <select
                  value={wktField}
                  onChange={(e) => setWktField(e.target.value)}
                  className="rounded-lg w-full border border-ink-300 px-2 py-1.5 text-sm outline-none focus:border-copper-600"
                >
                  <option value="">—</option>
                  {availableColumns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mb-3 border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-sm text-signal-600">{error}</p>
        )}

        {result && (
          <div className="mb-4 rounded-lg border border-ink-300/30 p-3 text-sm">
            <p className="flex items-center gap-1.5 text-pine-700">
              <CheckCircle2 size={14} />
              {result.imported_count} objet{result.imported_count > 1 ? "s" : ""} importé
              {result.imported_count > 1 ? "s" : ""}.
            </p>
            {result.skipped_count > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-copper-600">
                <AlertTriangle size={14} />
                {result.skipped_count} objet{result.skipped_count > 1 ? "s" : ""} ignoré
                {result.skipped_count > 1 ? "s" : ""}.
              </p>
            )}
            {result.errors.length > 0 && (
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-ink-500">
                {result.errors.map((err, i) => (
                  <li key={i}>• {err}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="rounded-lg flex-1 border border-ink-300 py-2 text-sm text-ink-600 hover:bg-paper-100"
          >
            {result ? "Fermer" : "Annuler"}
          </button>
          {!result && !needsMapping && (
            <button
              onClick={handleImport}
              disabled={!file || isUploading}
              className="rounded-lg flex-1 bg-ink-900 py-2 text-sm font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-60"
            >
              {isUploading ? "Import en cours..." : "Importer"}
            </button>
          )}
          {!result && needsMapping && (
            <button
              onClick={handleImportWithMapping}
              disabled={isUploading || (mappingMode === "latlon" ? !latField || !lonField : !wktField)}
              className="rounded-lg flex-1 bg-ink-900 py-2 text-sm font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-60"
            >
              {isUploading ? "Import en cours..." : "Importer avec ce mapping"}
            </button>
          )}
        </div>
      </Cartouche>
    </div>
  );
}
