import { apiClient } from "./client";

export type ExportFormat = "geojson" | "csv" | "xlsx" | "shapefile";

export async function exportLayer(layerId: number, format: ExportFormat): Promise<void> {
    const response = await apiClient.get(`/api/layers/${layerId}/export`, {
        params: { format },
        responseType: "blob",
    });
    downloadBlob(response.data, extractFilename(response.headers["content-disposition"]) ?? `export.${format}`);
}

export interface ExtractionParams {
    withinLayerId: number;
    withinFeatureId?: number;
    predicate: "within" | "intersects" | "contains";
    format: ExportFormat;
}

export async function extractFeatures(layerId: number, params: ExtractionParams): Promise<void> {
    const response = await apiClient.post(
        `/api/layers/${layerId}/extract`,
        {
            within_layer_id: params.withinLayerId,
            within_feature_id: params.withinFeatureId ?? null,
            predicate: params.predicate,
            format: params.format,
        },
        { responseType: "blob" }
    );
    downloadBlob(response.data, extractFilename(response.headers["content-disposition"]) ?? `extraction.${params.format}`);
}

function extractFilename(contentDisposition?: string): string | null {
    if (!contentDisposition) return null;
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    return match ? match[1] : null;
}

function downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.URL.revokeObjectURL(url);
}