import { apiClient } from "./client";
import type { GeoJSONFeature, GeoJSONFeatureCollection, GeoJSONGeometry, ImportResult } from "../types";

// ---------------------------------------------------------------------------
// CRUD de base sur les objets géographiques (features) d'une couche
// ---------------------------------------------------------------------------

export async function listFeatures(layerId: number): Promise<GeoJSONFeatureCollection> {
  const { data } = await apiClient.get(`/api/layers/${layerId}/features`);
  return data;
}

export async function createFeature(
  layerId: number,
  geometry: GeoJSONGeometry,
  properties: Record<string, any>
): Promise<GeoJSONFeature> {
  const { data } = await apiClient.post(`/api/layers/${layerId}/features`, {
    geometry,
    properties,
  });
  return data;
}

export async function updateFeature(
  featureId: number,
  properties: Record<string, any>
): Promise<GeoJSONFeature> {
  const { data } = await apiClient.put(`/api/features/${featureId}`, { properties });
  return data;
}

export async function deleteFeature(featureId: number): Promise<void> {
  await apiClient.delete(`/api/features/${featureId}`);
}

// ---------------------------------------------------------------------------
// Import en masse (GeoJSON)
// ---------------------------------------------------------------------------

export async function importFeatures(layerId: number, file: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await apiClient.post(`/api/layers/${layerId}/features/import`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

// ---------------------------------------------------------------------------
// Recherche spatiale avancée (par rayon ou par intersection avec une autre couche)
// ---------------------------------------------------------------------------

export async function searchFeaturesSpatial(
  layerId: number,
  params: { lng?: number; lat?: number; radiusM?: number; intersectsLayerId?: number }
): Promise<GeoJSONFeatureCollection> {
  const query = new URLSearchParams();
  if (params.lng != null) query.set("lng", String(params.lng));
  if (params.lat != null) query.set("lat", String(params.lat));
  if (params.radiusM != null) query.set("radius_m", String(params.radiusM));
  if (params.intersectsLayerId != null) query.set("intersects_layer_id", String(params.intersectsLayerId));

  const { data } = await apiClient.get(`/api/layers/${layerId}/features/search?${query.toString()}`);
  return data;
}

// ---------------------------------------------------------------------------
// Statistiques spatiales exactes (calcul serveur via PostGIS)
// ---------------------------------------------------------------------------

export interface ZoneSummaryResult {
  zone_id: number;
  zone_name: string;
  /** Renseigné si la couche cible est de type Point. */
  count?: number;
  /** Renseigné si la couche cible est de type LineString (longueur exacte, en km). */
  length_km?: number;
}

export async function getZoneSummary(
  zoneLayerId: number,
  targetLayerId: number
): Promise<{ zone_layer: string; target_layer: string; results: ZoneSummaryResult[] }> {
  const { data } = await apiClient.get(
    `/api/stats/zone-summary?zone_layer_id=${zoneLayerId}&target_layer_id=${targetLayerId}`
  );
  return data;
}
export async function importTabularFeatures(
  layerId: number,
  file: File,
  mapping?: { latField?: string; lonField?: string; wktField?: string }
): Promise<ImportResult | { needs_mapping: true; columns: string[] }> {
  const formData = new FormData();
  formData.append("file", file);
  if (mapping?.latField) formData.append("lat_field", mapping.latField);
  if (mapping?.lonField) formData.append("lon_field", mapping.lonField);
  if (mapping?.wktField) formData.append("wkt_field", mapping.wktField);
  try {
    const { data } = await apiClient.post(`/api/layers/${layerId}/features/import-tabular`, formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (err: any) {
    if (err.response?.status === 422 && err.response.data?.needs_mapping) {
      return err.response.data;
    }
    throw err;
  }
}

export async function importShapefile(layerId: number, zipFile: File): Promise<ImportResult> {
  const formData = new FormData();
  formData.append("file", zipFile);
  const { data } = await apiClient.post(`/api/layers/${layerId}/features/import-shapefile`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}