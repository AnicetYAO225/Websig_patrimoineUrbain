import { useRef, useState, type DragEvent, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, FileJson, FileSpreadsheet, FileArchive, Loader2, UploadCloud } from "lucide-react";
import { Cartouche, SectionLabel } from "./Panel";
import * as layersApi from "../api/layers";
import * as featuresApi from "../api/features";
import { getErrorMessage } from "../lib/errors";
import { slugify } from "../lib/slugify";
import type { GeometryType, ImportResult } from "../types";

interface FilePreview {
  featureCount: number;
  geometryType: GeometryType;
  propertyKeys: string[];
}

type FileKind = "geojson" | "tabular" | "shapefile" | "unknown";

const GEOMETRY_OPTIONS: GeometryType[] = ["Point", "LineString", "Polygon"];

function detectFileKind(file: File): FileKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".geojson") || name.endsWith(".json")) return "geojson";
  if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")) return "tabular";
  if (name.endsWith(".zip")) return "shapefile";
  return "unknown";
}

export function ImportGeoJSONPanel({ onImported }: { onImported: () => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileKind, setFileKind] = useState<FileKind>("unknown");
  const [preview, setPreview] = useState<FilePreview | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [geometryType, setGeometryType] = useState<GeometryType>("Point");
  const [source, setSource] = useState("");
  const [sourceDate, setSourceDate] = useState("");
  const [license, setLicense] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  // --- Mapping manuel de colonnes, uniquement nécessaire pour CSV/Excel
  // quand la détection automatique des colonnes de position échoue ---
  const [createdLayerId, setCreatedLayerId] = useState<number | null>(null);
  const [needsMapping, setNeedsMapping] = useState(false);
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [mappingMode, setMappingMode] = useState<"latlon" | "wkt">("latlon");
  const [latField, setLatField] = useState("");
  const [lonField, setLonField] = useState("");
  const [wktField, setWktField] = useState("");

  function resetAll() {
    setFile(null);
    setFileKind("unknown");
    setPreview(null);
    setParseError(null);
    setName("");
    setSlug("");
    setSlugTouched(false);
    setDescription("");
    setSource("");
    setSourceDate("");
    setLicense("");
    setResult(null);
    setSubmitError(null);
    setCreatedLayerId(null);
    setNeedsMapping(false);
    setAvailableColumns([]);
    setLatField("");
    setLonField("");
    setWktField("");
  }

  function handleFile(selected: File) {
    const kind = detectFileKind(selected);
    setFile(selected);
    setFileKind(kind);
    setParseError(null);
    setResult(null);
    setSubmitError(null);
    setNeedsMapping(false);
    setCreatedLayerId(null);

    const suggestedName = selected.name.replace(/\.(geo)?json$|\.(csv|xlsx?|zip)$/i, "").replace(/[_-]+/g, " ").trim();
    if (!name) setName(suggestedName);
    if (!slugTouched) setSlug(slugify(suggestedName));

    if (kind === "geojson") {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result as string);
          if (json.type !== "FeatureCollection" || !Array.isArray(json.features) || json.features.length === 0) {
            throw new Error("empty_or_invalid");
          }
          const firstGeomType: string = json.features[0]?.geometry?.type ?? "Point";
          const baseType = (firstGeomType.replace(/^Multi/, "") || "Point") as GeometryType;
          const propertyKeys = Object.keys(json.features[0]?.properties ?? {});

          setPreview({ featureCount: json.features.length, geometryType: baseType, propertyKeys });
          setGeometryType(baseType);
        } catch {
          setParseError("Fichier illisible : un GeoJSON de type FeatureCollection est attendu.");
          setPreview(null);
        }
      };
      reader.readAsText(selected);
    } else {
      // CSV/Excel/Shapefile : pas d'aperçu détaillé côté navigateur (fichier
      // binaire ou format nécessitant une lecture serveur) — le type de
      // géométrie doit être choisi manuellement ci-dessous.
      setPreview(null);
      if (kind === "unknown") {
        setParseError("Format non reconnu. Utilise un .geojson/.json, .csv, .xlsx, ou un .zip (Shapefile).");
      }
    }
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const layer = await layersApi.createLayer({
        name,
        slug,
        description: description || undefined,
        geometry_type: geometryType,
        source: source || undefined,
        source_date: sourceDate || undefined,
        license: license || undefined,
      });

      if (fileKind === "geojson") {
        const importResult = await featuresApi.importFeatures(layer.id, file);
        setResult(importResult);
        onImported();
      } else if (fileKind === "shapefile") {
        const importResult = await featuresApi.importShapefile(layer.id, file);
        setResult(importResult);
        onImported();
      } else if (fileKind === "tabular") {
        const res = await featuresApi.importTabularFeatures(layer.id, file);
        if ("needs_mapping" in res) {
          // La couche est déjà créée : on garde son id pour finaliser
          // l'import juste après, sans la recréer une seconde fois.
          setCreatedLayerId(layer.id);
          setAvailableColumns(res.columns);
          setNeedsMapping(true);
        } else {
          setResult(res);
          onImported();
        }
      }
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Erreur lors de l'import."));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmitMapping(e: FormEvent) {
    e.preventDefault();
    if (!file || createdLayerId === null) return;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const mapping = mappingMode === "wkt" ? { wktField } : { latField, lonField };
      const res = await featuresApi.importTabularFeatures(createdLayerId, file, mapping);
      if ("needs_mapping" in res) {
        setSubmitError("Impossible de déterminer la géométrie avec ces colonnes.");
      } else {
        setResult(res);
        onImported();
      }
    } catch (err) {
      setSubmitError(getErrorMessage(err, "Erreur lors de l'import."));
    } finally {
      setIsSubmitting(false);
    }
  }

  const FileIcon = fileKind === "tabular" ? FileSpreadsheet : fileKind === "shapefile" ? FileArchive : FileJson;

  return (
    <Cartouche className="mt-4 p-5">
      <SectionLabel icon={UploadCloud}>Importer des données</SectionLabel>
      <p className="mb-4 text-xs text-ink-500">
        Dépose un fichier <code className="font-data">.geojson</code>, <code className="font-data">.csv</code>,{" "}
        <code className="font-data">.xlsx</code>, ou un <code className="font-data">.zip</code> (Shapefile) pour
        créer une nouvelle couche et y importer directement tous ses objets.
      </p>

      {result ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3 border-l-2 border-pine-700 bg-pine-100 px-4 py-3">
            <CheckCircle2 size={18} className="mt-0.5 flex-shrink-0 text-pine-700" />
            <div className="text-sm text-pine-700">
              <p className="font-medium">
                {result.imported_count} objet{result.imported_count > 1 ? "s" : ""} importé
                {result.imported_count > 1 ? "s" : ""} avec succès.
              </p>
              {result.skipped_count > 0 && (
                <p className="mt-1 text-xs">{result.skipped_count} objet(s) ignoré(s).</p>
              )}
            </div>
          </div>

          {result.errors.length > 0 && (
            <div className="border-l-2 border-copper-600 bg-copper-100 px-4 py-3 text-xs text-ink-700">
              <p className="mb-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle size={14} className="text-copper-600" />
                Détail des objets ignorés
              </p>
              <ul className="max-h-32 list-inside list-disc space-y-0.5 overflow-y-auto">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={resetAll}
            className="rounded-lg border border-ink-300 px-4 py-2 text-sm text-ink-700 hover:bg-paper-100"
          >
            Importer un autre fichier
          </button>
        </div>
      ) : needsMapping ? (
        <form onSubmit={handleSubmitMapping} className="space-y-4">
          <p className="text-xs text-ink-500">
            La couche <strong className="text-ink-800">{name}</strong> a été créée. Impossible de détecter
            automatiquement les colonnes de position dans ce fichier — indique-les manuellement pour finaliser
            l'import :
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMappingMode("latlon")}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${mappingMode === "latlon" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                }`}
            >
              Latitude / Longitude
            </button>
            <button
              type="button"
              onClick={() => setMappingMode("wkt")}
              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${mappingMode === "wkt" ? "border-copper-600 bg-copper-100 text-copper-600" : "border-ink-300 text-ink-600"
                }`}
            >
              Colonne géométrie (WKT)
            </button>
          </div>

          {mappingMode === "latlon" ? (
            <div className="grid grid-cols-2 gap-2">
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
            <div>
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

          {submitError && (
            <p className="border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-sm text-signal-600">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting || (mappingMode === "latlon" ? !latField || !lonField : !wktField)}
            className="rounded-lg flex items-center gap-2 bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-60"
          >
            {isSubmitting && <Loader2 size={14} className="animate-spin" />}
            {isSubmitting ? "Import en cours..." : "Finaliser l'import"}
          </button>
        </form>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* --- Zone de dépôt --- */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed px-6 py-8 text-center transition-colors ${isDragging ? "border-copper-600 bg-copper-100/40" : "border-ink-300 hover:border-copper-500"
              }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".geojson,.json,.csv,.xlsx,.xls,.zip"
              className="hidden"
              onChange={(e) => {
                const selected = e.target.files?.[0];
                if (selected) handleFile(selected);
              }}
            />
            {file ? (
              <>
                <FileIcon size={28} className="text-copper-600" />
                <p className="text-sm font-medium text-ink-800">{file.name}</p>
                <p className="text-xs text-ink-500">Clique ou dépose un autre fichier pour le remplacer</p>
              </>
            ) : (
              <>
                <UploadCloud size={28} className="text-ink-400" />
                <p className="text-sm font-medium text-ink-700">
                  Glisse un fichier ici, ou clique pour parcourir
                </p>
                <p className="text-xs text-ink-400">.geojson, .csv, .xlsx, ou .zip (Shapefile)</p>
              </>
            )}
          </div>

          {parseError && (
            <p className="border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-sm text-signal-600">
              {parseError}
            </p>
          )}

          {file && fileKind !== "unknown" && (fileKind !== "geojson" || preview) && (
            <>
              {/* --- Aperçu détecté (GeoJSON uniquement) --- */}
              {preview && (
                <div className="rounded-lg flex flex-wrap gap-4 border border-ink-300/30 bg-paper-100 px-4 py-3 text-xs text-ink-600">
                  <span>
                    <strong className="font-data text-ink-900">{preview.featureCount}</strong> objet(s) détecté(s)
                  </span>
                  <span>
                    Géométrie : <strong className="font-data text-ink-900">{preview.geometryType}</strong>
                  </span>
                  <span className="w-full sm:w-auto">
                    Attributs :{" "}
                    <strong className="font-data text-ink-900">
                      {preview.propertyKeys.slice(0, 6).join(", ") || "aucun"}
                      {preview.propertyKeys.length > 6 ? "..." : ""}
                    </strong>
                  </span>
                </div>
              )}
              {!preview && (fileKind === "tabular" || fileKind === "shapefile") && (
                <div className="rounded-lg border border-ink-300/30 bg-paper-100 px-4 py-3 text-xs text-ink-600">
                  {fileKind === "shapefile"
                    ? "Le zip doit contenir au moins un .shp et un .dbf (idéalement + .prj pour la reprojection automatique). Le type de géométrie sera vérifié après import."
                    : "Les colonnes de position (latitude/longitude ou WKT) seront détectées automatiquement, ou à préciser manuellement si besoin."}{" "}
                  Choisis ci-dessous le type de géométrie attendu.
                </div>
              )}

              {/* --- Métadonnées de la couche à créer --- */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Nom de la couche</label>
                  <input
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      if (!slugTouched) setSlug(slugify(e.target.value));
                    }}
                    required
                    className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Slug (identifiant technique)</label>
                  <input
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugTouched(true);
                    }}
                    required
                    className="rounded-lg font-data w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Type de géométrie</label>
                  <select
                    value={geometryType}
                    onChange={(e) => setGeometryType(e.target.value as GeometryType)}
                    disabled={fileKind === "geojson"}
                    className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600 disabled:bg-paper-100 disabled:text-ink-400"
                  >
                    {GEOMETRY_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Description</label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Source</label>
                  <input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="Ex: IGN, data.gouv.fr..."
                    className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-ink-700">Date de la donnée</label>
                  <input
                    value={sourceDate}
                    onChange={(e) => setSourceDate(e.target.value)}
                    placeholder="Ex: 2026-07"
                    className="rounded-lg font-data w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-medium text-ink-700">Licence</label>
                  <input
                    value={license}
                    onChange={(e) => setLicense(e.target.value)}
                    placeholder="Ex: Licence Ouverte / Etalab 2.0"
                    className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
                  />
                </div>
              </div>

              {submitError && (
                <p className="border-l-2 border-signal-600 bg-signal-100 px-3 py-2 text-sm text-signal-600">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg flex items-center gap-2 bg-ink-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-copper-600 disabled:opacity-60"
              >
                {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                {isSubmitting
                  ? "Import en cours..."
                  : preview
                    ? `Créer la couche et importer ${preview.featureCount} objet(s)`
                    : "Créer la couche et importer"}
              </button>
            </>
          )}
        </form>
      )}
    </Cartouche>
  );
}
