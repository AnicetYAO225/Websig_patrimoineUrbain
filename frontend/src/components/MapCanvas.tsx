import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  length as turfLength,
  distance as turfDistance,
  area as turfArea,
  circle as turfCircle,
  bbox as turfBbox,
} from "@turf/turf";
import { Cartouche } from "./Panel";
import { createPortal } from "react-dom";
import {
  Map as MaplibreMap,
  NavigationControl,
  ScaleControl,
  Popup,
  type GeoJSONSource,
  type MapMouseEvent,
  type MapGeoJSONFeature,
  type StyleSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import {
  Layers as LayersIcon,
  MousePointer2,
  CircleDot,
  Spline,
  Hexagon,
  Printer,
  Check,
  Ruler,
  Square,
  Undo2,
  Redo2,
  LocateFixed,
} from "lucide-react";
import {
  TerraDraw,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawModeUndoRedo,
  TerraDrawUndoRedoKeyboardShortcuts,
} from "terra-draw";
import { TerraDrawMapLibreGLAdapter } from "terra-draw-maplibre-gl-adapter";
import type { GeoJSONFeatureCollection, GeoJSONGeometry, GeometryType } from "../types";

const MAP_STYLE: StyleSpecification = {
  version: 8,
  glyphs: "https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
  sources: {
    osm: {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
    topo: {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenTopoMap (CC-BY-SA) © OpenStreetMap contributors",
    },
    relief: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, USGS, NOAA",
    },
    // --- Sources pour la vue 3D (relief + bâtiments), toutes deux gratuites et sans clé ---
    "terrain-dem": {
      type: "raster-dem",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      tileSize: 256,
      encoding: "terrarium",
      maxzoom: 15,
      attribution: "Terrain © Mapzen, Tilezen, OpenStreetMap contributors",
    },
    "buildings-3d": {
      type: "vector",
      url: "https://tiles.openfreemap.org/planet",
      attribution: "OpenFreeMap © OpenMapTiles, données © OpenStreetMap contributors",
    },
  },
  layers: [
    { id: "basemap-osm", type: "raster", source: "osm" },
    { id: "basemap-satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
    { id: "basemap-topo", type: "raster", source: "topo", layout: { visibility: "none" } },
    { id: "basemap-relief", type: "raster", source: "relief", layout: { visibility: "none" } },
    // --- Couches 3D, masquées par défaut (activées via le bouton "vue 3D") ---
    {
      id: "hillshade",
      type: "hillshade",
      source: "terrain-dem",
      layout: { visibility: "none" },
      paint: { "hillshade-exaggeration": 0.5 },
    },
    {
      id: "buildings-3d-layer",
      type: "fill-extrusion",
      source: "buildings-3d",
      "source-layer": "building",
      minzoom: 14,
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": "#c9c2b8",
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.85,
      },
    },
  ],
};

const DEFAULT_CENTER: [number, number] = [4.365, 45.4898];

type BasemapId = "osm" | "satellite" | "topo" | "relief";

const BASEMAP_OPTIONS: { id: BasemapId; label: string }[] = [
  { id: "osm", label: "Plan" },
  { id: "satellite", label: "Satellite" },
  { id: "topo", label: "Topographique" },
  { id: "relief", label: "Relief" },
];

const LABEL_FIELD_EXPR: any = [
  "coalesce",
  ["get", "nom"],
  ["get", "name"],
  ["get", "NOM"],
  ["get", "libelle"],
  ["get", "label"],
  "",
];

const PAGE_WIDTH_MM = 297;
const PAGE_HEIGHT_MM = 210;
const PAGE_MARGIN_MM = 10;
const HEADER_HEIGHT_MM = 16;
const FOOTER_HEIGHT_MM = 22;
const FRAME_GAP_MM = 3;
const FRAME_WIDTH_MM = PAGE_WIDTH_MM - PAGE_MARGIN_MM * 2;
const FRAME_HEIGHT_MM = PAGE_HEIGHT_MM - PAGE_MARGIN_MM * 2 - HEADER_HEIGHT_MM - FOOTER_HEIGHT_MM - FRAME_GAP_MM * 2;
const FRAME_ASPECT = FRAME_WIDTH_MM / FRAME_HEIGHT_MM;

export interface MapLayerInput {
  id: number;
  color: string;
  geometryType: GeometryType;
  data: GeoJSONFeatureCollection;
  visible: boolean;
  symbology?: {
    field: string;
    colors: Record<string, string>;
    defaultColor: string;
    fill?: { enabled?: boolean; opacity?: number } | null;
  } | null;
  showLabels?: boolean;
}

interface ScaleBarInfo {
  width: number;
  label: string;
}

interface MapBoundsInfo {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface AtlasPage {
  title: string;
  snapshot: string;
  bounds: MapBoundsInfo;
  canvasAspect: number;
}

export interface MapCanvasHandle {
  flyTo: (lng: number, lat: number, popupHtml?: string) => void;
  /** `includedLayerIds` : si fourni, seules ces couches sont visibles sur l'impression, indépendamment de leur affichage actuel sur la carte. */
  openPrintModal: (includedLayerIds?: number[]) => void;
  generateAtlas: (
    layerId: number,
    titleField: string,
    includedLayerIds?: number[],
    onProgress?: (current: number, total: number) => void
  ) => Promise<void>;
  /** Emprise géographique actuellement visible (WGS84), utilisée pour les recherches "sur cette zone" (ex: données cloud). */
  getBounds: () => { west: number; south: number; east: number; north: number } | null;
}

interface DrawTarget {
  id: number;
  name: string;
  geometryType: GeometryType;
}

interface MapCanvasProps {
  pickMode?: boolean;
  onPointPicked?: (lng: number, lat: number) => void;
  highlightFeatures?: GeoJSONFeatureCollection | null;
  searchCenter?: { lng: number; lat: number } | null;
  searchRadiusM?: number | null;
  layers: MapLayerInput[];
  layerLabel: (layerId: number) => string;
  drawingGeometryType: GeometryType | null;
  onFeatureDrawn: (geometry: GeoJSONGeometry) => void;
  drawTargets?: DrawTarget[];
  activeDrawLayerId?: number | null;
  onToggleDrawTarget?: (layerId: number) => void;
  onEditFeature?: (layerId: number, feature: MapGeoJSONFeature) => void;
  onDeleteFeature?: (layerId: number, feature: MapGeoJSONFeature) => void;
  onShowHistory?: (feature: MapGeoJSONFeature) => void;
}

function ToolButton({
  icon: Icon,
  title,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: ComponentType<{ size?: number }>;
  title: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${disabled
        ? "cursor-not-allowed text-ink-300"
        : active
          ? "bg-copper-600 text-white"
          : "text-ink-600 hover:bg-paper-100"
        }`}
    >
      <Icon size={15} />
    </button>
  );
}

/** Icône "vue 3D" façon pastille papier plié, en tons gris-noir sobres (pro), inspirée du symbole fourni. */
function Icon3D({ size = 15, active = false }: { size?: number; active?: boolean }) {
  const dark = active ? "#ffffff" : "#1c1917";
  const mid = active ? "#e7e5e4" : "#57534e";
  const light = active ? "#d6d3d1" : "#78716c";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M2.5 12L12 3.5L21.5 12L12 20.5L2.5 12Z" fill={dark} />
      <path d="M2.5 12L12 15.2V20.5L2.5 12Z" fill={light} />
      <path d="M21.5 12L12 15.2V20.5L21.5 12Z" fill={mid} />
    </svg>
  );
}

function LegendSwatch({ geometryType, color }: { geometryType: GeometryType; color: string }) {
  if (geometryType === "Point") {
    return (
      <svg width="14" height="14" className="flex-shrink-0" aria-hidden>
        <circle cx="7" cy="7" r="5" fill={color} stroke="#ffffff" strokeWidth="1.5" />
      </svg>
    );
  }
  if (geometryType === "LineString") {
    return (
      <svg width="14" height="14" className="flex-shrink-0" aria-hidden>
        <line x1="1" y1="11" x2="13" y2="3" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" className="flex-shrink-0" aria-hidden>
      <rect x="1.5" y="1.5" width="11" height="11" fill="none" stroke={color} strokeWidth="2" />
    </svg>
  );
}

function NorthArrow() {
  return (
    <svg width="22" height="28" viewBox="0 0 26 34" aria-hidden>
      <polygon points="13,0 20,24 13,18 6,24" fill="#1c1917" />
      <text x="13" y="33" textAnchor="middle" fontSize="10" fontWeight="700" fill="#1c1917">
        N
      </text>
    </svg>
  );
}

function colorExpression(layer: MapLayerInput): any {
  if (!layer.symbology) {
    return layer.color;
  }

  const { field, colors, defaultColor } = layer.symbology;

  // Mode couleur unique
  if (!field || Object.keys(colors).length === 0) {
    return defaultColor;
  }

  // Mode par attribut
  const expr: any[] = ["match", ["get", field]];

  for (const [value, color] of Object.entries(colors)) {
    expr.push(value, color);
  }

  expr.push(defaultColor);

  return expr;
}

function fillOpacityForLayer(layer: MapLayerInput): number {
  if (layer.symbology?.fill?.enabled === false) return 0;
  return layer.symbology?.fill?.opacity ?? 0.35;
}

/**
 * Barre d'échelle calculée pour un rendu "cover" (l'image remplit le cadre
 * bord à bord, quitte à en recadrer les côtés) : on détermine la fraction
 * de la largeur géographique réellement visible après recadrage, puis on
 * calcule l'échelle sur la largeur du cadre (qui est toujours entièrement
 * remplie avec ce mode de rendu, contrairement à un rendu "contain").
 */
function computeScaleBarForPage(bounds: MapBoundsInfo, canvasAspect: number, maxBarWidthMm = 55): ScaleBarInfo {
  const midLat = (bounds.north + bounds.south) / 2;
  const totalMeters = turfDistance([bounds.west, midLat], [bounds.east, midLat], { units: "meters" });

  const visibleFraction = canvasAspect > FRAME_ASPECT ? FRAME_ASPECT / canvasAspect : 1;
  const visibleMeters = totalMeters * visibleFraction;
  const metersPerMm = visibleMeters / FRAME_WIDTH_MM;

  const niceSteps = [1, 2, 5];
  let niceDistance = 1;
  for (let exp = -1; exp <= 6; exp++) {
    for (const step of niceSteps) {
      const candidate = step * Math.pow(10, exp);
      if (candidate / metersPerMm <= maxBarWidthMm) niceDistance = candidate;
    }
  }
  const width = niceDistance / metersPerMm;
  const label = niceDistance >= 1000 ? `${niceDistance / 1000} km` : `${niceDistance} m`;
  return { width, label };
}

function CornerCoordinates({ bounds }: { bounds: MapBoundsInfo }) {
  return (
    <>
      <span className="absolute left-1 top-1 bg-white/85 px-1 font-data text-[8px] text-ink-700">
        {bounds.north.toFixed(4)}, {bounds.west.toFixed(4)}
      </span>
      <span className="absolute right-1 top-1 bg-white/85 px-1 font-data text-[8px] text-ink-700">
        {bounds.north.toFixed(4)}, {bounds.east.toFixed(4)}
      </span>
      <span className="absolute bottom-1 left-1 bg-white/85 px-1 font-data text-[8px] text-ink-700">
        {bounds.south.toFixed(4)}, {bounds.west.toFixed(4)}
      </span>
      <span className="absolute bottom-1 right-1 bg-white/85 px-1 font-data text-[8px] text-ink-700">
        {bounds.south.toFixed(4)}, {bounds.east.toFixed(4)}
      </span>
    </>
  );
}

/** Une page d'impression à taille FIXE (297 x 210 mm), image remplie bord à bord (object-fit: cover — pas de bandes vides). */
function PrintPage({
  title,
  subtitle,
  snapshot,
  bounds,
  canvasAspect,
  legendLayers,
  layerLabel,
}: {
  title: string;
  subtitle: string;
  snapshot: string;
  bounds: MapBoundsInfo;
  canvasAspect: number;
  legendLayers: MapLayerInput[];
  layerLabel: (layerId: number) => string;
}) {
  const scaleBar = computeScaleBarForPage(bounds, canvasAspect);

  return (
    <div
      className="atlas-page bg-white"
      style={{ width: `${PAGE_WIDTH_MM}mm`, height: `${PAGE_HEIGHT_MM}mm`, padding: `${PAGE_MARGIN_MM}mm`, boxSizing: "border-box" }}
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-shrink-0 items-center gap-3" style={{ height: `${HEADER_HEIGHT_MM}mm` }}>
          <img src="/logo-mark.png" alt="" style={{ height: "10mm", width: "10mm", objectFit: "contain" }} />
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-lg font-semibold text-ink-900">{title}</h1>
            <p className="truncate text-[10px] text-ink-500">{subtitle}</p>
          </div>
        </div>

        <div
          className="relative flex-1 overflow-hidden border-2 border-ink-900"
          style={{ marginTop: `${FRAME_GAP_MM}mm`, marginBottom: `${FRAME_GAP_MM}mm` }}
        >
          <img
            src={snapshot}
            alt={title}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
          <CornerCoordinates bounds={bounds} />
        </div>

        <div
          className="flex flex-shrink-0 items-end justify-between gap-6 border-t-2 border-ink-900 pt-1"
          style={{ height: `${FOOTER_HEIGHT_MM}mm` }}
        >
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-data text-[9px] font-medium uppercase tracking-widest text-ink-400">Légende</p>
            <div className="flex flex-wrap gap-3">
              {legendLayers.map((l) => (
                <span key={l.id} className="flex items-center gap-1.5 text-[10px] text-ink-700">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                  {layerLabel(l.id)}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-shrink-0 flex-col items-center">
            <div className="flex h-1.5" style={{ width: `${scaleBar.width}mm` }}>
              <div className="h-full flex-1 bg-ink-900" />
              <div className="h-full flex-1 border border-ink-900 bg-white" />
            </div>
            <span className="mt-1 font-data text-[9px] text-ink-600">0 — {scaleBar.label}</span>
          </div>

          <div className="flex-shrink-0">
            <NorthArrow />
          </div>
        </div>
      </div>
    </div>
  );
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(
  {
    pickMode = false,
    onPointPicked,
    highlightFeatures = null,
    searchCenter = null,
    searchRadiusM = null,
    layers,
    layerLabel,
    drawingGeometryType,
    onFeatureDrawn,
    drawTargets = [],
    activeDrawLayerId = null,
    onToggleDrawTarget,
    onEditFeature,
    onDeleteFeature,
    onShowHistory,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const drawRef = useRef<TerraDraw | null>(null);
  const isStyleReadyRef = useRef(false);
  const pendingModeRef = useRef<string | null>(null);
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const onFeatureDrawnRef = useRef(onFeatureDrawn);
  onFeatureDrawnRef.current = onFeatureDrawn;
  const onEditFeatureRef = useRef(onEditFeature);
  onEditFeatureRef.current = onEditFeature;
  const onDeleteFeatureRef = useRef(onDeleteFeature);
  onDeleteFeatureRef.current = onDeleteFeature;
  const onShowHistoryRef = useRef(onShowHistory);
  onShowHistoryRef.current = onShowHistory;
  const pickModeRef = useRef(false);
  pickModeRef.current = pickMode;
  const onPointPickedRef = useRef(onPointPicked);
  onPointPickedRef.current = onPointPicked;

  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printTitle, setPrintTitle] = useState("Carte — Patrimoine Urbain");
  const [printSnapshot, setPrintSnapshot] = useState<string | null>(null);
  const [printBounds, setPrintBounds] = useState<MapBoundsInfo | null>(null);
  const [printCanvasAspect, setPrintCanvasAspect] = useState<number>(1);
  const [printLegendLayers, setPrintLegendLayers] = useState<MapLayerInput[]>([]);
  const [atlasPages, setAtlasPages] = useState<AtlasPage[] | null>(null);
  const [atlasLegendLayers, setAtlasLegendLayers] = useState<MapLayerInput[]>([]);

  const [basemap, setBasemap] = useState<BasemapId>("osm");
  const [is3D, setIs3D] = useState(false);
  const [cursorCoords, setCursorCoords] = useState<{ lng: number; lat: number } | null>(null);
  const [measureMode, setMeasureModeState] = useState<"distance" | "area" | null>(null);
  const [measureResult, setMeasureResult] = useState<string | null>(null);
  const measureModeRef = useRef<"distance" | "area" | null>(null);
  const [basemapMenuOpen, setBasemapMenuOpen] = useState(false);
  const basemapMenuRef = useRef<HTMLDivElement>(null);
  const [undoSize, setUndoSize] = useState(0);
  const [redoSize, setRedoSize] = useState(0);

  function setMeasureMode(mode: "distance" | "area" | null) {
    measureModeRef.current = mode;
    setMeasureModeState(mode);
    setMeasureResult(null);
    const drawMode = mode === "distance" ? "linestring" : mode === "area" ? "polygon" : "static";
    pendingModeRef.current = drawMode;
    drawRef.current?.setMode(drawMode);
  }

  const syncLayersRef = useRef<() => void>(() => { });

  /** Applique temporairement une visibilité personnalisée (indépendante de l'état normal de la carte) pour la capture d'impression/atlas. */
  function applyPrintVisibility(includedLayerIds?: number[]) {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of layersRef.current) {
      const sourceId = `layer-${layer.id}`;
      const shouldShow = includedLayerIds ? includedLayerIds.includes(layer.id) : layer.visible;
      const visibility = shouldShow ? "visible" : "none";
      for (const suffix of ["circle", "line", "line-halo", "fill", "outline", "outline-halo"]) {
        const id = `${sourceId}-${suffix}`;
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
      }
      const labelId = `${sourceId}-label`;
      if (map.getLayer(labelId)) {
        map.setLayoutProperty(labelId, "visibility", shouldShow && layer.showLabels ? "visible" : "none");
      }
    }
  }

  /** Remet la carte dans son état normal (piloté par les props React) après une capture. */
  function restoreNormalVisibility() {
    syncLayersRef.current();
  }

  function handleOpenPrint(includedLayerIds?: number[]) {
    const map = mapRef.current;
    if (!map) return;

    const legend = includedLayerIds
      ? layersRef.current.filter((l) => includedLayerIds.includes(l.id))
      : layersRef.current.filter((l) => l.visible);
    setPrintLegendLayers(legend);

    applyPrintVisibility(includedLayerIds);
    map.once("idle", () => {
      const canvas = map.getCanvas();
      setPrintSnapshot(canvas.toDataURL("image/png"));
      setPrintCanvasAspect(canvas.width / canvas.height);
      const bounds = map.getBounds();
      setPrintBounds({
        north: bounds.getNorth(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        west: bounds.getWest(),
      });
      restoreNormalVisibility();
      setPrintModalOpen(true);
    });
    map.triggerRepaint();
  }

  async function handleGenerateAtlas(
    layerId: number,
    titleField: string,
    includedLayerIds?: number[],
    onProgress?: (current: number, total: number) => void
  ) {
    const map = mapRef.current;
    if (!map) return;
    const layer = layersRef.current.find((l) => l.id === layerId);
    if (!layer || !layer.data) return;

    const legend = includedLayerIds
      ? layersRef.current.filter((l) => includedLayerIds.includes(l.id))
      : layersRef.current.filter((l) => l.visible);
    setAtlasLegendLayers(legend);

    applyPrintVisibility(includedLayerIds);

    const originalCenter = map.getCenter();
    const originalZoom = map.getZoom();
    const features = layer.data.features;
    const pages: AtlasPage[] = [];

    for (let i = 0; i < features.length; i++) {
      const feature = features[i];
      onProgress?.(i + 1, features.length);
      try {
        const [minX, minY, maxX, maxY] = turfBbox(feature as any);
        await new Promise<void>((resolve) => {
          map.fitBounds(
            [
              [minX, minY],
              [maxX, maxY],
            ],
            { padding: 60, duration: 0 }
          );
          map.once("idle", () => {
            const canvas = map.getCanvas();
            const bounds = map.getBounds();
            pages.push({
              title: String(feature.properties?.[titleField] ?? `Objet #${feature.id}`),
              snapshot: canvas.toDataURL("image/png"),
              bounds: {
                north: bounds.getNorth(),
                south: bounds.getSouth(),
                east: bounds.getEast(),
                west: bounds.getWest(),
              },
              canvasAspect: canvas.width / canvas.height,
            });
            resolve();
          });
        });
      } catch {
        // géométrie invalide pour cette entité : page ignorée sans bloquer le reste de l'atlas
      }
    }

    map.flyTo({ center: originalCenter, zoom: originalZoom, duration: 0 });
    restoreNormalVisibility();

    setAtlasPages(pages);
    await new Promise((resolve) => setTimeout(resolve, 150));
    window.print();
  }

  useImperativeHandle(ref, () => ({
    flyTo(lng, lat, popupHtml) {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 13), speed: 1.2 });
      if (popupHtml) {
        new Popup({ maxWidth: "280px" }).setLngLat([lng, lat]).setHTML(popupHtml).addTo(map);
      }
    },
    openPrintModal(includedLayerIds) {
      handleOpenPrint(includedLayerIds);
    },
    generateAtlas(layerId, titleField, includedLayerIds, onProgress) {
      return handleGenerateAtlas(layerId, titleField, includedLayerIds, onProgress);
    },
    getBounds() {
      const map = mapRef.current;
      if (!map) return null;
      const b = map.getBounds();
      return { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() };
    },
  }));

  useEffect(() => {
    if (!atlasPages) return;
    function handleAfterPrint() {
      setAtlasPages(null);
    }
    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [atlasPages]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MaplibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: DEFAULT_CENTER,
      zoom: 11,
      attributionControl: { compact: true },
      preserveDrawingBuffer: true,
    });
    mapRef.current = map;

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(new ScaleControl({ unit: "metric" }), "bottom-left");

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);

    map.on("error", (e) => {
      console.error("Erreur MapLibre :", e.error?.message ?? e);
    });

    map.on("click", (e) => {
      if (pickModeRef.current) {
        onPointPickedRef.current?.(e.lngLat.lng, e.lngLat.lat);
      }
    });

    map.on("mousemove", (e) => setCursorCoords({ lng: e.lngLat.lng, lat: e.lngLat.lat }));
    map.on("mouseout", () => setCursorCoords(null));

    map.on("load", () => {
      isStyleReadyRef.current = true;
      map.resize();
      syncLayersRef.current();

      try {
        const draw = new TerraDraw({
          adapter: new TerraDrawMapLibreGLAdapter({ map: map as any }),
          modes: [
            new TerraDrawPointMode(),
            new TerraDrawLineStringMode({ snapping: { toCoordinate: true, toLine: true } }),
            new TerraDrawPolygonMode({ snapping: { toCoordinate: true, toLine: true } }),
          ],
          undoRedo: {
            modeLevel: new TerraDrawModeUndoRedo({ maxStackSize: 50 }),
            keyboardShortcuts: new TerraDrawUndoRedoKeyboardShortcuts(),
          },
        });

        draw.on("history", ({ undoSize, redoSize }) => {
          setUndoSize(undoSize);
          setRedoSize(redoSize);
        });

        draw.start();
        draw.on("finish", (id) => {
          const feature = draw.getSnapshotFeature(id);
          if (!feature) return;

          if (measureModeRef.current === "distance") {
            const km = turfLength(feature as any, { units: "kilometers" });
            setMeasureResult(km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`);
            draw.removeFeatures([id]);
            return;
          }
          if (measureModeRef.current === "area") {
            const m2 = turfArea(feature as any);
            setMeasureResult(m2 < 10000 ? `${Math.round(m2)} m²` : `${(m2 / 10000).toFixed(2)} ha`);
            draw.removeFeatures([id]);
            return;
          }

          onFeatureDrawnRef.current(feature.geometry as GeoJSONGeometry);
          draw.removeFeatures([id]);
        });
        drawRef.current = draw;
        if (pendingModeRef.current) draw.setMode(pendingModeRef.current);
      } catch (err) {
        console.error("Initialisation du dessin (terra-draw) impossible :", err);
      }
    });

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
      isStyleReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = pickMode ? "crosshair" : "";
  }, [pickMode]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (basemapMenuRef.current && !basemapMenuRef.current.contains(e.target as Node)) {
        setBasemapMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleReadyRef.current) return;
    if (!map.getLayer("basemap-osm")) return;
    for (const option of BASEMAP_OPTIONS) {
      map.setLayoutProperty(`basemap-${option.id}`, "visibility", basemap === option.id ? "visible" : "none");
    }
  }, [basemap]);

  useEffect(() => {
    const mode =
      drawingGeometryType === "Point"
        ? "point"
        : drawingGeometryType === "LineString"
          ? "linestring"
          : drawingGeometryType === "Polygon"
            ? "polygon"
            : "static";
    pendingModeRef.current = mode;
    drawRef.current?.setMode(mode);
  }, [drawingGeometryType]);

  useEffect(() => {
    function syncLayers() {
      const map = mapRef.current;
      if (!map) return;

      for (const layer of layers) {
        try {
          const sourceId = `layer-${layer.id}`;
          const source = map.getSource(sourceId) as GeoJSONSource | undefined;

          if (source) {
            source.setData(layer.data as any);
          } else {
            map.addSource(sourceId, { type: "geojson", data: layer.data as any });

            if (layer.geometryType === "Point") {
              map.addLayer({
                id: `${sourceId}-circle`,
                type: "circle",
                source: sourceId,
                paint: {
                  "circle-radius": 7,
                  "circle-color": colorExpression(layer),
                  "circle-stroke-width": 2.5,
                  "circle-stroke-color": "#ffffff",
                },
              });
              map.addLayer({
                id: `${sourceId}-label`,
                type: "symbol",
                source: sourceId,
                layout: {
                  "text-field": LABEL_FIELD_EXPR,
                  "text-size": 11,
                  "text-font": ["Open Sans Regular"],
                  "text-anchor": "top",
                  "text-offset": [0, 0.8],
                  "text-allow-overlap": false,
                  visibility: "none",
                },
                paint: {
                  "text-color": colorExpression(layer),
                  "text-halo-color": "#ffffff",
                  "text-halo-width": 1.4,
                },
              });
            } else if (layer.geometryType === "LineString") {
              map.addLayer({
                id: `${sourceId}-line-halo`,
                type: "line",
                source: sourceId,
                paint: { "line-color": "#000000", "line-width": 6, "line-opacity": 0.9 },
                layout: { "line-cap": "round", "line-join": "round" },
              });
              map.addLayer({
                id: `${sourceId}-line`,
                type: "line",
                source: sourceId,
                paint: { "line-color": colorExpression(layer), "line-width": 3.5 },
                layout: { "line-cap": "round", "line-join": "round" },
              });
              map.addLayer({
                id: `${sourceId}-label`,
                type: "symbol",
                source: sourceId,
                layout: {
                  "text-field": LABEL_FIELD_EXPR,
                  "text-size": 11,
                  "text-font": ["Open Sans Regular"],
                  "symbol-placement": "line",
                  "text-allow-overlap": false,
                  visibility: "none",
                },
                paint: {
                  "text-color": "#121111",
                  "text-halo-color": "#ffffff",
                  "text-halo-width": 1.4,
                },
              });
            } else {
              map.addLayer({
                id: `${sourceId}-fill`,
                type: "fill",
                source: sourceId,
                paint: {
                  "fill-color": colorExpression(layer),
                  "fill-opacity": fillOpacityForLayer(layer),
                },
              });
              map.addLayer({
                id: `${sourceId}-outline-halo`,
                type: "line",
                source: sourceId,
                paint: { "line-color": "#080808", "line-width": 5, "line-opacity": 0.9 },
                layout: { "line-join": "round" },
              });
              map.addLayer({
                id: `${sourceId}-outline`,
                type: "line",
                source: sourceId,
                paint: { "line-color": colorExpression(layer), "line-width": 2.5 },
                layout: { "line-join": "round" },
              });
              map.addLayer({
                id: `${sourceId}-label`,
                type: "symbol",
                source: sourceId,
                layout: {
                  "text-field": LABEL_FIELD_EXPR,
                  "text-size": 12,
                  "text-font": ["Open Sans Regular"],
                  "text-allow-overlap": false,
                  visibility: "none",
                },
                paint: {
                  "text-color": "#1c1917",
                  "text-halo-color": "#ffffff",
                  "text-halo-width": 1.6,
                },
              });
            }

            const clickLayerId = `${sourceId}-${layer.geometryType === "Point" ? "circle" : layer.geometryType === "LineString" ? "line" : "fill"}`;
            map.on("click", clickLayerId, (e: MapMouseEvent & { features?: MapGeoJSONFeature[] }) => {
              const feature = e.features?.[0];
              if (!feature) return;
              const props = feature.properties || {};
              const rows = Object.entries(props)
                .filter(([k]) => !["layer_id", "created_at", "updated_at"].includes(k))
                .map(([k, v]) => `<b>${k}</b>: ${v}`)
                .join("<br/>");

              const actionsHtml = `
    <div style="margin-top:8px;display:flex;gap:10px;">
      <button id="popup-edit-btn" style="font-size:11px;font-weight:600;color:#a6602e;cursor:pointer;">Modifier</button>
      <button id="popup-delete-btn" style="font-size:11px;font-weight:600;color:#b91c1c;cursor:pointer;">Supprimer</button>
      <button id="popup-history-btn" style="font-size:11px;font-weight:600;color:#374151;cursor:pointer;">Historique</button>
    </div>`;

              const popup = new Popup({ maxWidth: "280px" })
                .setLngLat(e.lngLat)
                .setHTML(`<strong>${layerLabel(layer.id)}</strong><br/>${rows || "—"}${actionsHtml}`)
                .addTo(map);

              const el = popup.getElement();
              el?.querySelector("#popup-edit-btn")?.addEventListener("click", () => {
                onEditFeatureRef.current?.(layer.id, feature);
                popup.remove();
              });
              el?.querySelector("#popup-delete-btn")?.addEventListener("click", () => {
                onDeleteFeatureRef.current?.(layer.id, feature);
                popup.remove();
              });
              el?.querySelector("#popup-history-btn")?.addEventListener("click", () => {
                onShowHistoryRef.current?.(feature);
                popup.remove();
              });
            });

            map.on("mouseenter", clickLayerId, () => {
              map.getCanvas().style.cursor = "pointer";
            });
            map.on("mouseleave", clickLayerId, () => {
              map.getCanvas().style.cursor = "";
            });
          }

          const expr = colorExpression(layer);
          if (map.getLayer(`${sourceId}-circle`)) map.setPaintProperty(`${sourceId}-circle`, "circle-color", expr);
          if (map.getLayer(`${sourceId}-line`)) map.setPaintProperty(`${sourceId}-line`, "line-color", expr);
          if (map.getLayer(`${sourceId}-outline`)) map.setPaintProperty(`${sourceId}-outline`, "line-color", expr);
          if (map.getLayer(`${sourceId}-fill`)) {
            map.setPaintProperty(`${sourceId}-fill`, "fill-color", expr);
            map.setPaintProperty(`${sourceId}-fill`, "fill-opacity", fillOpacityForLayer(layer));
          }

          const visibility = layer.visible ? "visible" : "none";
          for (const suffix of ["circle", "line", "line-halo", "fill", "outline", "outline-halo"]) {
            const layerId = `${sourceId}-${suffix}`;
            if (map.getLayer(layerId)) {
              map.setLayoutProperty(layerId, "visibility", visibility);
            }
          }

          const labelLayerId = `${sourceId}-label`;
          if (map.getLayer(labelLayerId)) {
            map.setLayoutProperty(labelLayerId, "visibility", layer.visible && layer.showLabels ? "visible" : "none");
          }
        } catch (err) {
          console.error(`Impossible d'afficher la couche "${layer.color}" (id ${layer.id}) sur la carte :`, err);
        }
      }
    }

    syncLayersRef.current = syncLayers;
    if (isStyleReadyRef.current) syncLayers();
  }, [layers, layerLabel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleReadyRef.current) return;

    const sourceId = "search-radius";
    const hasCircle = searchCenter && searchRadiusM && searchRadiusM > 0;

    const circleFeature = hasCircle
      ? turfCircle([searchCenter!.lng, searchCenter!.lat], searchRadiusM! / 1000, { steps: 64, units: "kilometers" })
      : null;
    const centerFeature = searchCenter
      ? {
        type: "Feature" as const,
        geometry: { type: "Point" as const, coordinates: [searchCenter.lng, searchCenter.lat] },
        properties: {},
      }
      : null;

    const data = {
      type: "FeatureCollection" as const,
      features: [circleFeature, centerFeature].filter(Boolean) as any[],
    };

    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    if (source) {
      source.setData(data as any);
    } else {
      map.addSource(sourceId, { type: "geojson", data: data as any });
      map.addLayer({
        id: `${sourceId}-fill`,
        type: "fill",
        source: sourceId,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.06 },
      });
      map.addLayer({
        id: `${sourceId}-outline`,
        type: "line",
        source: sourceId,
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "line-color": "#2563eb", "line-width": 2, "line-dasharray": [2, 2] },
      });
      map.addLayer({
        id: `${sourceId}-center`,
        type: "circle",
        source: sourceId,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 6,
          "circle-color": "#2563eb",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    }
  }, [searchCenter?.lng, searchCenter?.lat, searchRadiusM]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isStyleReadyRef.current) return;

    const sourceId = "search-highlight";
    const source = map.getSource(sourceId) as GeoJSONSource | undefined;
    const data = highlightFeatures ?? { type: "FeatureCollection" as const, features: [] };

    if (source) {
      source.setData(data as any);
    } else {
      map.addSource(sourceId, { type: "geojson", data: data as any });

      map.addLayer({
        id: `${sourceId}-outline-halo`,
        type: "line",
        source: sourceId,
        paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
      });
      map.addLayer({
        id: `${sourceId}-fill`,
        type: "fill",
        source: sourceId,
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.2 },
      });
      map.addLayer({
        id: `${sourceId}-outline`,
        type: "line",
        source: sourceId,
        paint: { "line-color": "#2563eb", "line-width": 3 },
      });

      map.addLayer({
        id: `${sourceId}-circle-halo`,
        type: "circle",
        source: sourceId,
        filter: ["==", ["geometry-type"], "Point"],
        paint: { "circle-radius": 14, "circle-color": "#2563eb", "circle-opacity": 0.25 },
      });
      map.addLayer({
        id: `${sourceId}-circle`,
        type: "circle",
        source: sourceId,
        filter: ["==", ["geometry-type"], "Point"],
        paint: {
          "circle-radius": 8,
          "circle-color": "#2563eb",
          "circle-stroke-width": 2.5,
          "circle-stroke-color": "#ffffff",
        },
      });
    }

    if (highlightFeatures && highlightFeatures.features.length > 0) {
      try {
        const [minX, minY, maxX, maxY] = turfBbox(highlightFeatures as any);
        map.fitBounds(
          [
            [minX, minY],
            [maxX, maxY],
          ],
          { padding: 80, maxZoom: 16, duration: 800 }
        );
      } catch {
        // bbox impossible à calculer (résultats vides ou géométrie invalide) : ignoré
      }
    }
  }, [highlightFeatures]);

  function handleLocateMe() {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas disponible sur cet appareil/navigateur.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current?.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 15,
        });
      },
      (err) => alert("Impossible d'obtenir votre position : " + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleCaptureGpsPoint() {
    if (!navigator.geolocation) {
      alert("La géolocalisation n'est pas disponible sur cet appareil/navigateur.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { longitude, latitude } = pos.coords;
        onFeatureDrawnRef.current({ type: "Point", coordinates: [longitude, latitude] });
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 16 });
      },
      (err) => alert("Impossible d'obtenir votre position : " + err.message),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function handleToggle3D() {
    const map = mapRef.current;
    if (!map) return;
    const next = !is3D;
    setIs3D(next);

    if (next) {
      map.setTerrain({ source: "terrain-dem", exaggeration: 1.4 });
      map.setLayoutProperty("hillshade", "visibility", "visible");
      map.setLayoutProperty("buildings-3d-layer", "visibility", "visible");
      map.easeTo({ pitch: 55, duration: 800 });
    } else {
      map.setTerrain(null);
      map.setLayoutProperty("hillshade", "visibility", "none");
      map.setLayoutProperty("buildings-3d-layer", "visibility", "none");
      map.easeTo({ pitch: 0, duration: 800 });
    }
  }

  function handleConfirmPrint() {
    setPrintModalOpen(false);
    setTimeout(() => window.print(), 50);
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute left-3 top-24 z-[5] flex flex-col gap-1 rounded-lg border border-ink-300/40 bg-white p-1.5 shadow-sm">
        <ToolButton
          icon={MousePointer2}
          title="Sélection / déplacement"
          active={activeDrawLayerId === null}
          onClick={() => {
            if (activeDrawLayerId !== null) onToggleDrawTarget?.(activeDrawLayerId);
          }}
        />
        <ToolButton icon={LocateFixed} title="Centrer sur ma position" onClick={handleLocateMe} />

        {drawTargets.length > 0 && (
          <>
            <div className="my-0.5 border-t border-ink-300/30" />

            {(["Point", "LineString", "Polygon"] as GeometryType[]).map((geomType) => {
              const target = drawTargets.find((t) => t.geometryType === geomType);
              if (!target) return null;
              const Icon = geomType === "Point" ? CircleDot : geomType === "LineString" ? Spline : Hexagon;
              const isActive = activeDrawLayerId === target.id;
              return (
                <ToolButton
                  key={geomType}
                  icon={Icon}
                  title={isActive ? "Annuler" : "Ajouter une entité"}
                  active={isActive}
                  onClick={() => onToggleDrawTarget?.(target.id)}
                />
              );
            })}
          </>
        )}

        <div className="my-0.5 border-t border-ink-300/30" />
        <ToolButton
          icon={Undo2}
          title="Annuler le dernier point"
          onClick={() => drawRef.current?.undo()}
          disabled={undoSize === 0}
        />
        <ToolButton
          icon={Redo2}
          title="Rétablir"
          onClick={() => drawRef.current?.redo()}
          disabled={redoSize === 0}
        />

        <div className="my-0.5 border-t border-ink-300/30" />
        <ToolButton
          icon={Ruler}
          title="Mesurer une distance"
          active={measureMode === "distance"}
          onClick={() => setMeasureMode(measureMode === "distance" ? null : "distance")}
        />
        <ToolButton
          icon={Square}
          title="Mesurer une surface"
          active={measureMode === "area"}
          onClick={() => setMeasureMode(measureMode === "area" ? null : "area")}
        />

        <div className="my-0.5 border-t border-ink-300/30" />
        <ToolButton icon={Printer} title="Imprimer / Exporter en PDF" onClick={() => handleOpenPrint()} />
      </div>

      {measureMode && (
        <div className="absolute left-16 top-24 z-[5] rounded-lg border border-ink-300/40 bg-white px-3 py-2 text-xs shadow-sm">
          {measureResult ? (
            <span className="flex items-center gap-2">
              <span className="font-data font-semibold text-copper-600">{measureResult}</span>
              <button onClick={() => setMeasureResult(null)} className="text-ink-400 hover:text-ink-700">✕</button>
            </span>
          ) : (
            <span className="text-ink-400">
              {measureMode === "distance" ? "Cliquez pour tracer, double-clic pour finir" : "Cliquez pour dessiner, double-clic pour finir"}
            </span>
          )}
        </div>
      )}

      {drawingGeometryType === "Point" && (
        <div className="absolute left-16 top-24 z-[5] rounded-lg border border-ink-300/40 bg-white px-3 py-2 text-xs shadow-sm">
          <button
            onClick={handleCaptureGpsPoint}
            className="flex items-center gap-2 font-medium text-copper-600 hover:underline"
          >
            <LocateFixed size={13} />
            Capturer ma position GPS actuelle
          </button>
        </div>
      )}

      {/* Groupe "vue de la carte" en haut à droite : zoom (contrôle natif MapLibre) + fond de carte + bascule 2D/3D, tous alignés ensemble. */}
      <div className="absolute right-2 top-20 z-[5] flex flex-col items-end gap-1.5">
        <div ref={basemapMenuRef} className="relative">
          <button
            onClick={() => setBasemapMenuOpen((v) => !v)}
            title={`Fond de carte : ${BASEMAP_OPTIONS.find((o) => o.id === basemap)?.label}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-ink-300/40 bg-white text-ink-700 shadow-sm transition-colors hover:bg-paper-100"
          >
            <LayersIcon size={14} className="text-copper-600" />
          </button>

          {basemapMenuOpen && (
            <div className="absolute right-0 mt-1 w-36 overflow-hidden rounded-lg border border-ink-300/40 bg-white py-1 shadow-lg">
              {BASEMAP_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    setBasemap(option.id);
                    setBasemapMenuOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-paper-100 ${basemap === option.id ? "font-medium text-copper-600" : "text-ink-700"
                    }`}
                >
                  {option.label}
                  {basemap === option.id && <Check size={13} />}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleToggle3D}
          title={is3D ? "Revenir en 2D" : "Activer la vue 3D (relief + bâtiments)"}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border shadow-sm transition-colors ${is3D
            ? "border-ink-900 bg-ink-900"
            : "border-ink-300/40 bg-white hover:bg-paper-100"
            }`}
        >
          <Icon3D size={16} active={is3D} />
        </button>
      </div>

      {layers.some((l) => l.visible) && (
        <div className="absolute bottom-12 right-3 z-[5] max-w-[200px] rounded-lg border border-ink-300/40 bg-white/95 p-2.5 shadow-sm">
          <p className="mb-1.5 font-data text-[10px] font-medium uppercase tracking-widest text-ink-400">
            Légende
          </p>
          <ul className="space-y-1.5">
            {layers
              .filter((l) => l.visible)
              .map((l) => (
                <li key={l.id} className="flex items-center gap-2 text-xs text-ink-700">
                  <LegendSwatch
                    geometryType={l.geometryType}
                    color={
                      l.symbology?.defaultColor ??
                      l.color
                    }
                  />
                  <span className="flex-1 truncate">{layerLabel(l.id)}</span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {cursorCoords && (
        <div className="absolute bottom-3 right-3 z-[5] rounded border border-ink-300/40 bg-white/90 px-2 py-1 font-data text-[11px] text-ink-600 shadow-sm">
          {cursorCoords.lat.toFixed(5)}, {cursorCoords.lng.toFixed(5)}
        </div>
      )}

      {printModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-ink-900/50 p-4 print:hidden">
          <Cartouche className="w-full max-w-sm p-6">
            <h2 className="font-display text-base font-semibold text-ink-900">Imprimer la carte</h2>
            <label className="mb-1 mt-4 block text-xs font-medium text-ink-700">Titre du document</label>
            <input
              value={printTitle}
              onChange={(e) => setPrintTitle(e.target.value)}
              className="rounded-lg w-full border border-ink-300 px-3 py-2 text-sm text-ink-900 outline-none focus:border-copper-600"
            />
            <p className="mt-2 text-[11px] text-ink-400">Format : A4 paysage, une page.</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setPrintModalOpen(false)}
                className="rounded-lg flex-1 border border-ink-300 py-2 text-sm text-ink-600 hover:bg-paper-100"
              >
                Annuler
              </button>
              <button
                onClick={handleConfirmPrint}
                className="rounded-lg flex-1 bg-ink-900 py-2 text-sm font-medium text-white hover:bg-copper-600"
              >
                Imprimer
              </button>
            </div>
          </Cartouche>
        </div>
      )}

      {(printSnapshot || atlasPages) && createPortal(
        <>
          <style>{`
            @page { size: A4 landscape; margin: 0; }
            @media print {
              html, body, #root { height: auto !important; overflow: visible !important; margin: 0 !important; padding: 0 !important; }
              .atlas-page:not(:last-child) { break-after: page; }
            }
          `}</style>
          <div className="hidden print:block relative z-[9999]">
            {atlasPages
              ? atlasPages.map((page, i) => (
                <PrintPage
                  key={i}
                  title={page.title}
                  subtitle={`${printTitle} · WebSIG — Patrimoine Urbain · Page ${i + 1}/${atlasPages.length} · ${new Date().toLocaleDateString("fr-FR")}`}
                  snapshot={page.snapshot}
                  bounds={page.bounds}
                  canvasAspect={page.canvasAspect}
                  legendLayers={atlasLegendLayers}
                  layerLabel={layerLabel}
                />
              ))
              : printSnapshot &&
              printBounds && (
                <PrintPage
                  title={printTitle}
                  subtitle={`WebSIG — Patrimoine Urbain · Généré le ${new Date().toLocaleDateString("fr-FR")} · WGS84 (EPSG:4326)`}
                  snapshot={printSnapshot}
                  bounds={printBounds}
                  canvasAspect={printCanvasAspect}
                  legendLayers={printLegendLayers}
                  layerLabel={layerLabel}
                />
              )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
});
