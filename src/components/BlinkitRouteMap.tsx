import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APILoadingStatus,
  AdvancedMarker,
  Circle,
  InfoWindow,
  Map as GoogleMap,
  Polyline as GooglePolyline,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {
  Building2,
  Clock,
  Crosshair,
  ExternalLink,
  Hospital as HospitalIcon,
  Layers,
  LocateFixed,
  MapPin,
  Navigation,
  Phone,
  ShieldAlert,
  Truck,
} from 'lucide-react';
import { useMapsRuntime } from '../hooks/useMapsContext';
import type { Hospital, Incident } from '../types';

interface BlinkitRouteMapProps {
  incident: Incident;
  hospitals: Hospital[];
  compact?: boolean;
  isAdminView?: boolean;
  onUpdateStatus?: (incidentId: string, status: 'ARRIVED' | 'RESOLVED') => void;
}

interface Point {
  x: number;
  y: number;
}

interface RouteMetrics {
  distanceMeters: number;
  durationMillis: number;
  firstInstruction?: string;
}

function interpolatePolyline(points: Point[], t: number): { x: number; y: number; angle: number } {
  if (points.length < 2) return { x: points[0]?.x ?? 300, y: points[0]?.y ?? 200, angle: 0 };
  const clamped = Math.max(0, Math.min(1, t));

  const segments: { p1: Point; p2: Point; len: number }[] = [];
  let totalLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    segments.push({ p1, p2, len });
    totalLen += len;
  }

  if (totalLen === 0) return { x: points[0].x, y: points[0].y, angle: 0 };
  let target = clamped * totalLen;

  for (const seg of segments) {
    if (target <= seg.len || seg === segments[segments.length - 1]) {
      const ratio = seg.len === 0 ? 0 : Math.min(1, target / seg.len);
      const x = seg.p1.x + (seg.p2.x - seg.p1.x) * ratio;
      const y = seg.p1.y + (seg.p2.y - seg.p1.y) * ratio;
      const angle = (Math.atan2(seg.p2.y - seg.p1.y, seg.p2.x - seg.p1.x) * 180) / Math.PI;
      return { x, y, angle };
    }
    target -= seg.len;
  }

  const last = points[points.length - 1];
  return { x: last.x, y: last.y, angle: 0 };
}

function interpolateLatLngPath(
  path: google.maps.LatLngLiteral[],
  t: number,
): google.maps.LatLngLiteral {
  if (path.length === 0) return { lat: 28.6139, lng: 77.209 };
  if (path.length === 1) return path[0];
  const clamped = Math.max(0, Math.min(1, t));

  let totalLen = 0;
  const segs: { a: google.maps.LatLngLiteral; b: google.maps.LatLngLiteral; len: number }[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    const len = Math.hypot(b.lat - a.lat, b.lng - a.lng);
    segs.push({ a, b, len });
    totalLen += len;
  }

  if (totalLen === 0) return path[0];
  let target = clamped * totalLen;

  for (const seg of segs) {
    if (target <= seg.len || seg === segs[segs.length - 1]) {
      const ratio = seg.len === 0 ? 0 : Math.min(1, target / seg.len);
      return {
        lat: seg.a.lat + (seg.b.lat - seg.a.lat) * ratio,
        lng: seg.a.lng + (seg.b.lng - seg.a.lng) * ratio,
      };
    }
    target -= seg.len;
  }

  return path[path.length - 1];
}

function isQuotaError(err: unknown): boolean {
  const msg =
    typeof err === 'string'
      ? err
      : err && typeof err === 'object' && 'message' in err
        ? String((err as { message?: unknown }).message)
        : String(err ?? '');
  return (
    msg.includes('429') ||
    msg.includes('OVER_QUERY_LIMIT') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.toLowerCase().includes('quota')
  );
}

interface RouteControllerProps {
  origin: google.maps.LatLngLiteral;
  destination: google.maps.LatLngLiteral;
  isDispatched: boolean;
  recenterSignal: number;
  onPathComputed: (path: google.maps.LatLngLiteral[], metrics: RouteMetrics | null) => void;
}

const DispatchRouteLayer: React.FC<RouteControllerProps> = ({
  origin,
  destination,
  isDispatched,
  recenterSignal,
  onPathComputed,
}) => {
  const map = useMap();
  const routesLib = useMapsLibrary('routes');
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const viewportRef = useRef<google.maps.LatLngBounds | null>(null);
  const [hasComputedRoute, setHasComputedRoute] = useState(false);

  const originLat = origin.lat;
  const originLng = origin.lng;
  const destLat = destination.lat;
  const destLng = destination.lng;

  useEffect(() => {
    if (!map || recenterSignal === 0) return;
    if (viewportRef.current) {
      map.fitBounds(viewportRef.current, 48);
    } else {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: originLat, lng: originLng });
      bounds.extend({ lat: destLat, lng: destLng });
      map.fitBounds(bounds, 56);
    }
  }, [map, recenterSignal, originLat, originLng, destLat, destLng]);

  useEffect(() => {
    if (!routesLib || !map) return;

    let cancelled = false;

    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];
    setHasComputedRoute(false);

    const request = {
      origin: { lat: originLat, lng: originLng },
      destination: { lat: destLat, lng: destLng },
      travelMode: 'DRIVING',
      fields: ['path', 'distanceMeters', 'durationMillis', 'viewport', 'legs'],
    };

    (routesLib.Route as any)
      .computeRoutes(request)
      .then(({ routes }: { routes: any[] }) => {
        if (cancelled) return;
        if (!routes || routes.length === 0) {
          onPathComputed([{ lat: originLat, lng: originLng }, { lat: destLat, lng: destLng }], null);
          return;
        }

        const primaryRoute = routes[0];

        if (typeof primaryRoute.createPolylines === 'function') {
          const newPolylines = primaryRoute.createPolylines() as google.maps.Polyline[];
          newPolylines.forEach((polyline) => {
            polyline.setOptions({
              strokeColor: isDispatched ? '#10B981' : '#38BDF8',
              strokeOpacity: 0.94,
              strokeWeight: 6,
            });
            polyline.setMap(map);
          });
          polylinesRef.current = newPolylines;
          setHasComputedRoute(newPolylines.length > 0);
        }

        if (primaryRoute.viewport) {
          viewportRef.current = primaryRoute.viewport;
          map.fitBounds(primaryRoute.viewport, 48);
        }

        const rawPath: google.maps.LatLngLiteral[] = Array.isArray(primaryRoute.path)
          ? primaryRoute.path.map((pt: any) =>
              typeof pt.lat === 'function'
                ? { lat: pt.lat(), lng: pt.lng() }
                : { lat: Number(pt.lat), lng: Number(pt.lng) },
            )
          : [];

        const firstInstruction =
          primaryRoute.legs?.[0]?.steps?.[0]?.navigationInstruction?.instructions || undefined;

        onPathComputed(
          rawPath.length >= 2
            ? rawPath
            : [{ lat: originLat, lng: originLng }, { lat: destLat, lng: destLng }],
          {
            distanceMeters: Number(primaryRoute.distanceMeters ?? 0),
            durationMillis: Number(primaryRoute.durationMillis ?? 0),
            firstInstruction,
          },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (isQuotaError(err)) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        onPathComputed([{ lat: originLat, lng: originLng }, { lat: destLat, lng: destLng }], null);
      });

    return () => {
      cancelled = true;
      polylinesRef.current.forEach((p) => p.setMap(null));
      polylinesRef.current = [];
    };
  }, [routesLib, map, originLat, originLng, destLat, destLng, onPathComputed]);

  useEffect(() => {
    polylinesRef.current.forEach((p) => {
      p.setOptions({
        strokeColor: isDispatched ? '#10B981' : '#38BDF8',
      });
    });
  }, [isDispatched]);

  if (hasComputedRoute) return null;

  return (
    <GooglePolyline
      path={[
        { lat: originLat, lng: originLng },
        { lat: destLat, lng: destLng },
      ]}
      strokeColor={isDispatched ? '#10B981' : '#EF4444'}
      strokeOpacity={0.8}
      strokeWeight={4}
      geodesic
    />
  );
};

interface LiveGoogleDispatchMapProps {
  incident: Incident;
  hospitals: Hospital[];
  hospLat: number;
  hospLng: number;
  progress: number;
  isDispatched: boolean;
  compact: boolean;
  onMetricsUpdate: (metrics: RouteMetrics | null) => void;
  fallbackElement: React.ReactNode;
}

const LiveGoogleDispatchMap: React.FC<LiveGoogleDispatchMapProps> = ({
  incident,
  hospitals,
  hospLat,
  hospLng,
  progress,
  isDispatched,
  compact,
  onMetricsUpdate,
  fallbackElement,
}) => {
  const loadingStatus = useApiLoadingStatus();
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid' | 'terrain'>('roadmap');
  const [recenterSignal, setRecenterSignal] = useState(0);
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[]>([
    { lat: hospLat, lng: hospLng },
    { lat: incident.latitude, lng: incident.longitude },
  ]);
  const [activeInfo, setActiveInfo] = useState<
    | { type: 'incident' }
    | { type: 'assigned' }
    | { type: 'ambulance' }
    | { type: 'hospital'; hospital: Hospital }
    | null
  >(null);

  const handlePathComputed = useCallback(
    (path: google.maps.LatLngLiteral[], metrics: RouteMetrics | null) => {
      setRoutePath(path);
      onMetricsUpdate(metrics);
    },
    [onMetricsUpdate],
  );

  const nearbyHospitals = useMemo(
    () =>
      hospitals.filter(
        (h) =>
          h.id !== incident.assignedHospitalId &&
          Math.abs(h.latitude - incident.latitude) < 0.2 &&
          Math.abs(h.longitude - incident.longitude) < 0.2,
      ),
    [hospitals, incident.assignedHospitalId, incident.latitude, incident.longitude],
  );

  const ambulanceLatLng = useMemo(
    () => interpolateLatLngPath(routePath, progress),
    [routePath, progress],
  );

  const gpsAccuracyRadiusMeters = Math.max(40, Math.min(280, incident.accuracyMeters * 3.5));

  if (
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return <>{fallbackElement}</>;
  }

  return (
    <div className={`relative w-full bg-[#080D16] ${compact ? 'h-[290px]' : 'h-[400px]'}`}>
      <GoogleMap
        mapId="DEMO_MAP_ID"
        colorScheme="DARK"
        defaultCenter={{ lat: incident.latitude, lng: incident.longitude }}
        defaultZoom={13.5}
        mapTypeId={mapType}
        gestureHandling="greedy"
        disableDefaultUI
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
      >
        <DispatchRouteLayer
          origin={{ lat: hospLat, lng: hospLng }}
          destination={{ lat: incident.latitude, lng: incident.longitude }}
          isDispatched={isDispatched}
          recenterSignal={recenterSignal}
          onPathComputed={handlePathComputed}
        />

        <Circle
          center={{ lat: incident.latitude, lng: incident.longitude }}
          radius={gpsAccuracyRadiusMeters}
          strokeColor="#EF4444"
          strokeOpacity={0.55}
          strokeWeight={1.5}
          fillColor="#EF4444"
          fillOpacity={0.12}
        />

        {nearbyHospitals.map((h) => (
          <AdvancedMarker
            key={h.id}
            position={{ lat: h.latitude, lng: h.longitude }}
            zIndex={100}
            onClick={() => setActiveInfo({ type: 'hospital', hospital: h })}
          >
            <div className="flex items-center gap-1 rounded-md border border-white/20 bg-[#0A101C]/95 px-2 py-0.5 text-[10px] font-semibold text-sky-300 shadow-md hover:scale-105 transition-transform cursor-pointer">
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-sky-400 text-[9px] font-bold text-slate-950">
                H
              </span>
              <span className="max-w-[90px] truncate">{h.name.split(' ')[0]}</span>
            </div>
          </AdvancedMarker>
        ))}

        <AdvancedMarker
          position={{ lat: hospLat, lng: hospLng }}
          zIndex={220}
          onClick={() => setActiveInfo({ type: 'assigned' })}
        >
          <div className="flex items-center gap-1.5 rounded-md border border-sky-300/70 bg-sky-400 px-2.5 py-1 text-[11px] font-bold text-slate-950 shadow-lg hover:scale-105 transition-transform cursor-pointer">
            <span className="flex h-4 w-4 items-center justify-center rounded bg-slate-950 text-[10px] font-extrabold text-sky-400">
              H
            </span>
            <span className="max-w-[140px] truncate">
              {incident.assignedHospitalName || 'Assigned Trauma Center'}
            </span>
          </div>
        </AdvancedMarker>

        <AdvancedMarker
          position={{ lat: incident.latitude, lng: incident.longitude }}
          zIndex={260}
          onClick={() => setActiveInfo({ type: 'incident' })}
        >
          <div className="relative flex items-center justify-center cursor-pointer">
            <span className="sos-pulse-ring absolute h-9 w-9 rounded-lg bg-red-500/45" />
            <div className="relative flex items-center gap-1 rounded-md border border-red-300/70 bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>SOS</span>
            </div>
          </div>
        </AdvancedMarker>

        {isDispatched && (
          <AdvancedMarker
            position={ambulanceLatLng}
            zIndex={320}
            onClick={() => setActiveInfo({ type: 'ambulance' })}
          >
            <div className="flex items-center gap-1.5 rounded-md border border-emerald-300/70 bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-lg cursor-pointer">
              <Truck className="h-3.5 w-3.5" />
              <span className="font-mono">{incident.assignedAmbulanceCode || 'AMB-104'}</span>
            </div>
          </AdvancedMarker>
        )}

        {activeInfo?.type === 'incident' && (
          <InfoWindow
            position={{ lat: incident.latitude, lng: incident.longitude }}
            pixelOffset={[0, -28]}
            onCloseClick={() => setActiveInfo(null)}
          >
            <div className="min-w-[190px] p-1 font-sans text-slate-900">
              <div className="text-xs font-bold text-red-600">
                {incident.id} · {incident.category}
              </div>
              <div className="mt-1 text-xs font-semibold">{incident.locationLabel}</div>
              <div className="mt-0.5 text-[11px] text-slate-600">
                Reporter: {incident.reporterName}
              </div>
              <div className="mt-1 font-mono text-[10px] text-slate-500">
                {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)} (±{incident.accuracyMeters.toFixed(0)}m)
              </div>
            </div>
          </InfoWindow>
        )}

        {activeInfo?.type === 'assigned' && (
          <InfoWindow
            position={{ lat: hospLat, lng: hospLng }}
            pixelOffset={[0, -28]}
            onCloseClick={() => setActiveInfo(null)}
          >
            <div className="min-w-[190px] p-1 font-sans text-slate-900">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-900">
                <Building2 className="h-3.5 w-3.5" />
                <span>{incident.assignedHospitalName || 'Assigned Trauma Center'}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-600">
                Dispatching unit {incident.assignedAmbulanceCode || 'Standby'}
              </div>
              {incident.driverName && (
                <div className="mt-1 text-[11px] font-medium text-slate-800">
                  Paramedic: {incident.driverName}
                </div>
              )}
            </div>
          </InfoWindow>
        )}

        {activeInfo?.type === 'ambulance' && (
          <InfoWindow
            position={ambulanceLatLng}
            pixelOffset={[0, -28]}
            onCloseClick={() => setActiveInfo(null)}
          >
            <div className="min-w-[180px] p-1 font-sans text-slate-900">
              <div className="text-xs font-bold text-emerald-700">
                {incident.assignedAmbulanceCode || 'AMB-104'} · Live Unit
              </div>
              <div className="mt-1 text-[11px] text-slate-700">
                {incident.status === 'ARRIVED'
                  ? 'Arrived on scene'
                  : `ETA ${incident.etaMinutes} min (${Math.round(progress * 100)}% complete)`}
              </div>
              {incident.driverPhone && (
                <a
                  href={`tel:${incident.driverPhone.replace(/\s+/g, '')}`}
                  className="mt-1.5 inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-sky-800"
                >
                  <Phone className="h-3 w-3" />
                  <span>{incident.driverPhone}</span>
                </a>
              )}
            </div>
          </InfoWindow>
        )}

        {activeInfo?.type === 'hospital' && (
          <InfoWindow
            position={{ lat: activeInfo.hospital.latitude, lng: activeInfo.hospital.longitude }}
            pixelOffset={[0, -24]}
            onCloseClick={() => setActiveInfo(null)}
          >
            <div className="min-w-[185px] p-1 font-sans text-slate-900">
              <div className="text-xs font-bold text-sky-900">{activeInfo.hospital.name}</div>
              <div className="mt-0.5 text-[11px] text-slate-600">
                {activeInfo.hospital.area}, {activeInfo.hospital.city}
              </div>
              <div className="mt-1.5 flex items-center gap-3 text-[11px]">
                <span className="font-mono font-bold text-emerald-700">
                  {activeInfo.hospital.icuBedsAvailable} ICU
                </span>
                <span className="font-mono font-bold text-sky-800">
                  {activeInfo.hospital.ambulancesReady} Units
                </span>
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Dark Map HUD Controls */}
      <div className="pointer-events-none absolute top-3 right-3 flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-white/15 bg-[#0A101C]/90 p-1 text-[11px] shadow-lg backdrop-blur-md">
          {(
            [
              { id: 'roadmap', label: 'Map' },
              { id: 'hybrid', label: 'Satellite' },
              { id: 'terrain', label: 'Terrain' },
            ] as const
          ).map((mode) => (
            <button
              key={mode.id}
              type="button"
              onClick={() => setMapType(mode.id)}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                mapType === mode.id
                  ? 'bg-sky-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setRecenterSignal((n) => n + 1)}
          title="Fit route in viewport"
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0A101C]/90 px-3 py-1.5 text-[11px] font-semibold text-slate-100 shadow-lg backdrop-blur-md hover:bg-[#121B2D] transition-colors"
        >
          <LocateFixed className="h-3.5 w-3.5 text-sky-400" />
          <span>Recenter</span>
        </button>
      </div>

      {/* Bottom Floating Legend */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-[#0A101C]/90 px-3.5 py-1.5 text-[11px] font-medium text-slate-200 shadow-lg backdrop-blur-md">
        <span className="inline-flex items-center gap-1.5">
          <Crosshair className="h-3.5 w-3.5 text-red-400" />
          <span>SOS Scene</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <HospitalIcon className="h-3.5 w-3.5 text-sky-400" />
          <span>Assigned Hospital</span>
        </span>
        {isDispatched && (
          <span className="inline-flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-mono tabular-nums">Live Unit ({Math.round(progress * 100)}%)</span>
          </span>
        )}
      </div>
    </div>
  );
};

export const BlinkitRouteMap: React.FC<BlinkitRouteMapProps> = ({
  incident,
  hospitals,
  compact = false,
  isAdminView = false,
  onUpdateStatus,
}) => {
  const { hasProvider, quotaExceeded } = useMapsRuntime();
  const [routeMetrics, setRouteMetrics] = useState<RouteMetrics | null>(null);

  const width = 720;
  const height = compact ? 300 : 400;

  const hospLat = incident.assignedHospitalLat ?? incident.latitude - 0.018;
  const hospLng = incident.assignedHospitalLng ?? incident.longitude - 0.022;

  const projection = useMemo(() => {
    const lats = [incident.latitude, hospLat];
    const lngs = [incident.longitude, hospLng];

    const nearbyHospitals = hospitals.filter(
      (h) =>
        Math.abs(h.latitude - incident.latitude) < 0.14 &&
        Math.abs(h.longitude - incident.longitude) < 0.14,
    );
    nearbyHospitals.forEach((h) => {
      lats.push(h.latitude);
      lngs.push(h.longitude);
    });

    const minLat = Math.min(...lats) - 0.008;
    const maxLat = Math.max(...lats) + 0.008;
    const minLng = Math.min(...lngs) - 0.012;
    const maxLng = Math.max(...lngs) + 0.012;

    const padX = 76;
    const padY = 66;
    const usableW = width - padX * 2;
    const usableH = height - padY * 2;

    const toPoint = (lat: number, lng: number): Point => {
      const nx = maxLng === minLng ? 0.5 : (lng - minLng) / (maxLng - minLng);
      const ny = maxLat === minLat ? 0.5 : (maxLat - lat) / (maxLat - minLat);
      return {
        x: padX + nx * usableW,
        y: padY + ny * usableH,
      };
    };

    const victimPt = toPoint(incident.latitude, incident.longitude);
    const hospitalPt = toPoint(hospLat, hospLng);

    const midX1 = hospitalPt.x + (victimPt.x - hospitalPt.x) * 0.32;
    const midY1 = hospitalPt.y;
    const midX2 = hospitalPt.x + (victimPt.x - hospitalPt.x) * 0.32;
    const midY2 = hospitalPt.y + (victimPt.y - hospitalPt.y) * 0.58;
    const midX3 = hospitalPt.x + (victimPt.x - hospitalPt.x) * 0.76;
    const midY3 = hospitalPt.y + (victimPt.y - hospitalPt.y) * 0.58;
    const midX4 = victimPt.x;
    const midY4 = hospitalPt.y + (victimPt.y - hospitalPt.y) * 0.72;

    const routePoints: Point[] = [
      hospitalPt,
      { x: midX1, y: midY1 },
      { x: midX2, y: midY2 },
      { x: midX3, y: midY3 },
      { x: midX4, y: midY4 },
      victimPt,
    ];

    return { toPoint, victimPt, hospitalPt, routePoints, nearbyHospitals };
  }, [incident.latitude, incident.longitude, hospLat, hospLng, hospitals, height]);

  const progress =
    incident.status === 'REPORTED'
      ? 0
      : incident.status === 'ARRIVED' || incident.status === 'RESOLVED'
        ? 1
        : incident.routeProgress;

  const ambulancePos = useMemo(
    () => interpolatePolyline(projection.routePoints, progress),
    [projection.routePoints, progress],
  );

  const polylineStr = projection.routePoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  const currentInstruction = useMemo(() => {
    if (incident.status === 'REPORTED') {
      return 'Awaiting command acceptance to lock road corridor';
    }
    if (incident.status === 'ARRIVED') {
      return `Arrived at ${incident.locationLabel}`;
    }
    if (incident.status === 'RESOLVED') {
      return 'Patient handover completed at hospital';
    }
    if (routeMetrics?.firstInstruction && progress < 0.35) {
      return routeMetrics.firstInstruction;
    }
    if (progress < 0.25) return 'Exit trauma bay onto primary arterial corridor';
    if (progress < 0.55) return 'Proceed along priority emergency route';
    if (progress < 0.8) return 'Approaching local sector junction';
    return `Final approach to ${incident.locationLabel}`;
  }, [incident.status, incident.locationLabel, progress, routeMetrics]);

  const displayDistanceKm = routeMetrics?.distanceMeters
    ? routeMetrics.distanceMeters / 1000
    : incident.distanceKm;

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${hospLat},${hospLng}&destination=${incident.latitude},${incident.longitude}&travelmode=driving`;

  const isDispatched = incident.status !== 'REPORTED';

  const fallbackSvgMap = (
    <div className="relative bg-[#070B12]">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto block select-none"
        role="img"
        aria-label={`Live dispatch route map for ${incident.id}`}
      >
        <rect width={width} height={height} fill="#070B12" />

        {/* Subtle Dark Sectors */}
        <rect x="42" y="34" width="110" height="72" rx="6" fill="#0C1921" stroke="#162836" strokeWidth="1" />
        <rect x="520" y={height - 108} width="142" height="76" rx="6" fill="#0C1921" stroke="#162836" strokeWidth="1" />
        <rect x="280" y="24" width="138" height="58" rx="6" fill="#0D1422" stroke="#1B2840" strokeWidth="1" />
        <path
          d={`M 0 ${height * 0.85} Q ${width * 0.45} ${height * 0.78} ${width} ${height * 0.9}`}
          fill="none"
          stroke="#0F2A44"
          strokeWidth="12"
          opacity="0.7"
        />

        {/* Minor Road Grid */}
        {[0.18, 0.36, 0.58, 0.78].map((row, idx) => (
          <line
            key={`h-${idx}`}
            x1="0"
            y1={height * row}
            x2={width}
            y2={height * row}
            stroke="#111A2B"
            strokeWidth="5"
          />
        ))}
        {[0.16, 0.32, 0.52, 0.76, 0.9].map((col, idx) => (
          <line
            key={`v-${idx}`}
            x1={width * col}
            y1="0"
            x2={width * col}
            y2={height}
            stroke="#111A2B"
            strokeWidth="5"
          />
        ))}

        {/* Primary Arterial Roads */}
        <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.42} stroke="#1D2B42" strokeWidth="9" />
        <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.42} stroke="#263854" strokeWidth="2" />
        <line x1={width * 0.44} y1="0" x2={width * 0.48} y2={height} stroke="#1D2B42" strokeWidth="9" />
        <line x1={width * 0.44} y1="0" x2={width * 0.48} y2={height} stroke="#263854" strokeWidth="2" />

        <circle cx={width * 0.46} cy={height * 0.46} r="18" fill="#0D1524" stroke="#283B58" strokeWidth="2" />
        <circle cx={width * 0.46} cy={height * 0.46} r="7" fill="#10B981" fillOpacity="0.35" />

        {/* Nearby Hospitals */}
        {projection.nearbyHospitals.map((h) => {
          const pt = projection.toPoint(h.latitude, h.longitude);
          const isAssigned = h.id === incident.assignedHospitalId;
          if (isAssigned) return null;
          return (
            <g key={h.id} transform={`translate(${pt.x}, ${pt.y})`}>
              <circle r="10" fill="#0D1524" stroke="#38BDF8" strokeOpacity="0.6" strokeWidth="1.5" />
              <path d="M-3.5 0 H3.5 M0 -3.5 V3.5" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
              <text
                x="0"
                y="21"
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill="#94A3B8"
                fontFamily="DM Sans, sans-serif"
              >
                {h.name.slice(0, 22)}
              </text>
            </g>
          );
        })}

        {/* Route Path */}
        <polyline
          points={polylineStr}
          fill="none"
          stroke={isDispatched ? '#10B981' : '#EF4444'}
          strokeOpacity="0.22"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline
          points={polylineStr}
          fill="none"
          stroke={isDispatched ? '#10B981' : '#EF4444'}
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={isDispatched ? '10 8' : '6 8'}
          className={isDispatched && incident.status !== 'ARRIVED' ? 'animate-route-dash' : ''}
        />

        {/* Assigned Hospital Node */}
        <g transform={`translate(${projection.hospitalPt.x}, ${projection.hospitalPt.y})`}>
          <circle r="16" fill="#0A101C" stroke="#38BDF8" strokeWidth="2" />
          <path d="M-5.5 0 H5.5 M0 -5.5 V5.5" stroke="#38BDF8" strokeWidth="2.8" strokeLinecap="round" />
          <g transform="translate(0, -27)">
            <rect x="-86" y="-12" width="172" height="22" rx="5" fill="#0B1322" stroke="#38BDF8" strokeOpacity="0.45" strokeWidth="1" />
            <text
              x="0"
              y="3"
              textAnchor="middle"
              fontSize="10"
              fontWeight="600"
              fill="#E2E8F0"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              {(incident.assignedHospitalName || 'Assigned Hospital').slice(0, 26)}
            </text>
          </g>
        </g>

        {/* Victim / SOS Scene */}
        <g transform={`translate(${projection.victimPt.x}, ${projection.victimPt.y})`}>
          <circle
            r="34"
            fill="#EF4444"
            fillOpacity="0.12"
            stroke="#EF4444"
            strokeOpacity="0.4"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <circle r="16" fill="#EF4444" fillOpacity="0.24" />
          <circle r="9" fill="#EF4444" stroke="#F8FAFC" strokeWidth="2" />
          <g transform="translate(0, 26)">
            <rect x="-80" y="-9" width="160" height="21" rx="5" fill="#DC2626" />
            <text
              x="0"
              y="5"
              textAnchor="middle"
              fontSize="10"
              fontWeight="700"
              fill="#FFFFFF"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              SOS · {incident.locationLabel.slice(0, 20)}
            </text>
          </g>
        </g>

        {/* Live Moving Ambulance */}
        {isDispatched && (
          <g transform={`translate(${ambulancePos.x}, ${ambulancePos.y})`}>
            <circle r="20" fill="#10B981" fillOpacity="0.2" />
            <rect x="-15" y="-11" width="30" height="22" rx="5" fill="#10B981" stroke="#F8FAFC" strokeWidth="2" />
            <path d="M-5 0 H5 M0 -5 V5" stroke="#06281E" strokeWidth="2.4" strokeLinecap="round" />
            <g transform="translate(0, -22)">
              <rect x="-42" y="-10" width="84" height="17" rx="4" fill="#0B1322" stroke="#10B981" strokeOpacity="0.5" strokeWidth="1" />
              <text
                x="0"
                y="2"
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill="#6EE7B7"
                fontFamily="JetBrains Mono, monospace"
              >
                {incident.assignedAmbulanceCode || 'AMB-104'}
              </text>
            </g>
          </g>
        )}
      </svg>

      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-[#0A101C]/90 px-3 py-1.5 text-[11px] font-medium text-slate-200 shadow-lg backdrop-blur-md">
        <span className="inline-flex items-center gap-1.5">
          <Crosshair className="h-3.5 w-3.5 text-red-400" />
          <span>Incident Location</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <HospitalIcon className="h-3.5 w-3.5 text-sky-400" />
          <span>Assigned Hospital</span>
        </span>
        {isDispatched && (
          <span className="inline-flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-mono tabular-nums">Live Unit ({Math.round(progress * 100)}%)</span>
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-white/[0.08] bg-[#0D131F] overflow-hidden">
      {/* Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] bg-[#0A101B] px-5 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
              incident.status === 'ARRIVED' || incident.status === 'RESOLVED'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : isDispatched
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-red-500/20 text-red-400 border border-red-500/30'
            }`}
          >
            {isDispatched ? <Truck className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-white truncate">
              {incident.status === 'REPORTED'
                ? 'Awaiting Dispatch Acceptance'
                : incident.status === 'ARRIVED'
                  ? 'Ambulance Arrived at Scene'
                  : incident.status === 'RESOLVED'
                    ? 'Incident Resolved'
                    : `Ambulance arriving in ${incident.etaMinutes} min`}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
              <span className="text-slate-200">{incident.id}</span>
              <span aria-hidden="true">·</span>
              <span>{displayDistanceKm.toFixed(2)} km road route</span>
              {incident.assignedAmbulanceCode && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-emerald-400">{incident.assignedAmbulanceCode}</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {hasProvider && !quotaExceeded && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-sky-300">
              <Layers className="h-3.5 w-3.5" />
              <span>Live Maps</span>
            </span>
          )}
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#121B2D] px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-[#19253D] transition-colors whitespace-nowrap"
          >
            <Navigation className="h-3.5 w-3.5 text-sky-400" />
            <span>Open Directions</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </a>
        </div>
      </div>

      {/* Turn-by-turn Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] bg-emerald-500/10 px-4 py-2 text-xs text-emerald-200">
        <div className="flex items-center gap-2 font-medium">
          <Navigation className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span>{currentInstruction}</span>
        </div>
        <div className="font-mono text-[11px] text-emerald-300/90 tabular-nums">
          {incident.latitude.toFixed(4)}° N, {incident.longitude.toFixed(4)}° E (±{incident.accuracyMeters.toFixed(1)}m)
        </div>
      </div>

      {/* Map Viewport */}
      {hasProvider && !quotaExceeded ? (
        <LiveGoogleDispatchMap
          incident={incident}
          hospitals={hospitals}
          hospLat={hospLat}
          hospLng={hospLng}
          progress={progress}
          isDispatched={isDispatched}
          compact={compact}
          onMetricsUpdate={setRouteMetrics}
          fallbackElement={fallbackSvgMap}
        />
      ) : (
        fallbackSvgMap
      )}

      {/* Progress & Controls */}
      <div className="border-t border-white/[0.08] bg-[#0D131F] p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <div className="text-[11px] text-slate-400">Assigned Hospital</div>
              <div className="text-sm font-semibold text-white">
                {incident.assignedHospitalName || 'Pending Hospital Match'}
              </div>
            </div>
            {incident.driverName && (
              <div>
                <div className="text-[11px] text-slate-400">Ambulance Paramedic</div>
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span>{incident.driverName}</span>
                  <span className="text-xs font-normal font-mono text-slate-400 tabular-nums">
                    {incident.driverPhone}
                  </span>
                </div>
              </div>
            )}
            <div>
              <div className="text-[11px] text-slate-400">Dispatch Progress</div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Clock className="h-3.5 w-3.5 text-sky-400" />
                <span className="font-mono tabular-nums">
                  {incident.status === 'REPORTED'
                    ? 'Waiting for Acceptance'
                    : incident.status === 'ARRIVED'
                      ? 'On Scene (100%)'
                      : incident.status === 'RESOLVED'
                        ? 'Completed'
                        : `${Math.round(progress * 100)}% · ETA ${incident.etaMinutes} min`}
                </span>
              </div>
            </div>
          </div>

          {isAdminView && onUpdateStatus && isDispatched && incident.status !== 'RESOLVED' && (
            <div className="flex items-center gap-2 shrink-0">
              {incident.status !== 'ARRIVED' && (
                <button
                  type="button"
                  onClick={() => onUpdateStatus(incident.id, 'ARRIVED')}
                  className="rounded-lg border border-white/15 bg-[#121B2D] px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-[#19253D] transition-colors whitespace-nowrap"
                >
                  Mark Arrived
                </button>
              )}
              <button
                type="button"
                onClick={() => onUpdateStatus(incident.id, 'RESOLVED')}
                className="rounded-lg bg-sky-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-300 transition-colors whitespace-nowrap"
              >
                Complete Handover
              </button>
            </div>
          )}

          {!isAdminView && incident.driverPhone && (
            <a
              href={`tel:${incident.driverPhone.replace(/\s+/g, '')}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#121B2D] px-3.5 py-2 text-xs font-semibold text-slate-100 hover:bg-[#19253D] transition-colors whitespace-nowrap"
            >
              <Phone className="h-3.5 w-3.5 text-emerald-400" />
              <span>Call Paramedic</span>
            </a>
          )}
        </div>

        {/* Linear Progress Track */}
        <div className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className={`h-full transition-all duration-500 ${
              incident.status === 'REPORTED' ? 'bg-red-500' : 'bg-emerald-500'
            }`}
            style={{ width: incident.status === 'REPORTED' ? '8%' : `${Math.max(10, Math.round(progress * 100))}%` }}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-500">
          <span className={incident.status !== 'REPORTED' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
            SOS Received
          </span>
          <span className={isDispatched ? 'text-emerald-400 font-semibold' : ''}>
            Admin Accepted &amp; Dispatched
          </span>
          <span className={incident.status === 'ARRIVED' || incident.status === 'RESOLVED' ? 'text-emerald-400 font-semibold' : ''}>
            Ambulance Arrived
          </span>
          <span className={incident.status === 'RESOLVED' ? 'text-emerald-400 font-semibold' : ''}>
            Hospital Handover
          </span>
        </div>
      </div>

      {/* Footer Verification */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] bg-[#0A101B] px-4 py-2 text-xs text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-red-400" />
          <span className="text-slate-200">{incident.locationLabel}</span>
          {incident.isDemoLocation && <span className="text-slate-500">· Preset Coordinate</span>}
        </span>
        <span className="font-mono text-[11px] text-slate-400">
          Reporter: {incident.reporterName} · {incident.category}
        </span>
      </div>
    </div>
  );
};
