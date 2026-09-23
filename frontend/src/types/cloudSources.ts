/**
 * Types pour le module "Données cloud" (catalogue de sources cloud
 * gratuites, recherche et import en tant que nouvelle couche).
 *
 * Miroir des schémas Pydantic dans app/cloud_sources/schemas.py.
 * Tu peux fusionner ce fichier dans ton ../types.ts existant, ou le
 * garder séparé et importer depuis "./types/cloudSources" — les deux
 * fonctionnent, adapte le chemin d'import dans cloudSourcesApi.ts et
 * CloudSourcesPanel.tsx en conséquence si tu fusionnes.
 */

export type CloudCategory =
  | "satellite"
  | "fire"
  | "agriculture"
  | "water"
  | "environment"
  | "disaster"
  | "osm";

export const CLOUD_CATEGORY_LABELS: Record<CloudCategory, string> = {
  satellite: "Satellite",
  fire: "Feux",
  agriculture: "Agriculture",
  water: "Eau",
  environment: "Environnement",
  disaster: "Catastrophes",
  osm: "OpenStreetMap",
};

export interface CloudSource {
  id: string;
  name: string;
  category: CloudCategory;
  description: string;
  provider: string;
  is_free: boolean;
  requires_api_key: boolean;
  default_zoom_hint?: string | null;
}

export interface CloudDatasetResult {
  dataset_id: string;
  title: string;
  description?: string | null;
  thumbnail_url?: string | null;
  date?: string | null;
  geometry_type?: string | null;
  feature_count?: number | null;
  license?: string | null;
  source_url?: string | null;
}

export interface CloudSearchResponse {
  source_id: string;
  results: CloudDatasetResult[];
}

export interface CloudBBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface CloudImportPayload {
  dataset_id: string;
  layer_name: string;
  bbox?: CloudBBox | null;
}

export interface CloudImportResponse {
  layer_id: number;
  feature_count: number;
}
