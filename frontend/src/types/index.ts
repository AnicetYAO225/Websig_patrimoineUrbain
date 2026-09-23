// Types partagés côté frontend. Ils reflètent volontairement les schémas
// Pydantic du backend (app/schemas/*.py) pour que le typage TS et la
// validation Python restent cohérents.

export type UserRole = "SUPER_ADMIN" | "ADMIN" | "AGENT" | "CITIZEN";

export interface User {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  is_active: boolean;
  avatar_url: string | null;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  username: string;
  email: string;
  password: string;
}

export type GeometryType = "Point" | "LineString" | "Polygon";

export interface Layer {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  geometry_type: GeometryType;
  srid: number;
  is_visible: boolean;
  source: string | null;
  source_date: string | null;
  license: string | null;
  created_at: string;
  feature_count: number;
  // ... tes champs existants (id, name, slug, geometry_type, etc.)
  style_config?: LayerStyleConfig | null;
}

export interface LayerStyleConfig {
  field: string;
  colors: Record<string, string>;
  defaultColor: string;

  fill?: {
    enabled: boolean;   // fond activé ou transparent
    opacity: number;    // 0 = transparent, 1 = opaque
  };

  stroke?: {
    enabled: boolean;   // contour activé ou non
    color: string;     // couleur du contour
    width: number;     // épaisseur du contour
  };
}
export interface LayerCreatePayload {
  name: string;
  slug: string;
  description?: string;
  geometry_type: GeometryType;
  is_visible?: boolean;
  source?: string;
  source_date?: string;
  license?: string;
}

export interface ImportResult {
  imported_count: number;
  skipped_count: number;
  errors: string[];
}

// Géométrie GeoJSON générique (Point, LineString ou Polygon)
export interface GeoJSONGeometry {
  type: GeometryType;
  coordinates: any;
}

export interface GeoJSONFeature {
  type: "Feature";
  id: number;
  geometry: GeoJSONGeometry;
  properties: Record<string, any>;
}

export interface GeoJSONFeatureCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}
