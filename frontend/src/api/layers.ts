import { apiClient } from "./client";
import type { Layer, LayerCreatePayload } from "../types";

import type { LayerStyleConfig } from "../types";

export async function updateLayerStyle(layerId: number, styleConfig: LayerStyleConfig | null) {
  const { data } = await apiClient.put(`/api/layers/${layerId}`, { style_config: styleConfig });
  return data;
}

export async function listLayers(): Promise<Layer[]> {
  const { data } = await apiClient.get("/api/layers");
  return data;
}

export async function createLayer(payload: LayerCreatePayload): Promise<Layer> {
  const { data } = await apiClient.post("/api/layers", payload);
  return data;
}

export async function updateLayer(id: number, payload: Partial<LayerCreatePayload>): Promise<Layer> {
  const { data } = await apiClient.put(`/api/layers/${id}`, payload);
  return data;
}

export async function deleteLayer(id: number): Promise<void> {
  await apiClient.delete(`/api/layers/${id}`);
}
