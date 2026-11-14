import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Compass,
  EyeOff,
  Loader2,
  MapPin,
  PhoneCall,
  Radio,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  DEMO_LOCATIONS,
  type DemoLocationPreset,
  type Hospital,
  type Incident,
  type IncidentCategory,
} from '../types';
import { BlinkitRouteMap } from './BlinkitRouteMap';

interface CitizenMobileViewProps {
  hospitals: Hospital[];
  incidents: Incident[];
  isEmbeddedSplit?: boolean;
  loggedIn?: boolean;
  onLoggedInChange?: (val: boolean) => void;
  activeIncidentId?: string | null;
  onActiveIncidentChange?: (id: string | null) => void;
}

const CATEGORIES: IncidentCategory[] = [
  'Medical Emergency',
  'Road Accident',
  'Cardiac / Trauma',
  'Public Safety',
  'Fire Hazard',
];

export const CitizenMobileView: React.FC<CitizenMobileViewProps> = ({
  hospitals,
  incidents,
  isEmbeddedSplit = false,
  loggedIn: controlledLoggedIn,
  onLoggedInChange,
  activeIncidentId: controlledActiveIncidentId,
  onActiveIncidentChange,
}) => {
  const [internalLoggedIn, setInternalLoggedIn] = useState(false);
  const loggedIn = controlledLoggedIn ?? internalLoggedIn;
  const setLoggedIn = (val: boolean) => {
    setInternalLoggedIn(val);
    onLoggedInChange?.(val);
  };

  const [citizenName, setCitizenName] = useState('Aarav Verma');
  const [citizenPhone, setCitizenPhone] = useState('+91 98114 55290');
  const [mode, setMode] = useState<'SOS' | 'SECURE_ALERT'>('SOS');
  const [category, setCategory] = useState<IncidentCategory>('Medical Emergency');
  const [notes, setNotes] = useState('');

  const [selectedPreset, setSelectedPreset] = useState<DemoLocationPreset>(DEMO_LOCATIONS[0]);
  const [customCoords, setCustomCoords] = useState<{
    label: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    isDemo: boolean;
  }>({
    label: DEMO_LOCATIONS[0].label,
    latitude: DEMO_LOCATIONS[0].latitude,
    longitude: DEMO_LOCATIONS[0].longitude,
    accuracyMeters: DEMO_LOCATIONS[0].accuracyMeters,
    isDemo: true,
  });

  const [locatingGps, setLocatingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [internalActiveIncidentId, setInternalActiveIncidentId] = useState<string | null>(null);
  const activeIncidentId =
    controlledActiveIncidentId !== undefined ? controlledActiveIncidentId : internalActiveIncidentId;
  const setActiveIncidentId = (id: string | null) => {
    setInternalActiveIncidentId(id);
    onActiveIncidentChange?.(id);
  };

  const activeIncident = incidents.find((i) => i.id === activeIncidentId) || null;

  const handleSelectPreset = (preset: DemoLocationPreset) => {
    setSelectedPreset(preset);
    setCustomCoords({
      label: `${preset.label}, ${preset.city}`,
      latitude: preset.latitude,
      longitude: preset.longitude,
      accuracyMeters: preset.accuracyMeters,
      isDemo: true,
    });
    setGpsNotice(null);
  };

  const handleFetchRealGps = () => {
    if (!navigator.geolocation) {
      setGpsNotice('Browser geolocation unavailable. Using selected regional preset.');
      return;
    }
    setLocatingGps(true);
    setGpsNotice(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCustomCoords({
          label: 'Live Device GPS Coordinates',
          latitude: Number(pos.coords.latitude.toFixed(5)),
          longitude: Number(pos.coords.longitude.toFixed(5)),
          accuracyMeters: Number((pos.coords.accuracy || 12).toFixed(1)),
          isDemo: false,
        });
        setLocatingGps(false);
        setGpsNotice('Live device GPS locked.');
      },
      () => {
        setLocatingGps(false);
        setGpsNotice('Location permission denied or unavailable. Using selected regional preset.');
      },
      { enableHighAccuracy: true, timeout: 6000 },
    );
  };

  const handleSubmitAlert = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: mode === 'SOS' ? 'DISTRESS_SOS' : 'SECURE_ALERT',
          category,
          reporterName: mode === 'SECURE_ALERT' ? 'Anonymous Reporter' : citizenName || 'Citizen User',
          reporterPhone: mode === 'SECURE_ALERT' ? 'Hidden' : citizenPhone || '+91 98XXX XX412',
          locationLabel: customCoords.label,
          latitude: customCoords.latitude,
          longitude: customCoords.longitude,
          accuracyMeters: customCoords.accuracyMeters,
          isDemoLocation: customCoords.isDemo,
          notes,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to transmit alert');
      }
      const created: Incident = await res.json();
      setActiveIncidentId(created.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Network error sending alert');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={
        isEmbeddedSplit
          ? 'mx-auto w-full max-w-[420px] rounded-[26px] border-2 border-white/20 bg-[#0D131F] shadow-2xl overflow-hidden'
          : 'mx-auto w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0D131F] shadow-2xl overflow-hidden'
      }
    >
      {/* Mobile Terminal Top Bar */}
      <div className="flex items-center justify-between border-b border-white/[0.08] bg-[#0A101B] px-4 py-3.5 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600 text-white">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight font-display">Raksha Mobile</div>
            <div className="text-[11px] text-slate-400">
              {loggedIn ? (mode === 'SECURE_ALERT' ? 'Anonymous Mode' : citizenName) : 'Citizen SOS Terminal'}
            </div>
          </div>
        </div>
        {loggedIn && (
          <button
            type="button"
            onClick={() => {
              setLoggedIn(false);
              setActiveIncidentId(null);
            }}
            className="rounded-lg border border-white/15 bg-[#121A2B] px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-[#192338] transition-colors whitespace-nowrap"
          >
            Switch User
          </button>
        )}
      </div>

      {/* Screen 1: Zero-Friction Citizen Access */}
      {!loggedIn ? (
        <div className="p-5 space-y-5">
          <div>
            <div className="text-xs font-semibold text-red-400">Emergency Citizen Access</div>
            <h2 className="mt-1 text-xl font-bold text-white font-display">
              Direct Distress Sign-In
            </h2>
            <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">
              Proceed immediately without account credentials to broadcast your GPS location to the nearest emergency command desk.
            </p>
          </div>

          <div className="space-y-3 rounded-xl bg-[#080D16] p-4 border border-white/[0.06]">
            <div>
              <label htmlFor="citizen-name" className="block text-xs font-medium text-slate-300">
                Full Name (Optional)
              </label>
              <input
                id="citizen-name"
                type="text"
                value={citizenName}
                onChange={(e) => setCitizenName(e.target.value)}
                placeholder="Enter name for responder identification"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0D131F] px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="citizen-phone" className="block text-xs font-medium text-slate-300">
                Callback Number (Optional)
              </label>
              <input
                id="citizen-phone"
                type="tel"
                value={citizenPhone}
                onChange={(e) => setCitizenPhone(e.target.value)}
                placeholder="+91 98XXX XXXXX"
                className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#0D131F] px-3 py-2.5 text-sm text-white font-mono tabular-nums placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <button
              type="button"
              onClick={() => {
                setMode('SOS');
                setLoggedIn(true);
              }}
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-lg bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-300 active:scale-[0.99] transition-all duration-150"
            >
              <UserCheck className="h-4 w-4" />
              <span>Continue to Citizen Portal</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('SECURE_ALERT');
                setLoggedIn(true);
              }}
              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-lg border border-white/15 bg-[#121A2B] px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-[#192338] transition-colors duration-150"
            >
              <EyeOff className="h-4 w-4 text-slate-400" />
              <span>Submit Anonymous Alert</span>
            </button>
          </div>

          <div className="border-t border-white/[0.08] pt-3.5 text-xs text-slate-400 flex items-center justify-between gap-2">
            <span>Native Android Client</span>
            <a
              href="/raksha-sos.apk"
              download="raksha-sos.apk"
              className="font-semibold text-sky-400 hover:text-sky-300 transition-colors"
            >
              Download raksha-sos.apk
            </a>
          </div>
        </div>
      ) : activeIncident ? (
        /* Screen 3: Live Incident Tracking */
        <div className="p-4 space-y-4">
          <div
            className={`rounded-xl border p-3.5 ${
              activeIncident.status === 'REPORTED'
                ? 'border-red-500/40 bg-red-500/10 text-red-100'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {activeIncident.status === 'REPORTED' ? (
                <Radio className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="text-sm font-bold">
                  {activeIncident.status === 'REPORTED'
                    ? 'Distress Signal Broadcasted'
                    : activeIncident.status === 'EN_ROUTE'
                      ? `Responder Dispatched · ETA ${activeIncident.etaMinutes} min`
                      : activeIncident.status === 'ARRIVED'
                        ? 'Ambulance Arrived on Scene'
                        : 'Incident Resolved'}
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  ID <span className="font-mono font-semibold text-white">{activeIncident.id}</span> ·{' '}
                  {activeIncident.status === 'REPORTED'
                    ? 'Awaiting command center acceptance and unit assignment'
                    : `${activeIncident.assignedAmbulanceCode} en route`}
                </div>
              </div>
            </div>
          </div>

          <BlinkitRouteMap incident={activeIncident} hospitals={hospitals} compact />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveIncidentId(null)}
              className="flex-1 min-h-[44px] rounded-lg border border-white/15 bg-[#121A2B] px-4 py-2.5 text-xs font-semibold text-slate-100 hover:bg-[#192338] transition-colors"
            >
              Send Another Signal
            </button>
            <a
              href="tel:112"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-sky-400 px-5 py-2.5 text-xs font-semibold text-slate-950 hover:bg-sky-300 transition-colors"
            >
              <PhoneCall className="h-3.5 w-3.5" />
              <span>Dial 112</span>
            </a>
          </div>
        </div>
      ) : (
        /* Screen 2: Citizen Dashboard — Distress SOS & Secure Alert */
        <div className="p-4 space-y-4">
          {/* Segmented Mode Switcher */}
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-white/[0.08] bg-[#06090F] p-1">
            <button
              type="button"
              onClick={() => setMode('SOS')}
              className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'SOS'
                  ? 'bg-red-600 text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Distress SOS
            </button>
            <button
              type="button"
              onClick={() => setMode('SECURE_ALERT')}
              className={`min-h-[38px] rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'SECURE_ALERT'
                  ? 'bg-sky-400 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Secure Alert (Anon)
            </button>
          </div>

          {/* Captured GPS Coordinates Well */}
          <div className="rounded-xl bg-[#080D16] p-3.5 space-y-2.5 border border-white/[0.06]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                <MapPin className="h-3.5 w-3.5 text-sky-400" />
                <span>Location Coordinates</span>
              </div>
              <button
                type="button"
                onClick={handleFetchRealGps}
                disabled={locatingGps}
                className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-[#121A2B] px-3 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-[#192338] transition-colors disabled:opacity-60"
              >
                {locatingGps ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Compass className="h-3 w-3" />
                )}
                <span>Use Device GPS</span>
              </button>
            </div>

            <div className="text-sm font-semibold text-white">{customCoords.label}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums text-xs text-slate-300">
              <span>{customCoords.latitude.toFixed(4)}° N</span>
              <span>{customCoords.longitude.toFixed(4)}° E</span>
              <span>±{customCoords.accuracyMeters.toFixed(1)} m</span>
              <span className="text-slate-500">
                {customCoords.isDemo ? 'Regional Preset' : 'Live GPS'}
              </span>
            </div>

            {gpsNotice && <div className="text-xs text-sky-400">{gpsNotice}</div>}

            <div className="pt-1">
              <label htmlFor="demo-loc-select" className="block text-[11px] font-medium text-slate-400 mb-1">
                Location Preset (When Device GPS Is Unavailable)
              </label>
              <select
                id="demo-loc-select"
                value={selectedPreset.id}
                onChange={(e) => {
                  const found = DEMO_LOCATIONS.find((d) => d.id === e.target.value);
                  if (found) handleSelectPreset(found);
                }}
                className="w-full rounded-lg border border-white/10 bg-[#0D131F] px-3 py-2 text-xs font-medium text-slate-100 focus:border-sky-400 focus:outline-none"
              >
                {DEMO_LOCATIONS.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.label} ({loc.city})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Emergency Category Buttons */}
          <div>
            <div className="text-xs font-medium text-slate-300 mb-1.5">Emergency Category</div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === cat
                      ? 'border-sky-400 bg-sky-400 text-slate-950 font-semibold'
                      : 'border-white/10 bg-[#080D16] text-slate-300 hover:border-white/25 hover:text-white'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <label htmlFor="sos-notes" className="block text-xs font-medium text-slate-300 mb-1">
              Brief Situation Note (Optional)
            </label>
            <input
              id="sos-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                mode === 'SOS'
                  ? 'e.g., Severe chest pain near metro gate 2'
                  : 'e.g., Two-wheeler collision at intersection'
              }
              className="w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2.5 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
            />
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {submitError}
            </div>
          )}

          {/* High-Contrast SOS Trigger */}
          <div className="relative pt-0.5">
            {mode === 'SOS' && !submitting && (
              <span
                aria-hidden="true"
                className="sos-pulse-ring pointer-events-none absolute inset-0 rounded-xl border-2 border-red-500/70 bg-red-500/15"
              />
            )}
            <button
              type="button"
              onClick={handleSubmitAlert}
              disabled={submitting}
              className={`relative w-full min-h-[58px] rounded-xl px-5 py-4 font-display font-bold text-base flex items-center justify-center gap-2.5 shadow-lg active:scale-[0.98] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 disabled:opacity-70 ${
                mode === 'SOS'
                  ? `bg-red-600 text-white hover:bg-red-500 shadow-red-600/25 ${!submitting ? 'sos-trigger-active' : ''}`
                  : 'bg-sky-400 text-slate-950 hover:bg-sky-300'
              }`}
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
              <span>
                {submitting
                  ? 'Transmitting GPS & Alert...'
                  : mode === 'SOS'
                    ? 'Send SOS Distress Signal'
                    : 'Submit Anonymous Alert'}
              </span>
            </button>
          </div>

          <p className="text-center text-[11px] text-slate-500">
            Transmits live GPS coordinates directly to the emergency command desk.
          </p>
        </div>
      )}
    </div>
  );
};
