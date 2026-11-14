import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  Activity,
  Building2,
  ChevronDown,
  Layers,
  LineChart,
  Map as MapIcon,
  MessageSquarePlus,
  ShieldAlert,
  Smartphone,
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

const AnimatedCounter: React.FC<{ value: number }> = ({ value }) => {
  const prefersReducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<number>(value);
  const previousRef = useRef<number>(0);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(value);
      previousRef.current = value;
      return;
    }

    const startValue = previousRef.current;
    const endValue = value;
    if (startValue === endValue) {
      setDisplayValue(endValue);
      return;
    }

    let frameId = 0;
    const duration = 520;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startValue + (endValue - startValue) * eased);
      setDisplayValue(next);
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        previousRef.current = endValue;
      }
    };

    frameId = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frameId);
      previousRef.current = endValue;
    };
  }, [value, prefersReducedMotion]);

  return <>{displayValue}</>;
};

function getHospitalDotClass(h: Pick<Hospital, 'icuBedsAvailable' | 'ambulancesReady'>): string {
  if (h.icuBedsAvailable <= 4 || h.ambulancesReady <= 1) return 'bg-red-500';
  if (h.icuBedsAvailable <= 10 || h.ambulancesReady <= 3) return 'bg-amber-400';
  return 'bg-emerald-400';
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
  const prefersReducedMotion = useReducedMotion();
  const [queueMode, setQueueMode] = useState<'hospitals' | 'incidents'>(
    incidents.length > 0 ? 'incidents' : 'hospitals',
  );
  const [quickFilter, setQuickFilter] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'DELHI' | 'BLR'>('ALL');
  const [rightPanelTab, setRightPanelTab] = useState<'map' | 'chart'>('map');
  const [focusedHospitalId, setFocusedHospitalId] = useState<string | null>(null);
  const [chartWindow, setChartWindow] = useState<'1y' | '30d' | 'Live'>('1y');
  const [chartRegion, setChartRegion] = useState<'All Regions' | 'New Delhi' | 'Bengaluru'>('All Regions');
  const [hoveredIdx, setHoveredIdx] = useState<number>(3);

  const [drawerOpen, setDrawerOpen] = useState(false);
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

  const activeSeries = CURVE_SERIES[chartRegion][chartWindow];
  const chartData = useMemo(() => {
    const w = 560;
    const h = 210;
    const padX = 28;
    const padTop = 30;
    const padBottom = 30;
    const usableW = w - padX * 2;
    const usableH = h - padTop - padBottom;

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

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: prefersReducedMotion ? { duration: 0 } : { staggerChildren: 0.07 },
    },
  };

  const itemVariants = {
    hidden: prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: prefersReducedMotion ? 0 : 0.28, ease: [0.16, 1, 0.3, 1] as const },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* 1. Executive Welcome Hero */}
      <motion.section
        variants={itemVariants}
        className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 pt-2"
      >
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-400">
            <span
              className={`inline-flex items-center gap-2 font-mono font-medium ${
                wsConnected ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              <span
                aria-hidden="true"
                className={`h-2 w-2 rounded-full ${
                  wsConnected ? 'bg-emerald-400 live-indicator-glow' : 'bg-amber-400 animate-pulse'
                }`}
              />
              <span>{wsConnected ? 'Live Telemetry Online' : 'Reconnecting Telemetry'}</span>
            </span>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span>Delhi NCR &amp; Bengaluru Trauma Network</span>
          </div>

          <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-white font-display text-balance leading-[1.12]">
            Golden-hour trauma dispatch, synchronized in real time.
          </h1>

          <p className="mt-3 text-sm sm:text-[15px] text-slate-400 leading-relaxed max-w-xl">
            Raksha AI bridges citizen SOS alerts, ambulance fleets, and live hospital ICU capacity so critical care teams respond without delay.
          </p>
        </div>

        {/* Strictly 2 Primary Hero Actions */}
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => onNavigate('citizen')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs sm:text-sm font-semibold text-white shadow-lg shadow-red-600/15 hover:bg-red-500 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
          >
            <Smartphone className="h-4 w-4" />
            <span>Send SOS Alert</span>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('admin')}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] backdrop-blur-md px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-white/[0.08] hover:border-white/25 hover:-translate-y-0.5 active:translate-y-0 transition-all duration-150 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            <Activity className="h-4 w-4 text-sky-400" />
            <span>Open Command Desk</span>
          </button>
        </div>
      </motion.section>

      {/* 2. Airy Bento KPI Readiness Strip */}
      <motion.section
        variants={itemVariants}
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      >
        <div className="rounded-xl border border-white/[0.08] bg-[#0D131F]/80 backdrop-blur-md p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16]">
          <div className="text-xs font-medium text-slate-400">ICU Beds Ready</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-emerald-400">
            <AnimatedCounter value={totalIcuBeds} />
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            Across <span className="font-mono tabular-nums text-slate-300">{hospitalCount}</span> trauma centers
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0D131F]/80 backdrop-blur-md p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16]">
          <div className="text-xs font-medium text-slate-400">Ambulances Ready</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-sky-400">
            <AnimatedCounter value={totalAmbulances} />
          </div>
          <div className="mt-1.5 text-xs text-slate-500">Standby dispatch fleet</div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0D131F]/80 backdrop-blur-md p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16]">
          <div className="text-xs font-medium text-slate-400">Units En Route</div>
          <div className="mt-2 text-3xl font-bold font-mono tabular-nums text-white">
            <AnimatedCounter value={activeCount} />
          </div>
          <div className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
            {incidentCount} logged alerts
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#0D131F]/80 backdrop-blur-md p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.16]">
          <div className="text-xs font-medium text-slate-400">Pending SOS</div>
          <div
            className={`mt-2 text-3xl font-bold font-mono tabular-nums ${
              pendingCount > 0 ? 'text-red-400' : 'text-white'
            }`}
          >
            <AnimatedCounter value={pendingCount} />
          </div>
          <div className="mt-1.5 text-xs text-slate-500">
            {pendingCount > 0 ? 'Awaiting command acceptance' : 'All corridors clear'}
          </div>
        </div>
      </motion.section>

      {/* 3. Core Visual Centerpiece: Trauma Network + Live Map Bento */}
      <motion.section
        variants={itemVariants}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch"
      >
        {/* Left 5 Columns: Trauma Network & Dispatch Queue */}
        <div className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0D131F]/80 backdrop-blur-md flex flex-col transition-colors duration-200 hover:border-white/[0.14]">
          <div className="p-5 border-b border-white/[0.08] space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-white font-display">
                {queueMode === 'incidents' ? 'Dispatch Queue' : 'Trauma Network'}
              </h2>
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#06090F] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setQueueMode('incidents');
                    setQuickFilter('ALL');
                  }}
                  className={`rounded-md px-3 py-1 font-medium transition-colors whitespace-nowrap ${
                    queueMode === 'incidents'
                      ? 'bg-[#1B263B] text-white'
                      : 'text-slate-400 hover:text-white'
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
                  className={`rounded-md px-3 py-1 font-medium transition-colors whitespace-nowrap ${
                    queueMode === 'hospitals'
                      ? 'bg-[#1B263B] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Hospitals ({hospitals.length})
                </button>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-2">
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
                    className={`flex flex-col items-center justify-center rounded-lg border py-2 px-1 transition-colors ${
                      selected
                        ? 'border-sky-400/70 bg-sky-400/10 text-white'
                        : 'border-white/[0.07] bg-[#080D16]/90 text-slate-400 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    <span className="text-[11px] font-medium">{tab.label}</span>
                    <span
                      className={`mt-1 font-mono text-xs font-bold tabular-nums ${
                        selected ? 'text-sky-300' : 'text-slate-200'
                      }`}
                    >
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[372px]">
            {queueMode === 'incidents' ? (
              filteredIncidents.length === 0 ? (
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center p-8 text-center">
                  <ShieldAlert className="h-7 w-7 text-sky-400/45" />
                  <div className="mt-3 text-sm font-semibold text-white">
                    No active distress alerts
                  </div>
                  <p className="mt-1.5 max-w-xs text-xs text-slate-400 leading-relaxed">
                    Incoming SOS broadcasts from citizens and mobile devices synchronize here automatically.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-white/[0.06]">
                  {filteredIncidents.slice(0, 6).map((inc) => (
                    <div
                      key={inc.id}
                      onClick={() => onNavigate('admin')}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') onNavigate('admin');
                      }}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-white/[0.03] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#080D16] text-xs font-bold text-sky-300 font-mono">
                          {inc.reporterName
                            .split(' ')
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join('')
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">
                            {inc.reporterName}
                          </div>
                          <div className="text-xs text-slate-400 truncate">
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
                        className={`shrink-0 text-xs font-semibold font-mono tabular-nums ${
                          inc.status === 'REPORTED'
                            ? 'text-red-400'
                            : inc.status === 'RESOLVED'
                              ? 'text-slate-400'
                              : 'text-emerald-400'
                        }`}
                      >
                        {inc.status === 'REPORTED'
                          ? 'Pending'
                          : inc.status === 'EN_ROUTE'
                            ? `${inc.etaMinutes}m ETA`
                            : inc.status}
                      </span>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {filteredHospitals.map((h) => {
                  const isFocused = focusedHospitalId === h.id && rightPanelTab === 'map';
                  const dotClass = getHospitalDotClass(h);
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
                      className={`flex items-center justify-between gap-3 px-5 py-3.5 transition-colors cursor-pointer ${
                        isFocused ? 'bg-[#152033]' : 'hover:bg-white/[0.03]'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-[#080D16] text-sky-400">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-white truncate">{h.name}</div>
                          <div className="text-xs text-slate-400 truncate">
                            {h.area}, {h.city} ·{' '}
                            <span className="inline-flex items-center gap-1.5 font-mono tabular-nums text-slate-200">
                              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                              <span>{h.icuBedsAvailable} ICU</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-semibold text-sky-300 tabular-nums">
                        {h.ambulancesReady} Units
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right 7 Columns: Live Map & Telemetry Curve Centerpiece */}
        <div className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#0D131F]/80 backdrop-blur-md p-5 flex flex-col justify-between transition-colors duration-200 hover:border-white/[0.14]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-bold text-white font-display">
                {rightPanelTab === 'map'
                  ? 'Live Trauma Network Map'
                  : 'Regional Dispatch Curve'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {rightPanelTab === 'map'
                  ? 'Click any hospital node or active SOS marker to inspect real-time readiness'
                  : 'Inspect response readiness and dispatch volume across regional nodes'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#06090F] p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setRightPanelTab('map')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-colors whitespace-nowrap ${
                    rightPanelTab === 'map'
                      ? 'bg-[#1B263B] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <MapIcon className="h-3.5 w-3.5 text-sky-400" />
                  <span>Live Map</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelTab('chart')}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-semibold transition-colors whitespace-nowrap ${
                    rightPanelTab === 'chart'
                      ? 'bg-[#1B263B] text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LineChart className="h-3.5 w-3.5 text-sky-400" />
                  <span>Response Curve</span>
                </button>
              </div>

              {rightPanelTab === 'chart' && (
                <>
                  <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-[#06090F] p-1 text-xs">
                    {(['1y', '30d', 'Live'] as const).map((win) => (
                      <button
                        key={win}
                        type="button"
                        onClick={() => setChartWindow(win)}
                        className={`rounded-md px-2.5 py-1 font-semibold transition-colors ${
                          chartWindow === win
                            ? 'bg-[#1B263B] text-white'
                            : 'text-slate-400 hover:text-white'
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
                    className="rounded-lg border border-white/10 bg-[#080D16] px-3 py-1.5 text-xs font-semibold text-sky-300 focus:border-sky-400 focus:outline-none cursor-pointer"
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
            <NetworkLiveMap
              hospitals={hospitals}
              incidents={incidents}
              focusedHospitalId={focusedHospitalId}
              onSelectHospital={setFocusedHospitalId}
              onLaunchSos={() => onNavigate('citizen')}
              onOpenCommand={() => onNavigate('admin')}
            />
          ) : (
            <div className="rounded-xl border border-white/[0.06] bg-[#080D16] p-4">
              <svg
                viewBox={`0 0 ${chartData.w} ${chartData.h}`}
                className="w-full h-auto block select-none"
                role="img"
                aria-label="Dispatch telemetry spline graph"
              >
                <defs>
                  <linearGradient id="futuristicAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {[0.25, 0.5, 0.75].map((r, i) => (
                  <line
                    key={i}
                    x1="20"
                    y1={chartData.h * r}
                    x2={chartData.w - 20}
                    y2={chartData.h * r}
                    stroke="#1E293B"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                ))}

                <path d={chartData.areaPath} fill="url(#futuristicAreaGrad)" />

                <path
                  d={chartData.linePath}
                  fill="none"
                  stroke="#38BDF8"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />

                <line
                  x1={focusPoint.x}
                  y1={focusPoint.y}
                  x2={focusPoint.x}
                  y2={chartData.h - chartData.padBottom}
                  stroke="#38BDF8"
                  strokeOpacity="0.5"
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
                          <circle cx={pt.x} cy={pt.y} r="8" fill="#38BDF8" fillOpacity="0.22" />
                          <circle cx={pt.x} cy={pt.y} r="4.5" fill="#38BDF8" stroke="#080D16" strokeWidth="2" />
                          <text
                            x={pt.x}
                            y={pt.y - 12}
                            textAnchor="middle"
                            fontSize="11"
                            fontWeight="700"
                            fill="#F8FAFC"
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
                        fill={isFocused ? '#38BDF8' : '#64748B'}
                        fontFamily="Inter, sans-serif"
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
      </motion.section>

      {/* 4. Collapsible System Architecture & Downloads Drawer */}
      <motion.section
        variants={itemVariants}
        className="rounded-xl border border-white/[0.08] bg-[#0D131F]/80 backdrop-blur-md overflow-hidden"
      >
        <button
          type="button"
          onClick={() => setDrawerOpen((prev) => !prev)}
          aria-expanded={drawerOpen}
          className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-white/[0.025] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-sky-400"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Layers className="h-4 w-4 text-sky-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white font-display">
                System Architecture &amp; Downloads
              </div>
              <div className="text-xs text-slate-400 truncate">
                Platform endpoints · Android APK &amp; PWA installer · Operational review notes ({suggestions.length})
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 text-xs font-medium text-slate-400">
            <span>{drawerOpen ? 'Hide' : 'Expand'}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${
                drawerOpen ? 'rotate-180 text-sky-400' : ''
              }`}
            />
          </div>
        </button>

        <AnimatePresence initial={false}>
          {drawerOpen && (
            <motion.div
              key="system-drawer"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden border-t border-white/[0.08]"
            >
              <div className="space-y-6 p-5 bg-[#0A101B]/70">
                {/* Mobile Distribution Controls */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-white font-display">
                      Mobile Clients &amp; Architecture Matrix
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Inspect core system endpoints or install the native Android SOS client.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PWAInstallButton />
                    <a
                      href="/raksha-sos.apk"
                      download="raksha-sos.apk"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-400 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-300 transition-colors whitespace-nowrap"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      <span>Download Android APK</span>
                    </a>
                    <a
                      href="/raksha-sos-android-project.zip"
                      download
                      className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-[#121A2B] px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-[#192338] transition-colors whitespace-nowrap"
                    >
                      <span>Android Source (.zip)</span>
                    </a>
                  </div>
                </div>

                {/* 4-Layer Architecture Grid */}
                <div className="rounded-xl border border-white/[0.08] bg-[#0D131F] overflow-hidden">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08]">
                    {STACK_LAYERS.map((item) => {
                      const active = selectedLayerId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedLayerId(item.id)}
                          className={`text-left p-4 space-y-1.5 transition-colors ${
                            active ? 'bg-[#152033]' : 'hover:bg-white/[0.025]'
                          }`}
                        >
                          <div className="text-sm font-bold text-white font-display">{item.layer}</div>
                          <div className="font-mono text-xs text-sky-400 font-medium">{item.tech}</div>
                          <p className="text-xs text-slate-400 leading-relaxed">{item.role}</p>
                        </button>
                      );
                    })}
                  </div>
                  <div className="border-t border-white/[0.08] bg-[#080D16] px-4 py-3 text-xs text-slate-300">
                    <strong className="text-white">{selectedLayer.layer}</strong>
                    <span className="mx-2 text-slate-600">·</span>
                    <span className="font-mono text-sky-400">{selectedLayer.endpoint}</span>
                    <span className="mx-2 text-slate-600">—</span>
                    <span className="text-slate-400">{selectedLayer.capabilities}</span>
                  </div>
                </div>

                {/* Operational Review Notes */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  <form
                    onSubmit={handleSubmitSuggestion}
                    className="lg:col-span-5 rounded-xl border border-white/[0.08] bg-[#0D131F] p-5 space-y-3.5"
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquarePlus className="h-4 w-4 text-sky-400" />
                      <h4 className="text-sm font-bold text-white font-display">
                        Log Operational Review Note
                      </h4>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="reviewer-name" className="block text-xs font-medium text-slate-300">
                          Reviewer Name
                        </label>
                        <input
                          id="reviewer-name"
                          type="text"
                          value={judgeName}
                          onChange={(e) => setJudgeName(e.target.value)}
                          placeholder="e.g., Dr. Kavita Rao"
                          className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label htmlFor="review-category" className="block text-xs font-medium text-slate-300">
                          Focus Area
                        </label>
                        <select
                          id="review-category"
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                        >
                          <option value="Dispatch & Triage">Dispatch &amp; Triage</option>
                          <option value="Hospital Integration">Hospital Integration</option>
                          <option value="Security & Privacy">Security &amp; Privacy</option>
                          <option value="Fleet & Routing">Fleet &amp; Routing</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="reviewer-role" className="block text-xs font-medium text-slate-300">
                        Role / Department
                      </label>
                      <input
                        id="reviewer-role"
                        type="text"
                        value={judgeRole}
                        onChange={(e) => setJudgeRole(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs text-white focus:border-sky-400 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label htmlFor="review-message" className="block text-xs font-medium text-slate-300">
                        Observation or Recommendation *
                      </label>
                      <textarea
                        id="review-message"
                        rows={2}
                        required
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Document clinical workflow, dispatch latency, or UI observations..."
                        className="mt-1 w-full rounded-lg border border-white/10 bg-[#080D16] px-3 py-2 text-xs text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                      />
                    </div>

                    {submittedNotice && (
                      <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200">
                        Operational note recorded and synced across active sessions.
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full min-h-[40px] rounded-lg bg-sky-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-300 transition-colors disabled:opacity-60"
                    >
                      {submitting ? 'Submitting...' : 'Submit Review Note'}
                    </button>
                  </form>

                  <div className="lg:col-span-7 rounded-xl border border-white/[0.08] bg-[#0D131F] overflow-hidden">
                    <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-3.5">
                      <h4 className="text-sm font-bold text-white font-display">
                        Field &amp; Clinical Notes ({suggestions.length})
                      </h4>
                      <span className="text-xs font-medium text-sky-400">Synchronized Log</span>
                    </div>

                    <div className="divide-y divide-white/[0.06]">
                      {suggestions.map((s) => (
                        <div key={s.id} className="px-5 py-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="font-semibold text-white">
                              {s.judgeName}{' '}
                              <span className="font-normal text-slate-400">· {s.role}</span>
                            </div>
                            <div className="text-slate-400">
                              {s.category} ·{' '}
                              <span className="font-mono tabular-nums">
                                {new Date(s.createdAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-slate-300 leading-relaxed">{s.message}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>
    </motion.div>
  );
};
