import { apiClient } from "./client";
import type {
  CloudBBox,
  CloudCategory,
  CloudImportPayload,
  CloudImportResponse,
  CloudSearchResponse,
  CloudSource,
} from "../types/cloudSources";

export async function listCloudSources(category?: CloudCategory): Promise<CloudSource[]> {
  const { data } = await apiClient.get("/api/cloud-sources", {
    params: category ? { category } : undefined,
  });
  return data;
}

export async function searchCloudSource(
  sourceId: string,
  bbox: CloudBBox,
  options?: { q?: string; date_from?: string; date_to?: string }
): Promise<CloudSearchResponse> {
  const { data } = await apiClient.get(`/api/cloud-sources/${sourceId}/search`, {
    params: { ...bbox, ...options },
  });
  return data;
}

export async function importCloudDataset(
  sourceId: string,
  payload: CloudImportPayload
): Promise<CloudImportResponse> {
  const { data } = await apiClient.post(`/api/cloud-sources/${sourceId}/import`, payload);
  return data;
}
