import { useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  Columns2,
  ExternalLink,
  LayoutGrid,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import { AdminDashboardView } from './components/AdminDashboardView';
import { CitizenMobileView } from './components/CitizenMobileView';
import { WelcomeView, type AppWorkspaceMode } from './components/WelcomeAndArchitecture';
import { useMapsApiKey } from './hooks/useMapsApiKey';
import { MapsRuntimeProvider } from './hooks/useMapsContext';
import { useRakshaRealtime } from './hooks/useRakshaRealtime';

function getInitialWorkspace(): AppWorkspaceMode {
  if (typeof window === 'undefined') return 'welcome';
  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'citizen' || mode === 'admin' || mode === 'split') {
    return mode;
  }
  return 'welcome';
}

export default function App() {
  const [workspace, setWorkspace] = useState<AppWorkspaceMode>(getInitialWorkspace);
  const [citizenLoggedIn, setCitizenLoggedIn] = useState(false);
  const [citizenActiveIncidentId, setCitizenActiveIncidentId] = useState<string | null>(null);
  const [adminAuthenticated, setAdminAuthenticated] = useState(false);

  const { apiKey, quotaExceeded } = useMapsApiKey();

  const {
    hospitals,
    incidents,
    suggestions,
    wsConnected,
    latestIncomingAlert,
    clearIncomingAlert,
  } = useRakshaRealtime();

  const navItems: {
    id: AppWorkspaceMode;
    label: string;
    icon: typeof LayoutGrid;
  }[] = [
    { id: 'welcome', label: 'Dashboard', icon: LayoutGrid },
    { id: 'split', label: 'Live Dispatch', icon: Activity },
    { id: 'citizen', label: 'Citizen SOS', icon: Smartphone },
    { id: 'admin', label: 'Command', icon: ShieldAlert },
  ];

  const pendingCount = incidents.filter((i) => i.status === 'REPORTED').length;

  const appShell = (
    <div className="min-h-screen flex flex-col bg-[#F3F6FB] text-slate-900">
      {/* Case A: Mandatory Demo-Key Quota Exceeded Banner */}
      {quotaExceeded && (
        <div
          role="alert"
          className="sticky top-0 z-50 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900"
        >
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
              <span>
                Google Maps demo key daily quota reached — live dispatch map has switched to tactical grid mode.
              </span>
            </div>
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-amber-950 underline hover:text-amber-700"
            >
              <span>Resolve quota</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {/* Clinical Blue Header matching HomeCare Reference */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-[#F3F6FB]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 sm:gap-8 px-4 sm:px-6 py-3.5">
          {/* Zone 1: Brand Wordmark */}
          <button
            type="button"
            onClick={() => setWorkspace('welcome')}
            className="text-xl font-extrabold tracking-tight text-[#0F4C9C] font-display whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C9C] rounded-lg"
          >
            Raksha AI
          </button>

          {/* Zone 2: Rounded Pill Navigation Bar */}
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white p-1 shadow-[0_2px_10px_rgba(15,23,42,0.03)] overflow-x-auto"
          >
            {navItems.map((item) => {
              const active = workspace === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setWorkspace(item.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-all duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C9C] ${
                    active
                      ? 'bg-[#0F4C9C] text-white shadow-xs font-semibold'
                      : 'text-slate-500 hover:text-[#0F4C9C] hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.label}</span>
                  {item.id === 'admin' && pendingCount > 0 && (
                    <span
                      className={`ml-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ${
                        active ? 'bg-red-500 text-white' : 'bg-red-600 text-white'
                      }`}
                    >
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="hidden sm:flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setWorkspace(workspace === 'split' ? 'welcome' : 'split')}
              className="inline-flex items-center gap-2 rounded-full bg-[#0F4C9C] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#0B3D80] active:scale-[0.985] transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F4C9C]"
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>{workspace === 'split' ? 'Back to Dashboard' : 'Split Console'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6">
        <motion.div
          key={workspace}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {workspace === 'welcome' && (
            <WelcomeView
              onNavigate={setWorkspace}
              hospitals={hospitals}
              incidents={incidents}
              wsConnected={wsConnected}
              hospitalCount={hospitals.length}
              incidentCount={incidents.length}
              suggestions={suggestions}
            />
          )}

          {workspace === 'split' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-slate-200/80 bg-white px-5 py-4 shadow-[0_2px_12px_rgba(15,23,42,0.03)]">
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-slate-900 font-display">
                    Dual-Terminal Dispatch Console
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Synchronized citizen mobile distress transmitter and emergency command center
                  </p>
                </div>
                <div className="rounded-full bg-[#F3F6FB] px-3.5 py-1.5 text-xs font-mono tabular-nums text-[#0F4C9C] font-medium">
                  {wsConnected ? 'Live Telemetry Connected' : 'Reconnecting Telemetry...'}
                </div>
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                <div className="xl:col-span-4">
                  <CitizenMobileView
                    hospitals={hospitals}
                    incidents={incidents}
                    loggedIn={citizenLoggedIn}
                    onLoggedInChange={setCitizenLoggedIn}
                    activeIncidentId={citizenActiveIncidentId}
                    onActiveIncidentChange={setCitizenActiveIncidentId}
                    isEmbeddedSplit
                  />
                </div>
                <div className="xl:col-span-8">
                  <AdminDashboardView
                    hospitals={hospitals}
                    incidents={incidents}
                    wsConnected={wsConnected}
                    latestIncomingAlert={latestIncomingAlert}
                    clearIncomingAlert={clearIncomingAlert}
                    authenticated={adminAuthenticated}
                    onAuthenticatedChange={setAdminAuthenticated}
                    isEmbeddedSplit
                  />
                </div>
              </div>
            </div>
          )}

          {workspace === 'citizen' && (
            <div className="py-2">
              <CitizenMobileView
                hospitals={hospitals}
                incidents={incidents}
                loggedIn={citizenLoggedIn}
                onLoggedInChange={setCitizenLoggedIn}
                activeIncidentId={citizenActiveIncidentId}
                onActiveIncidentChange={setCitizenActiveIncidentId}
              />
            </div>
          )}

          {workspace === 'admin' && (
            <AdminDashboardView
              hospitals={hospitals}
              incidents={incidents}
              wsConnected={wsConnected}
              latestIncomingAlert={latestIncomingAlert}
              clearIncomingAlert={clearIncomingAlert}
              authenticated={adminAuthenticated}
              onAuthenticatedChange={setAdminAuthenticated}
            />
          )}
        </motion.div>
      </main>

      {/* Clean Minimal Footer */}
      <footer className="border-t border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4 text-xs text-slate-500">
          <span className="font-medium text-slate-700">Raksha AI · Emergency Response &amp; Trauma Coordination</span>
          <span>Live device GPS, Android SOS APK, and regional hospital dispatch</span>
        </div>
      </footer>
    </div>
  );

  const runtimeValue = {
    apiKey,
    hasProvider: Boolean(apiKey),
    quotaExceeded,
  };

  return (
    <MapsRuntimeProvider value={runtimeValue}>
      {apiKey ? (
        <APIProvider apiKey={apiKey} language="en" region="IN" libraries={['marker', 'routes']}>
          {appShell}
        </APIProvider>
      ) : (
        appShell
      )}
    </MapsRuntimeProvider>
  );
}
