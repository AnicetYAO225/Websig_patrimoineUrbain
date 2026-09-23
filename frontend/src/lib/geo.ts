import type { GeoJSONGeometry } from "../types";

/**
 * Calcule un point représentatif (centre approximatif) d'une géométrie
 * GeoJSON, utilisé pour centrer la carte sur un résultat de recherche.
 * Ce n'est pas un vrai centroïde géométrique (pas besoin de turf.js pour
 * ça) : une simple moyenne des coordonnées suffit largement pour zoomer
 * au bon endroit.
 */
export function getGeometryCenter(geometry: GeoJSONGeometry): [number, number] {
  const points: [number, number][] = [];

  function collect(coords: any, depth: number) {
    if (depth === 0) {
      points.push([coords[0], coords[1]]);
      return;
    }
    for (const c of coords) collect(c, depth - 1);
  }

  // Profondeur de nesting des coordonnées selon le type de géométrie
  const depthByType: Record<string, number> = {
    Point: 0,
    MultiPoint: 1,
    LineString: 1,
    MultiLineString: 2,
    Polygon: 2,
    MultiPolygon: 3,
  };

  const depth = depthByType[geometry.type] ?? 0;
  collect(geometry.coordinates, depth);

  if (points.length === 0) return [0, 0];
  const lon = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const lat = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [lon, lat];
}
