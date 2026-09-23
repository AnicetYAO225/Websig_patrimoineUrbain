import { apiClient } from "./client";

export interface FeatureHistoryEntry {
    id: number;
    action: "created" | "updated" | "deleted";
    properties_before: Record<string, any> | null;
    properties_after: Record<string, any> | null;
    changed_by_id: number | null;
    changed_at: string;
}

export async function getFeatureHistory(featureId: number): Promise<FeatureHistoryEntry[]> {
    const { data } = await apiClient.get(`/api/features/${featureId}/history`);
    return data;
}