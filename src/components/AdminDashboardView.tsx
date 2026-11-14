import React, { useEffect, useState } from 'react';
import {
  AlertOctagon,
  Bell,
  Building2,
  Check,
  Clock,
  Hospital as HospitalIcon,
  Lock,
  MapPin,
  Plus,
  Shield,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { DEMO_LOCATIONS, type Hospital, type Incident } from '../types';
import { emergencyAlarm } from '../utils/alarm';
import { BlinkitRouteMap } from './BlinkitRouteMap';

interface AdminDashboardViewProps {
  hospitals: Hospital[];
  incidents: Incident[];
  wsConnected: boolean;
  latestIncomingAlert: Incident | null;
  clearIncomingAlert: () => void;
  isEmbeddedSplit?: boolean;
  authenticated?: boolean;
  onAuthenticatedChange?: (val: boolean) => void;
}

interface CapacityStatusMeta {
  level: 'optimal' | 'limited' | 'critical';
  label: 'Optimal' | 'Limited' | 'Critical';
  dotClass: string;
  textClass: string;
}

function getHospitalCapacityStatus(hospital: Pick<Hospital, 'icuBedsAvailable' | 'ambulancesReady'>): CapacityStatusMeta {
  if (hospital.icuBedsAvailable <= 4 || hospital.ambulancesReady <= 1) {
    return {
      level: 'critical',
      label: 'Critical',
      dotClass: 'bg-red-500',
      textClass: 'text-red-400',
    };
  }
  if (hospital.icuBedsAvailable <= 10 || hospital.ambulancesReady <= 3) {
    return {
      level: 'limited',
      label: 'Limited',
      dotClass: 'bg-amber-400',
      textClass: 'text-amber-400',
    };
  }
  return {
    level: 'optimal',
    label: 'Optimal',
    dotClass: 'bg-emerald-400',
    textClass: 'text-emerald-400',
  };
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  hospitals,
  incidents,
  wsConnected,
  latestIncomingAlert,
  clearIncomingAlert,
  isEmbeddedSplit = false,
  authenticated: controlledAuthenticated,
  onAuthenticatedChange,
}) => {
  const [internalAuthenticated, setInternalAuthenticated] = useState(false);
  const authenticated = controlledAuthenticated ?? internalAuthenticated;
  const setAuthenticated = (val: boolean) => {
    setInternalAuthenticated(val);
    onAuthenticatedChange?.(val);
  };
  const [email, setEmail] = useState('admin@raksha.ai');
  const [password, setPassword] = useState('raksha2026');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  const [activeTab, setActiveTab] = useState<'dispatch' | 'hospitals'>('dispatch');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REPORTED' | 'ACTIVE' | 'RESOLVED'>('ALL');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedDispatchHospitalId, setSelectedDispatchHospitalId] = useState<string>('');
  const [alarmMuted, setAlarmMuted] = useState(false);
  const [alarmActive, setAlarmActive] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const [showAddHospitalForm, setShowAddHospitalForm] = useState(false);
  const [hospName, setHospName] = useState('');
  const [hospCity, setHospCity] = useState('New Delhi');
  const [hospArea, setHospArea] = useState('');
  const [hospAddress, setHospAddress] = useState('');
  const [hospLat, setHospLat] = useState('28.6289');
  const [hospLng, setHospLng] = useState('77.2065');
  const [hospBeds, setHospBeds] = useState('12');
  const [hospAmbs, setHospAmbs] = useState('4');
  const [hospPhone, setHospPhone] = useState('+91 11 4050 2200');
  const [addingHospital, setAddingHospital] = useState(false);
  const [hospitalMsg, setHospitalMsg] = useState<string | null>(null);

  const pendingIncidents = incidents.filter((i) => i.status === 'REPORTED');
  const popupIncident =
    (latestIncomingAlert &&
      incidents.find((i) => i.id === latestIncomingAlert.id && i.status === 'REPORTED')) ||
    pendingIncidents[0] ||
    null;

  useEffect(() => {
    if (!authenticated) {
      emergencyAlarm.stop();
      setAlarmActive(false);
      return;
    }

    if (pendingIncidents.length > 0 && !alarmMuted) {
      emergencyAlarm.start();
      setAlarmActive(true);
    } else {
      emergencyAlarm.stop();
      setAlarmActive(false);
    }

    return () => {
      emergencyAlarm.stop();
    };
  }, [authenticated, pendingIncidents.length, alarmMuted]);

  useEffect(() => {
    if (popupIncident?.assignedHospitalId) {
      setSelectedDispatchHospitalId(popupIncident.assignedHospitalId);
    } else if (hospitals[0]) {
      setSelectedDispatchHospitalId(hospitals[0].id);
    }
  }, [popupIncident?.id, popupIncident?.assignedHospitalId, hospitals]);

  const selectedIncident =
    incidents.find((i) => i.id === selectedIncidentId) || incidents[0] || null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    emergencyAlarm.unlock();
    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Authentication failed');
      }
      setAuthenticated(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Unable to sign in');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleAcceptIncident = async (incidentId: string, hospitalId?: string) => {
    setAcceptingId(incidentId);
    emergencyAlarm.stop();
    setAlarmActive(false);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId: hospitalId || selectedDispatchHospitalId }),
      });
      if (res.ok) {
        const updated: Incident = await res.json();
        setSelectedIncidentId(updated.id);
        clearIncomingAlert();
        setActiveTab('dispatch');
      }
    } finally {
      setAcceptingId(null);
    }
  };

  const handleUpdateStatus = async (incidentId: string, status: 'ARRIVED' | 'RESOLVED') => {
    await fetch(`/api/incidents/${incidentId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  };

  const handleAddHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hospName.trim() || !hospCity.trim()) return;
    setAddingHospital(true);
    setHospitalMsg(null);
    try {
      const res = await fetch('/api/hospitals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: hospName,
          city: hospCity,
          area: hospArea || 'Central Zone',
          address: hospAddress || `${hospArea || 'Central Zone'}, ${hospCity}`,
          latitude: Number(hospLat) || 28.6289,
          longitude: Number(hospLng) || 77.2065,
          icuBedsAvailable: Number(hospBeds) || 10,
          ambulancesReady: Number(hospAmbs) || 3,
          phone: hospPhone,
        }),
      });
      if (res.ok) {
        const created: Hospital = await res.json();
        setHospitalMsg(`Added ${created.name} (${created.id}) to active dispatch network.`);
        setHospName('');
        setHospArea('');
        setHospAddress('');
        setShowAddHospitalForm(false);
      }
    } finally {
      setAddingHospital(false);
    }
  };

  const filteredIncidents = incidents.filter((inc) => {
    if (statusFilter === 'REPORTED') return inc.status === 'REPORTED';
    if (statusFilter === 'ACTIVE') {
      return inc.status === 'ACCEPTED' || inc.status === 'EN_ROUTE' || inc.status === 'ARRIVED';
    }
    if (statusFilter === 'RESOLVED') return inc.status === 'RESOLVED';
    return true;
  });

  if (!authenticated) {
    return (
      <div className="mx-auto w-full max-w-md rounded-2xl border border-white/[0.08] bg-[#0D131F] p-7 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-400 text-slate-950">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white font-display">
                Command Center Authentication
              </h2>
              <p className="text-xs text-slate-400">
                Access live emergency dispatch, trauma capacity, and fleet routing
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between rounded-lg border border-white/[0.06] bg-[#080D16] px-3.5 py-2 text-xs">
          <span className="text-slate-400">Dispatch Telemetry</span>
          <span className={`inline-flex items-center gap-2 font-medium ${wsConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                wsConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]' : 'bg-amber-400 animate-pulse'
              }`}
            />
            <span>{wsConnected ? 'Connected' : 'Reconnecting'}</span>
          </span>
        </div>

        <form onSubmit={handleLogin} className="mt-5 space-y-3.5">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-medium text-slate-300">
              Operator Email
            </label>
            <input
              id="admin-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#080D16] px-3.5 py-2.5 text-sm text-white focus:border-sky-400 focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="admin-password" className="block text-xs font-medium text-slate-300">
              Access Passkey
            </label>
            <input
              id="admin-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-[#080D16] px-3.5 py-2.5 text-sm text-white font-mono focus:border-sky-400 focus:outline-none"
            />
          </div>

          {loginError && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {loginError}
            </div>
          )}

          <div className="rounded-lg bg-[#080D16] border border-white/[0.06] px-3.5 py-2.5 text-xs text-slate-400 flex items-center justify-between gap-2">
            <span>Operator Access</span>
            <span className="font-mono text-sky-300 font-medium">admin@raksha.ai / raksha2026</span>
          </div>

          {pendingIncidents.length > 0 && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2 text-xs font-semibold text-red-200">
              {pendingIncidents.length} priority SOS alert waiting — sign in to review and dispatch.
            </div>
          )}

          <button
            type="submit"
            disabled={loggingIn}
            className="flex w-full min-h-[46px] items-center justify-center gap-2 rounded-lg bg-sky-400 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-sky-300 transition-colors disabled:opacity-60"
          >
            <Lock className="h-4 w-4" />
            <span>{loggingIn ? 'Verifying...' : 'Sign In to Command Center'}</span>
          </button>
        </form>
      </div>
    );
  }

  const activeDispatchCount = incidents.filter(
    (i) => i.status === 'ACCEPTED' || i.status === 'EN_ROUTE' || i.status === 'ARRIVED',
  ).length;
  const totalAvailableIcuBeds = hospitals.reduce((sum, h) => sum + h.icuBedsAvailable, 0);
  const optimalHospitalsCount = hospitals.filter((h) => getHospitalCapacityStatus(h).level === 'optimal').length;
  const limitedHospitalsCount = hospitals.filter((h) => getHospitalCapacityStatus(h).level === 'limited').length;
  const criticalHospitalsCount = hospitals.filter((h) => getHospitalCapacityStatus(h).level === 'critical').length;
  const networkCapacityStatus: CapacityStatusMeta =
    hospitals.length === 0 || criticalHospitalsCount > hospitals.length / 2 || totalAvailableIcuBeds <= 8
      ? { level: 'critical', label: 'Critical', dotClass: 'bg-red-500', textClass: 'text-red-400' }
      : limitedHospitalsCount > 0 || criticalHospitalsCount > 0
        ? { level: 'limited', label: 'Limited', dotClass: 'bg-amber-400', textClass: 'text-amber-400' }
        : { level: 'optimal', label: 'Optimal', dotClass: 'bg-emerald-400', textClass: 'text-emerald-400' };
  const selectedDispatchHospital =
    hospitals.find((h) => h.id === selectedDispatchHospitalId) || hospitals[0] || null;
  const selectedDispatchCapacity = selectedDispatchHospital
    ? getHospitalCapacityStatus(selectedDispatchHospital)
    : null;

  return (
    <div className="space-y-4">
      {/* Command Bar Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/[0.08] bg-[#0D131F] px-5 py-3.5">
        <div className="min-w-0">
          <div className="text-sm font-bold text-white font-display">
            Raksha AI Control Room
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
            <span>Officer Priya Sharma</span>
            <span aria-hidden="true">·</span>
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${
                wsConnected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  wsConnected
                    ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.75)]'
                    : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span>{wsConnected ? 'WebSocket Connected' : 'Reconnecting...'}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{hospitals.length} Hospitals</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#06090F] p-1">
            <button
              type="button"
              onClick={() => setActiveTab('dispatch')}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'dispatch'
                  ? 'bg-[#1B263B] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Emergency Dispatch ({incidents.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('hospitals')}
              className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                activeTab === 'hospitals'
                  ? 'bg-[#1B263B] text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Hospitals &amp; Add ({hospitals.length})
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              emergencyAlarm.unlock();
              setAlarmMuted((m) => !m);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
              alarmActive && !alarmMuted
                ? 'border-red-500/60 bg-red-500/15 text-red-200'
                : 'border-white/15 bg-[#121A2B] text-slate-200 hover:bg-[#192338]'
            }`}
          >
            {alarmMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5 text-sky-400" />}
            <span>{alarmMuted ? 'Alarm Muted' : alarmActive ? 'Siren Active' : 'Alarm Ready'}</span>
          </button>

          <button
            type="button"
            onClick={() => setAuthenticated(false)}
            className="rounded-lg border border-white/15 bg-[#121A2B] px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-[#192338] hover:text-white transition-colors whitespace-nowrap"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* 4-Column Interactive KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => {
            setActiveTab('dispatch');
            setStatusFilter('REPORTED');
          }}
          className={`text-left rounded-xl border px-4 py-3.5 transition-colors ${
            activeTab === 'dispatch' && statusFilter === 'REPORTED'
              ? 'border-red-500/70 bg-red-500/10'
              : 'border-white/[0.08] bg-[#0D131F] hover:border-white/20'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-400">Pending Alerts</div>
          <div
            className={`mt-1 text-2xl font-bold font-display tabular-nums ${
              pendingIncidents.length > 0 ? 'text-red-400' : 'text-white'
            }`}
          >
            {pendingIncidents.length}
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('dispatch');
            setStatusFilter('ACTIVE');
          }}
          className={`text-left rounded-xl border px-4 py-3.5 transition-colors ${
            activeTab === 'dispatch' && statusFilter === 'ACTIVE'
              ? 'border-sky-400/70 bg-sky-400/10'
              : 'border-white/[0.08] bg-[#0D131F] hover:border-white/20'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-400">Active Units</div>
          <div className="mt-1 text-2xl font-bold font-display tabular-nums text-sky-400">
            {activeDispatchCount}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hospitals')}
          className={`text-left rounded-xl border px-4 py-3.5 transition-colors ${
            activeTab === 'hospitals'
              ? 'border-sky-400/70 bg-sky-400/10'
              : 'border-white/[0.08] bg-[#0D131F] hover:border-white/20'
          }`}
        >
          <div className="text-[11px] font-medium text-slate-400">Partner Hospitals</div>
          <div className="mt-1 text-2xl font-bold font-display tabular-nums text-white">
            {hospitals.length}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[11px] font-mono tabular-nums text-slate-400">
            <span className="inline-flex items-center gap-1 text-emerald-400">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>{optimalHospitalsCount}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-amber-400">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              <span>{limitedHospitalsCount}</span>
            </span>
            <span className="inline-flex items-center gap-1 text-red-400">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span>{criticalHospitalsCount}</span>
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hospitals')}
          className="text-left rounded-xl border border-white/[0.08] bg-[#0D131F] px-4 py-3.5 hover:border-white/20 transition-colors"
        >
          <div className="flex items-center justify-between gap-2 text-[11px] font-medium text-slate-400">
            <span>Available ICU Beds</span>
            <span className={`inline-flex items-center gap-1.5 font-semibold ${networkCapacityStatus.textClass}`}>
              <span aria-hidden="true" className={`h-2 w-2 rounded-full ${networkCapacityStatus.dotClass}`} />
              <span>{networkCapacityStatus.label}</span>
            </span>
          </div>
          <div className={`mt-1 text-2xl font-bold font-display tabular-nums ${networkCapacityStatus.textClass}`}>
            {totalAvailableIcuBeds}
          </div>
        </button>
      </div>

      {/* Priority Incoming SOS Alert Dialog */}
      {popupIncident && (
        <div
          role="alertdialog"
          aria-live="assertive"
          className="rounded-xl border border-red-500/70 bg-red-950/35 p-4 shadow-xl"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white">
                <AlertOctagon className="h-6 w-6" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-red-300">
                  <span className="inline-flex items-center gap-1">
                    <Bell className="h-3.5 w-3.5" />
                    {popupIncident.type === 'DISTRESS_SOS'
                      ? 'Priority SOS Alert'
                      : 'Priority Anonymous Alert'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums text-white">{popupIncident.id}</span>
                  <span aria-hidden="true">·</span>
                  <span>{popupIncident.category}</span>
                </div>
                <h3 className="mt-0.5 text-base font-bold text-white font-display">
                  {popupIncident.locationLabel}
                </h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
                  <span>Reporter: {popupIncident.reporterName}</span>
                  <span className="font-mono tabular-nums">
                    {popupIncident.latitude.toFixed(4)}° N, {popupIncident.longitude.toFixed(4)}° E
                  </span>
                  <span className="font-mono tabular-nums">
                    Accuracy ±{popupIncident.accuracyMeters.toFixed(1)} m
                  </span>
                  <span className="font-mono tabular-nums">
                    Est. {popupIncident.distanceKm.toFixed(2)} km
                  </span>
                </div>
                {popupIncident.notes && (
                  <p className="mt-1.5 text-xs text-slate-200">Note: {popupIncident.notes}</p>
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
              <div className="flex flex-col gap-1">
                <select
                  aria-label="Select hospital for dispatch"
                  value={selectedDispatchHospitalId}
                  onChange={(e) => setSelectedDispatchHospitalId(e.target.value)}
                  className="rounded-lg border border-red-400/30 bg-[#0A101C] px-3 py-2 text-xs font-medium text-white focus:border-red-400 focus:outline-none"
                >
                  {hospitals.map((h) => {
                    const cap = getHospitalCapacityStatus(h);
                    return (
                      <option key={h.id} value={h.id}>
                        {h.name} ({h.icuBedsAvailable} ICU · {cap.label})
                      </option>
                    );
                  })}
                </select>
                {selectedDispatchHospital && selectedDispatchCapacity && (
                  <div className="flex items-center gap-2 px-1 text-[11px] text-slate-300">
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${selectedDispatchCapacity.textClass}`}>
                      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${selectedDispatchCapacity.dotClass}`} />
                      <span>{selectedDispatchCapacity.label} Capacity</span>
                    </span>
                    <span aria-hidden="true" className="text-slate-600">·</span>
                    <span className="font-mono tabular-nums">
                      {selectedDispatchHospital.ambulancesReady} Units Ready
                    </span>
                  </div>
                )}
              </div>

              <button
                type="button"
                disabled={acceptingId === popupIncident.id}
                onClick={() => handleAcceptIncident(popupIncident.id, selectedDispatchHospitalId)}
                className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 transition-colors whitespace-nowrap disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
                <span>
                  {acceptingId === popupIncident.id
                    ? 'Dispatching...'
                    : 'Accept & Open Live Route'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: Live Emergency Dispatch & Route View */}
      {activeTab === 'dispatch' ? (
        <div className={`grid gap-4 ${isEmbeddedSplit ? 'grid-cols-1' : 'grid-cols-1 lg:grid-cols-12'}`}>
          {/* Left Column: Live Incident Queue */}
          <div
            className={`${
              isEmbeddedSplit ? '' : 'lg:col-span-5'
            } rounded-xl border border-white/[0.08] bg-[#0D131F] overflow-hidden`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] px-5 py-3.5">
              <h3 className="text-sm font-bold text-white font-display">Live Incident Feed</h3>
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#06090F] p-1 text-[11px]">
                {(['ALL', 'REPORTED', 'ACTIVE', 'RESOLVED'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                      statusFilter === tab
                        ? 'bg-[#1B263B] text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {tab === 'ALL' ? 'All' : tab === 'REPORTED' ? 'Pending' : tab === 'ACTIVE' ? 'En Route' : 'Done'}
                  </button>
                ))}
              </div>
            </div>

            {filteredIncidents.length === 0 ? (
              <div className="p-8 text-center">
                <MapPin className="mx-auto h-7 w-7 text-sky-400/50" />
                <div className="mt-2.5 text-sm font-semibold text-white">
                  No active distress alerts
                </div>
                <p className="mt-1 text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
                  Incoming citizen SOS broadcasts and mobile APK alerts will appear here immediately with GPS precision and nearest trauma center matching.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06] max-h-[440px] overflow-y-auto">
                {filteredIncidents.map((inc) => {
                  const isSelected = selectedIncident?.id === inc.id;
                  return (
                    <div
                      key={inc.id}
                      onClick={() => setSelectedIncidentId(inc.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedIncidentId(inc.id);
                      }}
                      className={`w-full text-left px-5 py-3.5 cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#152033]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs">
                            <span className="font-mono font-semibold text-slate-100">{inc.id}</span>
                            <span aria-hidden="true" className="text-slate-600">
                              ·
                            </span>
                            <span
                              className={
                                inc.status === 'REPORTED'
                                  ? 'font-semibold text-red-400'
                                  : inc.status === 'RESOLVED'
                                    ? 'font-medium text-slate-400'
                                    : 'font-semibold text-emerald-400'
                              }
                            >
                              {inc.status === 'REPORTED'
                                ? 'Needs Acceptance'
                                : inc.status === 'EN_ROUTE'
                                  ? `En Route (${inc.etaMinutes}m)`
                                  : inc.status}
                            </span>
                          </div>
                          <div className="mt-1 text-sm font-semibold text-white truncate">
                            {inc.locationLabel}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                            <span>{inc.reporterName}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono tabular-nums">
                              {inc.latitude.toFixed(4)}, {inc.longitude.toFixed(4)}
                            </span>
                          </div>
                        </div>

                        {inc.status === 'REPORTED' ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAcceptIncident(inc.id);
                            }}
                            className="shrink-0 rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 transition-colors"
                          >
                            Accept
                          </button>
                        ) : (
                          <span className="shrink-0 text-xs font-mono text-slate-400 flex items-center gap-1 tabular-nums">
                            <Clock className="h-3 w-3" />
                            {new Date(inc.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Live Route & Navigation Map */}
          <div className={`${isEmbeddedSplit ? '' : 'lg:col-span-7'}`}>
            {selectedIncident ? (
              <BlinkitRouteMap
                incident={selectedIncident}
                hospitals={hospitals}
                isAdminView
                onUpdateStatus={handleUpdateStatus}
              />
            ) : (
              <div className="flex h-full min-h-[340px] flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#0D131F] p-8 text-center">
                <HospitalIcon className="h-8 w-8 text-sky-400/50" />
                <div className="mt-3 text-sm font-semibold text-white">
                  Dispatch Telemetry Map Standby
                </div>
                <p className="mt-1 max-w-sm text-xs text-slate-400 leading-relaxed">
                  Accept an incoming SOS alert or select an active incident to initiate live ambulance routing, ETA telemetry, and hospital handover controls.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 2: Hospital Network & Add Hospital Form */
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#0D131F] px-5 py-3.5">
            <div>
              <h3 className="text-sm font-bold text-white font-display">
                Registered Emergency Hospitals
              </h3>
              <p className="text-xs text-slate-400">
                Add a new partner hospital below — it immediately joins nearest-hospital SOS routing and appears on the dispatch map.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddHospitalForm((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-300 transition-colors whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{showAddHospitalForm ? 'Close Form' : 'Add Hospital'}</span>
            </button>
          </div>

          {hospitalMsg && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-2.5 text-xs font-medium text-emerald-200">
              {hospitalMsg}
            </div>
          )}

          {showAddHospitalForm && (
            <form
              onSubmit={handleAddHospital}
              className="rounded-xl border border-white/[0.08] bg-[#0D131F] p-6 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-white font-display">
                  Register New Hospital Facility
                </h4>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">Quick Coordinates:</span>
                  {DEMO_LOCATIONS.slice(0, 3).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setHospCity(preset.city);
                        setHospArea(preset.area);
                        setHospLat((preset.latitude + 0.008).toFixed(4));
                        setHospLng((preset.longitude - 0.009).toFixed(4));
                      }}
                      className="rounded-lg border border-white/10 bg-[#080D16] px-3 py-1 text-[11px] font-medium text-sky-300 hover:border-sky-400/50"
                    >
                      Near {preset.city}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300">Hospital Name *</label>
                  <input
                    type="text"
                    required
                    value={hospName}
                    onChange={(e) => setHospName(e.target.value)}
                    placeholder="e.g., Apollo Trauma Center"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">City *</label>
                  <input
                    type="text"
                    required
                    value={hospCity}
                    onChange={(e) => setHospCity(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Area / Zone</label>
                  <input
                    type="text"
                    value={hospArea}
                    onChange={(e) => setHospArea(e.target.value)}
                    placeholder="e.g., Sarita Vihar"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Latitude *</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={hospLat}
                    onChange={(e) => setHospLat(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Longitude *</label>
                  <input
                    type="number"
                    step="0.0001"
                    required
                    value={hospLng}
                    onChange={(e) => setHospLng(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Emergency Phone</label>
                  <input
                    type="text"
                    value={hospPhone}
                    onChange={(e) => setHospPhone(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">ICU Beds Available</label>
                  <input
                    type="number"
                    min="1"
                    value={hospBeds}
                    onChange={(e) => setHospBeds(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Ambulances Ready</label>
                  <input
                    type="number"
                    min="1"
                    value={hospAmbs}
                    onChange={(e) => setHospAmbs(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs font-mono text-white focus:border-sky-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300">Street Address</label>
                  <input
                    type="text"
                    value={hospAddress}
                    onChange={(e) => setHospAddress(e.target.value)}
                    placeholder="Optional full street address"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddHospitalForm(false)}
                  className="rounded-lg border border-white/15 bg-[#121A2B] px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-[#192338]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addingHospital}
                  className="rounded-lg bg-sky-400 px-5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-300 disabled:opacity-60"
                >
                  {addingHospital ? 'Saving Hospital...' : 'Save & Activate Hospital'}
                </button>
              </div>
            </form>
          )}

          {/* Hospitals Table */}
          <div className="rounded-xl border border-white/[0.08] bg-[#0D131F] overflow-x-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] bg-[#090E17] px-5 py-3 text-[11px] text-slate-400">
              <span className="font-medium text-slate-300">Real-Time Hospital Capacity &amp; Link Status</span>
              <div className="flex flex-wrap items-center gap-4">
                <span className="inline-flex items-center gap-1.5 text-emerald-400">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-emerald-400" />
                  <span>Optimal (&gt;10 ICU, &gt;3 Units)</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-amber-400">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-amber-400" />
                  <span>Limited (5–10 ICU / 2–3 Units)</span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-red-400">
                  <span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-500" />
                  <span>Critical (≤4 ICU / ≤1 Unit)</span>
                </span>
              </div>
            </div>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] bg-[#090E17] text-slate-400">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Hospital</th>
                  <th className="px-4 py-3.5 font-semibold">City &amp; Area</th>
                  <th className="px-4 py-3.5 font-semibold">GPS Coordinates</th>
                  <th className="px-4 py-3.5 font-semibold">Capacity Status</th>
                  <th className="px-4 py-3.5 font-semibold text-right">ICU Beds</th>
                  <th className="px-4 py-3.5 font-semibold text-right">Ambulances</th>
                  <th className="px-5 py-3.5 font-semibold">Hotline</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {hospitals.map((h) => {
                  const cap = getHospitalCapacityStatus(h);
                  return (
                    <tr key={h.id} className="hover:bg-white/[0.025] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <Building2 className="h-4 w-4 text-sky-400 shrink-0" />
                          <div>
                            <div className="font-semibold text-white">{h.name}</div>
                            <div className="font-mono text-[11px] text-slate-400">
                              {h.id} {h.addedByAdmin ? '· Added by Admin' : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-slate-300">
                        {h.area}, {h.city}
                      </td>
                      <td className="px-4 py-3.5 font-mono tabular-nums text-slate-400">
                        {h.latitude.toFixed(4)}° N, {h.longitude.toFixed(4)}° E
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex items-center gap-2 font-semibold ${cap.textClass}`}>
                          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${cap.dotClass}`} />
                          <span>{cap.label}</span>
                        </span>
                      </td>
                      <td className={`px-4 py-3.5 text-right font-mono tabular-nums font-semibold ${cap.textClass}`}>
                        {h.icuBedsAvailable}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-sky-400">
                        {h.ambulancesReady}
                      </td>
                      <td className="px-5 py-3.5 font-mono tabular-nums text-slate-300">{h.phone}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
