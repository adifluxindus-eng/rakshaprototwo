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
          ? 'mx-auto w-full max-w-[420px] rounded-[28px] border-[6px] border-[#0F4C9C] bg-white shadow-xl overflow-hidden'
          : 'mx-auto w-full max-w-md rounded-[24px] border border-slate-200/80 bg-white shadow-[0_4px_20px_rgba(15,23,42,0.05)] overflow-hidden'
      }
    >
      {/* Mobile Top App Bar */}
      <div className="flex items-center justify-between bg-gradient-to-r from-[#1251A3] to-[#0B3F84] px-4 py-3.5 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-600 shadow-xs">
            <ShieldCheck className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold leading-tight font-display">Raksha Mobile</div>
            <div className="text-[11px] text-sky-100/90">
              {loggedIn ? (mode === 'SECURE_ALERT' ? 'Anonymous Mode' : citizenName) : 'Citizen SOS App'}
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
            className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/25 transition-colors"
          >
            Switch User
          </button>
        )}
      </div>

      {/* Screen 1: Zero-Friction Citizen Access */}
      {!loggedIn ? (
        <div className="p-5 space-y-5">
          <div>
            <div className="text-xs font-medium text-red-700">Emergency Citizen Access</div>
            <h2 className="mt-1 text-xl font-bold text-slate-900 font-display">
              Direct Distress Sign-In
            </h2>
            <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
              Proceed immediately without account credentials to broadcast your GPS location to the nearest emergency command desk.
            </p>
          </div>

          <div className="space-y-3 rounded-2xl bg-[#F5F7FB] p-4">
            <div>
              <label htmlFor="citizen-name" className="block text-xs font-medium text-slate-700">
                Full Name (Optional)
              </label>
              <input
                id="citizen-name"
                type="text"
                value={citizenName}
                onChange={(e) => setCitizenName(e.target.value)}
                placeholder="Enter name for responder identification"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:border-[#0F4C9C] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="citizen-phone" className="block text-xs font-medium text-slate-700">
                Callback Number (Optional)
              </label>
              <input
                id="citizen-phone"
                type="tel"
                value={citizenPhone}
                onChange={(e) => setCitizenPhone(e.target.value)}
                placeholder="+91 98XXX XXXXX"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 font-mono tabular-nums focus:border-[#0F4C9C] focus:outline-none"
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
              className="flex w-full min-h-[48px] items-center justify-center gap-2 rounded-full bg-[#0F4C9C] px-5 py-3 text-sm font-semibold text-white hover:bg-[#0B3D80] active:scale-[0.99] transition-all duration-150"
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
              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-[#F5F7FB] px-4 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-100 transition-colors duration-150"
            >
              <EyeOff className="h-4 w-4 text-slate-600" />
              <span>Submit Anonymous Alert</span>
            </button>
          </div>

          <div className="border-t border-slate-100 pt-3 text-xs text-slate-500 flex items-center justify-between gap-2">
            <span>Native Android Client</span>
            <a
              href="/raksha-sos.apk"
              download="raksha-sos.apk"
              className="font-semibold text-[#0F4C9C] hover:underline underline-offset-2"
            >
              Download raksha-sos.apk
            </a>
          </div>
        </div>
      ) : activeIncident ? (
        /* Screen 3: Live Incident Tracking (Updates automatically when Admin accepts!) */
        <div className="p-4 space-y-4">
          <div
            className={`rounded-xl border p-3.5 ${
              activeIncident.status === 'REPORTED'
                ? 'border-red-200 bg-red-50 text-red-950'
                : 'border-emerald-200 bg-emerald-50 text-emerald-950'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                {activeIncident.status === 'REPORTED' ? (
                  <Radio className="h-5 w-5 text-red-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
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
                  <div className="text-xs opacity-85 mt-0.5">
                    ID <span className="font-mono font-semibold">{activeIncident.id}</span> ·{' '}
                    {activeIncident.status === 'REPORTED'
                      ? 'Awaiting command center acceptance and unit assignment'
                      : `${activeIncident.assignedAmbulanceCode} en route`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Blinkit-style Live Route Map inside Mobile View */}
          <BlinkitRouteMap incident={activeIncident} hospitals={hospitals} compact />

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveIncidentId(null)}
              className="flex-1 min-h-[44px] rounded-full border border-slate-200 bg-[#F5F7FB] px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
            >
              Send Another Signal
            </button>
            <a
              href="tel:112"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full bg-[#0F4C9C] px-5 py-2.5 text-xs font-semibold text-white hover:bg-[#0B3D80] transition-colors"
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
          <div className="grid grid-cols-2 gap-1 rounded-full bg-[#F3F6FB] p-1">
            <button
              type="button"
              onClick={() => setMode('SOS')}
              className={`min-h-[38px] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'SOS'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Distress SOS
            </button>
            <button
              type="button"
              onClick={() => setMode('SECURE_ALERT')}
              className={`min-h-[38px] rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                mode === 'SECURE_ALERT'
                  ? 'bg-[#0F4C9C] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Secure Alert (Anon)
            </button>
          </div>

          {/* Captured GPS Coordinates Card */}
          <div className="rounded-2xl bg-[#F5F7FB] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                <MapPin className="h-3.5 w-3.5 text-[#0F4C9C]" />
                <span>Location Coordinates</span>
              </div>
              <button
                type="button"
                onClick={handleFetchRealGps}
                disabled={locatingGps}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-[#0F4C9C] hover:bg-slate-50 transition-colors disabled:opacity-60"
              >
                {locatingGps ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Compass className="h-3 w-3" />
                )}
                <span>Use Device GPS</span>
              </button>
            </div>

            <div className="text-sm font-semibold text-slate-900">{customCoords.label}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums text-xs text-slate-600">
              <span>{customCoords.latitude.toFixed(4)}° N</span>
              <span>{customCoords.longitude.toFixed(4)}° E</span>
              <span>±{customCoords.accuracyMeters.toFixed(1)} m</span>
              <span className="text-slate-400">
                {customCoords.isDemo ? 'Regional Preset' : 'Live GPS'}
              </span>
            </div>

            {gpsNotice && <div className="text-xs text-[#0F4C9C]">{gpsNotice}</div>}

            {/* Regional Location Quick Picker */}
            <div className="pt-1">
              <label htmlFor="demo-loc-select" className="block text-[11px] font-medium text-slate-500 mb-1">
                Location Preset (When Device GPS Is Unavailable)
              </label>
              <select
                id="demo-loc-select"
                value={selectedPreset.id}
                onChange={(e) => {
                  const found = DEMO_LOCATIONS.find((d) => d.id === e.target.value);
                  if (found) handleSelectPreset(found);
                }}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 focus:border-[#0F4C9C] focus:outline-none"
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
            <div className="text-xs font-medium text-slate-700 mb-1.5">Emergency Category</div>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    category === cat
                      ? 'border-[#0F4C9C] bg-[#0F4C9C] text-white'
                      : 'border-slate-200 bg-[#F7F9FC] text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Note */}
          <div>
            <label htmlFor="sos-notes" className="block text-xs font-medium text-slate-700 mb-1">
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
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
            />
          </div>

          {submitError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {submitError}
            </div>
          )}

          {/* Giant Thumb-Friendly SOS Trigger */}
          <div className="relative pt-0.5">
            {mode === 'SOS' && !submitting && (
              <span
                aria-hidden="true"
                className="sos-pulse-ring pointer-events-none absolute inset-0 rounded-2xl border-2 border-red-500/70 bg-red-500/15"
              />
            )}
            <button
              type="button"
              onClick={handleSubmitAlert}
              disabled={submitting}
              className={`relative w-full min-h-[60px] rounded-2xl px-5 py-4 text-white font-display font-bold text-base flex items-center justify-center gap-2.5 shadow-md active:scale-[0.98] transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600 disabled:opacity-70 ${
                mode === 'SOS'
                  ? `bg-red-600 hover:bg-red-700 shadow-red-600/20 ${!submitting ? 'sos-trigger-active' : ''}`
                  : 'bg-slate-900 hover:bg-slate-800 shadow-slate-900/15'
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
