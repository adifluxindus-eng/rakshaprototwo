import React, { useCallback, useEffect, useState } from 'react';
import {
  APILoadingStatus,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  useApiLoadingStatus,
  useMap,
} from '@vis.gl/react-google-maps';
import { Building2, Compass, Layers, MapPin, Phone, ShieldAlert, Truck } from 'lucide-react';
import { useMapsRuntime } from '../hooks/useMapsContext';
import type { Hospital, Incident } from '../types';

interface NetworkLiveMapProps {
  hospitals: Hospital[];
  incidents: Incident[];
  focusedHospitalId?: string | null;
  onSelectHospital?: (hospitalId: string) => void;
  onLaunchSos?: () => void;
  onOpenCommand?: () => void;
}

const REGION_VIEWS = {
  ALL: { center: { lat: 21.8, lng: 77.4 }, zoom: 4.6 },
  DELHI: { center: { lat: 28.605, lng: 77.205 }, zoom: 11.8 },
  BLR: { center: { lat: 12.965, lng: 77.645 }, zoom: 12.4 },
} as const;

function interpolateCoords(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
  t: number,
): google.maps.LatLngLiteral {
  const clamped = Math.max(0, Math.min(1, t));
  return {
    lat: aLat + (bLat - aLat) * clamped,
    lng: aLng + (bLng - aLng) * clamped,
  };
}

const LiveGoogleNetworkInner: React.FC<NetworkLiveMapProps> = ({
  hospitals,
  incidents,
  focusedHospitalId,
  onSelectHospital,
  onLaunchSos,
  onOpenCommand,
}) => {
  const map = useMap();
  const loadingStatus = useApiLoadingStatus();

  const [regionKey, setRegionKey] = useState<'ALL' | 'DELHI' | 'BLR'>('DELHI');
  const [mapType, setMapType] = useState<'roadmap' | 'hybrid'>('roadmap');
  const [activeHospitalId, setActiveHospitalId] = useState<string | null>(null);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);

  const selectedHospital =
    hospitals.find((h) => h.id === (activeHospitalId || focusedHospitalId)) || null;
  const selectedIncident = incidents.find((i) => i.id === activeIncidentId) || null;

  const handleRegionChange = useCallback(
    (key: 'ALL' | 'DELHI' | 'BLR') => {
      setRegionKey(key);
      if (map) {
        map.panTo(REGION_VIEWS[key].center);
        map.setZoom(REGION_VIEWS[key].zoom);
      }
    },
    [map],
  );

  useEffect(() => {
    if (!map || !focusedHospitalId) return;
    const h = hospitals.find((item) => item.id === focusedHospitalId);
    if (h) {
      setActiveHospitalId(h.id);
      setActiveIncidentId(null);
      map.panTo({ lat: h.latitude, lng: h.longitude });
      map.setZoom(13.2);
    }
  }, [map, focusedHospitalId, hospitals]);

  useEffect(() => {
    if (!map || incidents.length === 0) return;
    const newest = incidents[0];
    if (newest.status === 'REPORTED' || newest.status === 'EN_ROUTE') {
      map.panTo({ lat: newest.latitude, lng: newest.longitude });
      map.setZoom(12.8);
    }
  }, [map, incidents.length]);

  if (
    loadingStatus === APILoadingStatus.FAILED ||
    loadingStatus === APILoadingStatus.AUTH_FAILURE
  ) {
    return (
      <FallbackNetworkPreview
        hospitals={hospitals}
        incidents={incidents}
        onLaunchSos={onLaunchSos}
        onOpenCommand={onOpenCommand}
      />
    );
  }

  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-xl border border-white/10 bg-[#080D16]">
      <GoogleMap
        mapId="DEMO_MAP_ID"
        colorScheme="DARK"
        defaultCenter={REGION_VIEWS.DELHI.center}
        defaultZoom={REGION_VIEWS.DELHI.zoom}
        mapTypeId={mapType}
        gestureHandling="greedy"
        disableDefaultUI
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        style={{ width: '100%', height: '100%' }}
      >
        {hospitals.map((h) => {
          const isSelected = selectedHospital?.id === h.id;
          return (
            <AdvancedMarker
              key={h.id}
              position={{ lat: h.latitude, lng: h.longitude }}
              zIndex={isSelected ? 300 : 120}
              onClick={() => {
                setActiveHospitalId(h.id);
                setActiveIncidentId(null);
                onSelectHospital?.(h.id);
              }}
            >
              <div
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-semibold shadow-lg transition-transform duration-150 hover:scale-105 cursor-pointer ${
                  isSelected
                    ? 'border-sky-300 bg-sky-400 text-slate-950 scale-105'
                    : 'border-sky-400/50 bg-[#0B1220]/95 text-slate-100'
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded text-[10px] font-bold ${
                    isSelected ? 'bg-slate-950 text-sky-400' : 'bg-sky-400 text-slate-950'
                  }`}
                >
                  H
                </span>
                <span className="max-w-[110px] truncate">{h.name.split(' ')[0]}</span>
                <span className="font-mono tabular-nums opacity-80">{h.icuBedsAvailable}</span>
              </div>
            </AdvancedMarker>
          );
        })}

        {incidents.map((inc) => {
          const isDispatched = inc.status !== 'REPORTED';
          const hospLat = inc.assignedHospitalLat ?? inc.latitude - 0.015;
          const hospLng = inc.assignedHospitalLng ?? inc.longitude - 0.018;
          const ambPos = interpolateCoords(
            hospLat,
            hospLng,
            inc.latitude,
            inc.longitude,
            inc.routeProgress,
          );

          return (
            <React.Fragment key={inc.id}>
              <AdvancedMarker
                position={{ lat: inc.latitude, lng: inc.longitude }}
                zIndex={350}
                onClick={() => {
                  setActiveIncidentId(inc.id);
                  setActiveHospitalId(null);
                }}
              >
                <div className="relative flex items-center justify-center cursor-pointer">
                  <span className="sos-pulse-ring absolute h-9 w-9 rounded-lg bg-red-500/45" />
                  <div className="relative flex items-center gap-1 rounded-md border border-red-300/70 bg-red-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-lg">
                    <ShieldAlert className="h-3 w-3" />
                    <span>SOS</span>
                  </div>
                </div>
              </AdvancedMarker>

              {isDispatched && inc.status !== 'RESOLVED' && (
                <AdvancedMarker position={ambPos} zIndex={360}>
                  <div className="flex items-center gap-1 rounded-md border border-emerald-300/70 bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white shadow-lg">
                    <Truck className="h-3 w-3" />
                    <span className="font-mono">{inc.assignedAmbulanceCode || 'AMB'}</span>
                  </div>
                </AdvancedMarker>
              )}
            </React.Fragment>
          );
        })}

        {selectedHospital && (
          <InfoWindow
            position={{ lat: selectedHospital.latitude, lng: selectedHospital.longitude }}
            pixelOffset={[0, -28]}
            onCloseClick={() => setActiveHospitalId(null)}
          >
            <div className="min-w-[210px] p-1 font-sans text-slate-900">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-900">
                <Building2 className="h-3.5 w-3.5" />
                <span>{selectedHospital.name}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-600">
                {selectedHospital.area}, {selectedHospital.city}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-2 text-[11px]">
                <div>
                  <div className="text-slate-500">ICU Beds</div>
                  <div className="font-mono font-bold text-emerald-700 tabular-nums">
                    {selectedHospital.icuBedsAvailable}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Ambulances</div>
                  <div className="font-mono font-bold text-sky-800 tabular-nums">
                    {selectedHospital.ambulancesReady}
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
                <a
                  href={`tel:${selectedHospital.phone.replace(/\s+/g, '')}`}
                  className="inline-flex items-center gap-1 font-mono text-slate-700 hover:text-sky-800"
                >
                  <Phone className="h-3 w-3" />
                  <span>{selectedHospital.phone}</span>
                </a>
                {onLaunchSos && (
                  <button
                    type="button"
                    onClick={onLaunchSos}
                    className="rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-red-700"
                  >
                    Send SOS
                  </button>
                )}
              </div>
            </div>
          </InfoWindow>
        )}

        {selectedIncident && (
          <InfoWindow
            position={{ lat: selectedIncident.latitude, lng: selectedIncident.longitude }}
            pixelOffset={[0, -28]}
            onCloseClick={() => setActiveIncidentId(null)}
          >
            <div className="min-w-[200px] p-1 font-sans text-slate-900">
              <div className="text-xs font-bold text-red-600">
                {selectedIncident.id} · {selectedIncident.category}
              </div>
              <div className="mt-1 text-xs font-semibold">{selectedIncident.locationLabel}</div>
              <div className="mt-0.5 text-[11px] text-slate-600">
                Reporter: {selectedIncident.reporterName}
              </div>
              {onOpenCommand && (
                <button
                  type="button"
                  onClick={onOpenCommand}
                  className="mt-2 w-full rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
                >
                  Open in Command Center
                </button>
              )}
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Top HUD Controls */}
      <div className="pointer-events-none absolute top-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2">
        <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-white/15 bg-[#0A101C]/90 p-1 shadow-lg backdrop-blur-md text-[11px]">
          {(
            [
              { id: 'DELHI', label: 'New Delhi' },
              { id: 'BLR', label: 'Bengaluru' },
              { id: 'ALL', label: 'All India' },
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleRegionChange(r.id)}
              className={`rounded-md px-2.5 py-1 font-semibold transition-colors whitespace-nowrap ${
                regionKey === r.id
                  ? 'bg-sky-400 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setMapType((m) => (m === 'roadmap' ? 'hybrid' : 'roadmap'))}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#0A101C]/90 px-3 py-1.5 text-[11px] font-semibold text-slate-100 shadow-lg backdrop-blur-md hover:bg-[#121B2D] transition-colors whitespace-nowrap"
        >
          <Layers className="h-3.5 w-3.5 text-sky-400" />
          <span>{mapType === 'roadmap' ? 'Satellite' : 'Roadmap'}</span>
        </button>
      </div>

      {/* Bottom Readout Strip */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-3 rounded-lg border border-white/15 bg-[#0A101C]/90 px-3.5 py-1.5 text-[11px] font-medium text-slate-200 shadow-lg backdrop-blur-md">
        <span className="font-mono tabular-nums text-sky-300">
          {hospitals.length} Trauma Nodes
        </span>
        <span aria-hidden="true" className="text-slate-600">
          ·
        </span>
        <span className="font-mono tabular-nums text-red-400">
          {incidents.length} Active Incidents
        </span>
      </div>
    </div>
  );
};

const FallbackNetworkPreview: React.FC<
  Pick<NetworkLiveMapProps, 'hospitals' | 'incidents' | 'onLaunchSos' | 'onOpenCommand'>
> = ({ hospitals, incidents, onLaunchSos, onOpenCommand }) => (
  <div className="futuristic-grid flex h-[360px] flex-col justify-between rounded-xl border border-white/[0.08] bg-[#080D16] p-5">
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
        <Compass className="h-4 w-4 text-sky-400" />
        <span>Regional Trauma Readiness Grid</span>
      </div>
      <span className="font-mono text-xs text-slate-400 tabular-nums">
        {hospitals.length} Active Nodes
      </span>
    </div>

    <div className="my-auto divide-y divide-white/[0.07] rounded-lg border border-white/[0.08] bg-[#0D131F]/90">
      {hospitals.slice(0, 4).map((h) => (
        <div key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-100 truncate">{h.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
              <MapPin className="h-3 w-3 text-sky-400 shrink-0" />
              <span className="truncate">
                {h.area}, {h.city}
              </span>
            </div>
          </div>
          <div className="shrink-0 text-right font-mono text-[11px] tabular-nums">
            <span className="font-semibold text-emerald-400">{h.icuBedsAvailable} ICU</span>
            <span className="mx-1.5 text-slate-600">·</span>
            <span className="text-sky-300">{h.ambulancesReady} Units</span>
          </div>
        </div>
      ))}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
      <span className="text-slate-400 font-mono tabular-nums">
        {incidents.length} live incidents synced
      </span>
      <div className="flex items-center gap-2">
        {onLaunchSos && (
          <button
            type="button"
            onClick={onLaunchSos}
            className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-500 transition-colors whitespace-nowrap"
          >
            Send SOS
          </button>
        )}
        {onOpenCommand && (
          <button
            type="button"
            onClick={onOpenCommand}
            className="rounded-lg bg-sky-400 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-300 transition-colors whitespace-nowrap"
          >
            Command Desk
          </button>
        )}
      </div>
    </div>
  </div>
);

export const NetworkLiveMap: React.FC<NetworkLiveMapProps> = (props) => {
  const { hasProvider, quotaExceeded } = useMapsRuntime();

  if (!hasProvider || quotaExceeded) {
    return (
      <FallbackNetworkPreview
        hospitals={props.hospitals}
        incidents={props.incidents}
        onLaunchSos={props.onLaunchSos}
        onOpenCommand={props.onOpenCommand}
      />
    );
  }

  return <LiveGoogleNetworkInner {...props} />;
};
