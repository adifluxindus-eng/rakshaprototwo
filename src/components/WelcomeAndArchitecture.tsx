import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  ArrowRight,
  Building2,
  ChevronRight,
  Columns2,
  LineChart,
  Map as MapIcon,
  MessageSquarePlus,
  ShieldAlert,
  Smartphone,
  Star,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { Hospital, Incident, JudgeSuggestion } from '../types';
import { NetworkLiveMap } from './NetworkLiveMap';
import { PWAInstallButton } from './PWAInstallButton';

export type AppWorkspaceMode = 'welcome' | 'split' | 'citizen' | 'admin' | 'architecture';

interface WelcomeViewProps {
  onNavigate: (mode: AppWorkspaceMode) => void;
  hospitals: Hospital[];
  incidents: Incident[];
  wsConnected: boolean;
  hospitalCount: number;
  incidentCount: number;
  suggestions: JudgeSuggestion[];
}

interface StackLayer {
  id: string;
  layer: string;
  tech: string;
  role: string;
  endpoint: string;
  capabilities: string;
}

const STACK_LAYERS: StackLayer[] = [
  {
    id: 'client',
    layer: 'Citizen Distress Client',
    tech: 'Android APK (Kotlin) · Web PWA',
    role: 'Zero-password SOS transmission, anonymous reporting, and device GPS capture.',
    endpoint: 'POST /api/incidents',
    capabilities:
      'Includes native Android APK (raksha-sos.apk), installable mobile PWA, and real-time dispatch polling.',
  },
  {
    id: 'core',
    layer: 'Real-Time Dispatch Core',
    tech: 'Node.js · Express · WebSockets',
    role: 'Sub-second incident broadcast, nearest trauma matching, and live fleet telemetry.',
    endpoint: 'WS /ws · GET /api/state',
    capabilities:
      'Synchronizes all active consoles with automatic WebSocket reconnect and REST fallback polling.',
  },
  {
    id: 'command',
    layer: 'Command & Hospital Desk',
    tech: 'React · TypeScript · Tailwind',
    role: 'Priority alert pop-ups, audible dispatch siren, hospital onboarding, and unit assignment.',
    endpoint: 'POST /api/incidents/:id/accept',
    capabilities:
      'Provides interactive KPI filtering, live ICU bed counts, and instant partner facility onboarding.',
  },
  {
    id: 'routing',
    layer: 'Routing & Fleet Telemetry',
    tech: 'Haversine Matching · Route Sync',
    role: 'Live ETA countdown, turn-by-turn corridor progress, and handover confirmation.',
    endpoint: 'PATCH /api/incidents/:id/status',
    capabilities:
      'Streams unit progress increments, arrival confirmation, and external Google Maps navigation handoff.',
  },
];

const CURVE_SERIES: Record<
  'All Regions' | 'New Delhi' | 'Bengaluru',
  Record<'Live' | '30d' | '1y', { labels: string[]; values: number[]; unit: string }>
> = {
  'All Regions': {
    Live: { labels: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'], values: [42, 68, 54, 96, 51, 79, 48], unit: 'readiness index' },
    '30d': { labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7'], values: [58, 72, 64, 91, 67, 84, 76], unit: 'dispatches' },
    '1y': { labels: ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'], values: [64, 98, 76, 138, 69, 102, 74], unit: 'responses' },
  },
  'New Delhi': {
    Live: { labels: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'], values: [48, 74, 62, 104, 59, 86, 55], unit: 'readiness index' },
    '30d': { labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7'], values: [44, 56, 49, 71, 52, 66, 61], unit: 'dispatches' },
    '1y': { labels: ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'], values: [52, 81, 64, 112, 58, 88, 62], unit: 'responses' },
  },
  Bengaluru: {
    Live: { labels: ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'], values: [36, 58, 49, 84, 46, 68, 44], unit: 'readiness index' },
    '30d': { labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7'], values: [28, 39, 34, 54, 41, 49, 43], unit: 'dispatches' },
    '1y': { labels: ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'], values: [34, 52, 46, 78, 42, 61, 48], unit: 'responses' },
  },
};

function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? i : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({
  onNavigate,
  hospitals,
  incidents,
  wsConnected,
  hospitalCount,
  incidentCount,
  suggestions,
}) => {
  const [queueMode, setQueueMode] = useState<'hospitals' | 'incidents'>(
    incidents.length > 0 ? 'incidents' : 'hospitals',
  );
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'DELHI' | 'BLR'>('ALL');
  const [rightPanelTab, setRightPanelTab] = useState<'map' | 'chart'>('map');
  const [focusedHospitalId, setFocusedHospitalId] = useState<string | null>(null);
  const [chartWindow, setChartWindow] = useState<'1y' | '30d' | 'Live'>('1y');
  const [chartRegion, setChartRegion] = useState<'All Regions' | 'New Delhi' | 'Bengaluru'>('All Regions');
  const [hoveredIdx, setHoveredIdx] = useState<number>(3);
  const [selectedLayerId, setSelectedLayerId] = useState<string>(STACK_LAYERS[0].id);

  const [judgeName, setJudgeName] = useState('');
  const [judgeRole, setJudgeRole] = useState('Operations Reviewer');
  const [category, setCategory] = useState('Dispatch & Triage');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedNotice, setSubmittedNotice] = useState(false);

  const totalIcuBeds = useMemo(
    () => hospitals.reduce((sum, h) => sum + h.icuBedsAvailable, 0),
    [hospitals],
  );
  const totalAmbulances = useMemo(
    () => hospitals.reduce((sum, h) => sum + h.ambulancesReady, 0),
    [hospitals],
  );
  const pendingCount = useMemo(
    () => incidents.filter((i) => i.status === 'REPORTED').length,
    [incidents],
  );
  const activeCount = useMemo(
    () =>
      incidents.filter(
        (i) => i.status === 'ACCEPTED' || i.status === 'EN_ROUTE' || i.status === 'ARRIVED',
      ).length,
    [incidents],
  );

  const quickTabs = useMemo(
    () => [
      { id: 'ALL' as const, label: 'All', count: hospitals.length + incidents.length },
      { id: 'PENDING' as const, label: 'SOS', count: pendingCount },
      { id: 'ACTIVE' as const, label: 'Units', count: activeCount },
      {
        id: 'DELHI' as const,
        label: 'Delhi',
        count: hospitals.filter((h) => h.city.toLowerCase().includes('delhi')).length,
      },
      {
        id: 'BLR' as const,
        label: 'BLR',
        count: hospitals.filter((h) => h.city.toLowerCase().includes('bengaluru')).length,
      },
    ],
    [hospitals, incidents.length, pendingCount, activeCount],
  );

  const filteredHospitals = useMemo(() => {
    if (quickFilter === 'DELHI') {
      return hospitals.filter((h) => h.city.toLowerCase().includes('delhi'));
    }
    if (quickFilter === 'BLR') {
      return hospitals.filter((h) => h.city.toLowerCase().includes('bengaluru'));
    }
    return hospitals;
  }, [hospitals, quickFilter]);

  const filteredIncidents = useMemo(() => {
    if (quickFilter === 'PENDING') return incidents.filter((i) => i.status === 'REPORTED');
    if (quickFilter === 'ACTIVE') {
      return incidents.filter(
        (i) => i.status === 'ACCEPTED' || i.status === 'EN_ROUTE' || i.status === 'ARRIVED',
      );
    }
    return incidents;
  }, [incidents, quickFilter]);

  // Smooth SVG spline chart geometry
  const activeSeries = CURVE_SERIES[chartRegion][chartWindow];
  const chartData = useMemo(() => {
    const w = 560;
    const h = 210;
    const padX = 28;
    const padTop = 30;
    const padBottom = 30;
    const usableW = w - padX * 2;
    const usableH = h - padTop - padBottom;

    // Incorporate live incident volume subtly into the peak slot so live SOS activity reflects on the curve
    const vals = activeSeries.values.map((v, i) => (i === 3 ? v + incidents.length * 2 : v));
    const maxV = Math.max(...vals) * 1.12;
    const minV = Math.min(...vals) * 0.72;

    const pts = vals.map((val, idx) => {
      const x = padX + (idx / (vals.length - 1)) * usableW;
      const norm = maxV === minV ? 0.5 : (val - minV) / (maxV - minV);
      const y = padTop + (1 - norm) * usableH;
      return { x, y, val, label: activeSeries.labels[idx] };
    });

    const linePath = buildSmoothPath(pts);
    const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)} ${(h - padBottom).toFixed(1)} L ${pts[0].x.toFixed(1)} ${(h - padBottom).toFixed(1)} Z`;

    return { w, h, padBottom, pts, linePath, areaPath };
  }, [activeSeries, incidents.length]);

  const selectedLayer = STACK_LAYERS.find((l) => l.id === selectedLayerId) || STACK_LAYERS[0];

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setSubmittedNotice(false);
    try {
      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judgeName: judgeName.trim() || 'Operations Reviewer',
          role: judgeRole.trim() || 'Clinical Lead',
          category,
          message: message.trim(),
        }),
      });
      if (res.ok) {
        setMessage('');
        setSubmittedNotice(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const focusPoint = chartData.pts[hoveredIdx] || chartData.pts[3];

  return (
    <div className="space-y-6">
      {/* Row 1: 3-Card Clinical Metric Banner matching HomeCare Reference */}
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-5"
      >
        {/* Card 1: Soft Sky Blue Card */}
        <div className="rounded-[24px] bg-gradient-to-br from-[#6EA7F6] to-[#5E99EE] p-6 text-white shadow-[0_6px_20px_rgba(94,153,238,0.22)]">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-white/90">
            <span className="text-sm font-semibold">Trauma Capacity</span>
            <span className="tabular-nums text-white/85">
              {wsConnected ? 'Live Network' : 'Syncing...'}
            </span>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <div className="text-3xl sm:text-4xl font-bold font-display tabular-nums tracking-tight">
                {totalIcuBeds}
              </div>
              <div className="mt-1 text-xs text-white/85">ICU Beds Ready</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold font-display tabular-nums tracking-tight">
                {totalAmbulances}
              </div>
              <div className="mt-1 text-xs text-white/85">Ambulances Ready</div>
            </div>
          </div>
        </div>

        {/* Card 2: Crisp White Surface Card */}
        <div className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_2px_14px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-sm font-semibold text-slate-900">Network Readiness</span>
            <button
              type="button"
              onClick={() => onNavigate('admin')}
              className="inline-flex items-center gap-0.5 font-semibold text-[#0F4C9C] hover:text-[#0B3D80] transition-colors"
            >
              <span>All hospitals</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-3xl sm:text-4xl font-bold font-display tabular-nums text-slate-900 tracking-tight">
                <Star className="h-6 w-6 fill-amber-400 text-amber-400 shrink-0" />
                <span>{hospitalCount}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">Partner Centers</div>
            </div>
            <div>
              <div className="text-3xl sm:text-4xl font-bold font-display tabular-nums text-slate-900 tracking-tight">
                {activeCount}
              </div>
              <div className="mt-1 text-xs text-slate-500">Units En Route</div>
            </div>
          </div>
        </div>

        {/* Card 3: Deep Cobalt Blue Card */}
        <div className="rounded-[24px] bg-gradient-to-br from-[#1251A3] to-[#0B3F84] p-6 text-white shadow-[0_6px_20px_rgba(15,76,156,0.22)]">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-sm font-semibold">Emergency Dispatches</span>
            <button
              type="button"
              onClick={() => onNavigate('split')}
              className="inline-flex items-center gap-0.5 font-medium text-white/90 hover:text-white transition-colors"
            >
              <span>Live console</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-2 text-3xl sm:text-4xl font-bold font-display tabular-nums tracking-tight">
                <span>{pendingCount}</span>
                <TrendingDown className={`h-4 w-4 ${pendingCount > 0 ? 'text-red-300' : 'text-sky-300'}`} />
              </div>
              <div className="mt-1 text-xs text-white/80">Pending SOS</div>
            </div>
            <div>
              <div className="flex items-center gap-2 text-3xl sm:text-4xl font-bold font-display tabular-nums tracking-tight">
                <span>{incidentCount}</span>
                <TrendingUp className="h-4 w-4 text-sky-300" />
              </div>
              <div className="mt-1 text-xs text-white/80">Logged Alerts</div>
            </div>
          </div>
        </div>
      </motion.section>

      {/* Row 2: Main 2-Column Interactive Dashboard Workspace */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Panel: Queue & Partner Hospitals (matching My Schedule layout) */}
        <div className="lg:col-span-5 rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_2px_14px_rgba(15,23,42,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900 font-display">
                {queueMode === 'incidents' ? 'Dispatch Queue' : 'Trauma Network'}
              </h2>
              <div className="flex items-center gap-1 rounded-full bg-[#F3F6FB] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setQueueMode('incidents');
                    setQuickFilter('ALL');
                  }}
                  className={`rounded-full px-3 py-1 font-medium transition-colors ${
                    queueMode === 'incidents'
                      ? 'bg-[#0F4C9C] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Alerts ({incidents.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setQueueMode('hospitals');
                    setQuickFilter('ALL');
                  }}
                  className={`rounded-full px-3 py-1 font-medium transition-colors ${
                    queueMode === 'hospitals'
                      ? 'bg-[#0F4C9C] text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hospitals ({hospitals.length})
                </button>
              </div>
            </div>

            {/* Interactive 5-Tile Filter Strip (matching Mon/Tue/Wed/Thu/Fri strip) */}
            <div className="mt-4 grid grid-cols-5 gap-2">
              {quickTabs.map((tab) => {
                const selected = quickFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setQuickFilter(tab.id);
                      if (tab.id === 'PENDING' || tab.id === 'ACTIVE') setQueueMode('incidents');
                      if (tab.id === 'DELHI' || tab.id === 'BLR') setQueueMode('hospitals');
                    }}
                    className={`flex flex-col items-center justify-center rounded-2xl border py-2.5 px-1 transition-all duration-150 ${
                      selected
                        ? 'border-[#0F4C9C] bg-white shadow-xs'
                        : 'border-slate-200/70 bg-[#F7F9FC] hover:border-slate-300'
                    }`}
                  >
                    <span className="text-[11px] font-medium text-slate-500">{tab.label}</span>
                    <span
                      className={`mt-1.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                        selected ? 'bg-[#0F4C9C] text-white' : 'text-slate-800'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Clean Stacked Schedule / Facility Cards */}
            <div className="mt-4 space-y-2.5 max-h-[300px] overflow-y-auto pr-0.5">
              {queueMode === 'incidents' ? (
                filteredIncidents.length === 0 ? (
                  <div className="rounded-2xl bg-[#F5F7FB] p-6 text-center">
                    <ShieldAlert className="mx-auto h-7 w-7 text-[#0F4C9C]/60" />
                    <div className="mt-2 text-sm font-semibold text-slate-900">
                      No active distress alerts
                    </div>
                    <p className="mt-1 text-xs text-slate-500 leading-relaxed">
                      Send an SOS alert from Citizen SOS or Android APK to watch live dispatch telemetry appear here.
                    </p>
                    <button
                      type="button"
                      onClick={() => onNavigate('citizen')}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#0F4C9C] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#0B3D80] transition-colors"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      <span>Open Citizen SOS</span>
                    </button>
                  </div>
                ) : (
                  filteredIncidents.slice(0, 5).map((inc) => (
                    <div
                      key={inc.id}
                      onClick={() => onNavigate('admin')}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onNavigate('admin');
                      }}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-[#F5F7FB] px-3.5 py-3 hover:bg-[#ECF1F8] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-xs font-bold text-[#0F4C9C] shadow-xs">
                          {inc.reporterName
                            .split(' ')
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">
                            {inc.reporterName}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {inc.locationLabel} ·{' '}
                            <span className="font-mono tabular-nums">
                              {new Date(inc.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${
                          inc.status === 'REPORTED'
                            ? 'bg-red-600 text-white'
                            : inc.status === 'RESOLVED'
                              ? 'bg-slate-300 text-slate-700'
                              : 'bg-[#4E86D6] text-white'
                        }`}
                      >
                        {inc.status === 'REPORTED'
                          ? 'Pending'
                          : inc.status === 'EN_ROUTE'
                            ? `${inc.etaMinutes}m ETA`
                            : inc.status}
                      </span>
                    </div>
                  ))
                )
              ) : (
                filteredHospitals.map((h) => {
                  const isFocused = focusedHospitalId === h.id && rightPanelTab === 'map';
                  return (
                    <div
                      key={h.id}
                      onClick={() => {
                        setFocusedHospitalId(h.id);
                        setRightPanelTab('map');
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          setFocusedHospitalId(h.id);
                          setRightPanelTab('map');
                        }
                      }}
                      className={`flex items-center justify-between gap-3 rounded-2xl border px-3.5 py-3 transition-all cursor-pointer ${
                        isFocused
                          ? 'border-[#0F4C9C] bg-[#EDF4FD] shadow-xs'
                          : 'border-transparent bg-[#F5F7FB] hover:bg-[#ECF1F8]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0F4C9C] shadow-xs">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 truncate">{h.name}</div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {h.area}, {h.city} ·{' '}
                            <span className="font-mono tabular-nums">{h.icuBedsAvailable} ICU beds</span>
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-[#4E86D6] px-3 py-1 text-[11px] font-semibold text-white">
                        {h.ambulancesReady} Units
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Real Live Google Map & Response Telemetry Switcher */}
        <div className="lg:col-span-7 rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_2px_14px_rgba(15,23,42,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 font-display">
                  {rightPanelTab === 'map'
                    ? 'Live Trauma Network Map'
                    : 'Dispatch Telemetry & Response Curve'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {rightPanelTab === 'map'
                    ? 'Click any hospital marker or SOS pin to inspect ICU capacity and active ambulances'
                    : 'Hover or click any point along the timeline to inspect regional response metrics'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Primary Map vs Curve View Switcher */}
                <div className="flex items-center gap-1 rounded-full bg-[#F3F6FB] p-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('map')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
                      rightPanelTab === 'map'
                        ? 'bg-[#0F4C9C] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    <span>Live Map</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPanelTab('chart')}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold transition-colors ${
                      rightPanelTab === 'chart'
                        ? 'bg-[#0F4C9C] text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LineChart className="h-3.5 w-3.5" />
                    <span>Response Curve</span>
                  </button>
                </div>

                {rightPanelTab === 'chart' && (
                  <>
                    <div className="flex items-center gap-1 rounded-full bg-[#F3F6FB] p-1 text-xs">
                      {(['1y', '30d', 'Live'] as const).map((win) => (
                        <button
                          key={win}
                          type="button"
                          onClick={() => setChartWindow(win)}
                          className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${
                            chartWindow === win
                              ? 'bg-[#0F4C9C] text-white shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {win}
                        </button>
                      ))}
                    </div>

                    <select
                      aria-label="Filter telemetry by region"
                      value={chartRegion}
                      onChange={(e) =>
                        setChartRegion(e.target.value as 'All Regions' | 'New Delhi' | 'Bengaluru')
                      }
                      className="rounded-full border border-slate-200 bg-[#F3F6FB] px-3 py-1.5 text-xs font-semibold text-[#0F4C9C] focus:border-[#0F4C9C] focus:outline-none cursor-pointer"
                    >
                      <option value="All Regions">All Regions</option>
                      <option value="New Delhi">New Delhi</option>
                      <option value="Bengaluru">Bengaluru</option>
                    </select>
                  </>
                )}
              </div>
            </div>

            {rightPanelTab === 'map' ? (
              <div className="mt-4">
                <NetworkLiveMap
                  hospitals={hospitals}
                  incidents={incidents}
                  focusedHospitalId={focusedHospitalId}
                  onSelectHospital={setFocusedHospitalId}
                  onLaunchSos={() => onNavigate('citizen')}
                  onOpenCommand={() => onNavigate('admin')}
                />
              </div>
            ) : (
              <div className="mt-4 relative">
                <svg
                  viewBox={`0 0 ${chartData.w} ${chartData.h}`}
                  className="w-full h-auto block select-none"
                  role="img"
                  aria-label="Dispatch telemetry spline graph"
                >
                  <defs>
                    <linearGradient id="clinicalAreaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0F4C9C" stopOpacity="0.22" />
                      <stop offset="100%" stopColor="#0F4C9C" stopOpacity="0.01" />
                    </linearGradient>
                  </defs>

                  {[0.25, 0.5, 0.75].map((r, i) => (
                    <line
                      key={i}
                      x1="20"
                      y1={chartData.h * r}
                      x2={chartData.w - 20}
                      y2={chartData.h * r}
                      stroke="#E2E8F0"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                  ))}

                  <path d={chartData.areaPath} fill="url(#clinicalAreaGrad)" />

                  <path
                    d={chartData.linePath}
                    fill="none"
                    stroke="#0F4C9C"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />

                  <line
                    x1={focusPoint.x}
                    y1={focusPoint.y}
                    x2={focusPoint.x}
                    y2={chartData.h - chartData.padBottom}
                    stroke="#0F4C9C"
                    strokeOpacity="0.45"
                    strokeDasharray="4 4"
                    strokeWidth="1.5"
                  />

                  {chartData.pts.map((pt, idx) => {
                    const isFocused = idx === hoveredIdx;
                    return (
                      <g
                        key={pt.label}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onClick={() => setHoveredIdx(idx)}
                      >
                        <circle cx={pt.x} cy={pt.y} r="18" fill="transparent" />
                        {isFocused && (
                          <>
                            <circle cx={pt.x} cy={pt.y} r="7" fill="#0F4C9C" fillOpacity="0.18" />
                            <circle cx={pt.x} cy={pt.y} r="4.5" fill="#0F4C9C" stroke="#FFFFFF" strokeWidth="2" />
                            <text
                              x={pt.x}
                              y={pt.y - 12}
                              textAnchor="middle"
                              fontSize="11"
                              fontWeight="700"
                              fill="#0F172A"
                              fontFamily="JetBrains Mono, monospace"
                            >
                              {pt.val} {activeSeries.unit}
                            </text>
                          </>
                        )}
                        <text
                          x={pt.x}
                          y={chartData.h - 8}
                          textAnchor="middle"
                          fontSize="11"
                          fontWeight={isFocused ? '700' : '500'}
                          fill={isFocused ? '#0F4C9C' : '#64748B'}
                          fontFamily="DM Sans, sans-serif"
                        >
                          {pt.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            )}
          </div>

          {/* Direct Action Bar inside Right Card */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onNavigate('split')}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0F4C9C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3D80] active:scale-[0.985] transition-all"
              >
                <Columns2 className="h-3.5 w-3.5" />
                <span>Launch Split View</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('citizen')}
                className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700 active:scale-[0.985] transition-all"
              >
                <Smartphone className="h-3.5 w-3.5" />
                <span>Send SOS Alert</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('admin')}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#F7F9FC] px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors"
              >
                <Activity className="h-3.5 w-3.5 text-[#0F4C9C]" />
                <span>Command Desk</span>
              </button>
            </div>
            <a
              href="/raksha-sos.apk"
              download="raksha-sos.apk"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F4C9C] hover:underline"
            >
              <span>Download Android APK</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </section>

      {/* Row 3: Interactive Platform Architecture & Mobile Client */}
      <section className="rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_2px_14px_rgba(15,23,42,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900 font-display">
              Platform Architecture &amp; Mobile Distribution
            </h2>
            <p className="text-xs text-slate-500">
              Select a layer to inspect live endpoints or deploy the mobile SOS client.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <PWAInstallButton />
            <a
              href="/raksha-sos.apk"
              download="raksha-sos.apk"
              className="inline-flex items-center gap-1.5 rounded-full bg-[#0F4C9C] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0B3D80] transition-colors whitespace-nowrap"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span>Download Android APK</span>
            </a>
            <a
              href="/raksha-sos-android-project.zip"
              download
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-[#F7F9FC] px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              <span>Android Source (.zip)</span>
            </a>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STACK_LAYERS.map((item) => {
            const active = selectedLayerId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedLayerId(item.id)}
                className={`text-left rounded-2xl border p-4 space-y-1.5 transition-all duration-150 ${
                  active
                    ? 'border-[#0F4C9C] bg-[#F3F7FD]'
                    : 'border-slate-200/80 bg-[#F9FBFD] hover:border-slate-300'
                }`}
              >
                <div className="text-sm font-bold text-slate-900 font-display">{item.layer}</div>
                <div className="font-mono text-xs text-[#0F4C9C] font-medium">{item.tech}</div>
                <p className="text-xs text-slate-600 leading-relaxed">{item.role}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-2xl bg-[#F5F7FB] px-4 py-3 text-xs text-slate-700 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="text-slate-900">{selectedLayer.layer}</strong> ·{' '}
            <span className="font-mono text-[#0F4C9C]">{selectedLayer.endpoint}</span> —{' '}
            {selectedLayer.capabilities}
          </span>
        </div>
      </section>

      {/* Row 4: Clinical Review Notes */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmitSuggestion}
          className="lg:col-span-5 rounded-[24px] border border-slate-200/80 bg-white p-6 space-y-4 shadow-[0_2px_14px_rgba(15,23,42,0.03)]"
        >
          <div className="flex items-center gap-2.5">
            <MessageSquarePlus className="h-5 w-5 text-[#0F4C9C]" />
            <h2 className="text-base font-bold text-slate-900 font-display">
              Log Operational Review Note
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="reviewer-name" className="block text-xs font-medium text-slate-700">
                Reviewer Name
              </label>
              <input
                id="reviewer-name"
                type="text"
                value={judgeName}
                onChange={(e) => setJudgeName(e.target.value)}
                placeholder="e.g., Dr. Kavita Rao"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-[#F7F9FC] px-3 py-2 text-xs text-slate-900 focus:border-[#0F4C9C] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="review-category" className="block text-xs font-medium text-slate-700">
                Focus Area
              </label>
              <select
                id="review-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-[#F7F9FC] px-3 py-2 text-xs text-slate-900 focus:border-[#0F4C9C] focus:bg-white focus:outline-none"
              >
                <option value="Dispatch & Triage">Dispatch &amp; Triage</option>
                <option value="Hospital Integration">Hospital Integration</option>
                <option value="Security & Privacy">Security &amp; Privacy</option>
                <option value="Fleet & Routing">Fleet &amp; Routing</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="reviewer-role" className="block text-xs font-medium text-slate-700">
              Role / Department
            </label>
            <input
              id="reviewer-role"
              type="text"
              value={judgeRole}
              onChange={(e) => setJudgeRole(e.target.value)}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#F7F9FC] px-3 py-2 text-xs text-slate-900 focus:border-[#0F4C9C] focus:bg-white focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="review-message" className="block text-xs font-medium text-slate-700">
              Observation or Recommendation *
            </label>
            <textarea
              id="review-message"
              rows={3}
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Document clinical workflow, dispatch latency, or UI observations..."
              className="mt-1 w-full rounded-xl border border-slate-200 bg-[#F7F9FC] px-3 py-2 text-xs text-slate-900 focus:border-[#0F4C9C] focus:bg-white focus:outline-none"
            />
          </div>

          {submittedNotice && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
              Operational note recorded and synced across active sessions.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[44px] rounded-full bg-[#0F4C9C] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0B3D80] transition-colors disabled:opacity-60"
          >
            {submitting ? 'Submitting...' : 'Submit Review Note'}
          </button>
        </form>

        <div className="lg:col-span-7 rounded-[24px] border border-slate-200/80 bg-white p-6 shadow-[0_2px_14px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-base font-bold text-slate-900 font-display">
              Field &amp; Clinical Notes ({suggestions.length})
            </h3>
            <span className="text-xs font-medium text-[#0F4C9C]">Synchronized Log</span>
          </div>

          <div className="mt-4 space-y-3">
            {suggestions.map((s) => (
              <div key={s.id} className="rounded-2xl bg-[#F5F7FB] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="font-semibold text-slate-900">
                    {s.judgeName}{' '}
                    <span className="font-normal text-slate-500">· {s.role}</span>
                  </div>
                  <div className="text-slate-500">
                    {s.category} ·{' '}
                    <span className="font-mono tabular-nums">
                      {new Date(s.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
                <p className="mt-1.5 text-sm text-slate-700 leading-relaxed">{s.message}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
