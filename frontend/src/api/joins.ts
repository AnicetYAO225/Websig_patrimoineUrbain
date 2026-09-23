import { apiClient } from "./client";

export interface JoinResult {
    updated_count: number;
    unmatched_count: number;
}

export async function joinAttribute(
    targetLayerId: number,
    payload: { source_layer_id: number; target_key_field: string; source_key_field: string; fields?: string[] | null }
): Promise<JoinResult> {
    const { data } = await apiClient.post(`/api/layers/${targetLayerId}/join-attribute`, payload);
    return data;
}

export async function joinSpatial(
    targetLayerId: number,
    payload: { source_layer_id: number; predicate: "intersects" | "within" | "contains"; fields?: string[] | null }
): Promise<JoinResult> {
    const { data } = await apiClient.post(`/api/layers/${targetLayerId}/join-spatial`, payload);
    return data;
}