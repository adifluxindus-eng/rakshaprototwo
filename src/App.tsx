import { useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import { motion } from 'motion/react';
import { AlertTriangle, Columns2, ExternalLink } from 'lucide-react';
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

  const pendingCount = incidents.filter((i) => i.status === 'REPORTED').length;

  const navItems: {
    id: AppWorkspaceMode;
    label: string;
  }[] = [
    { id: 'welcome', label: 'Overview' },
    { id: 'split', label: 'Live Dispatch' },
    { id: 'citizen', label: 'Citizen SOS' },
    { id: 'admin', label: pendingCount > 0 ? `Command (${pendingCount})` : 'Command' },
  ];

  const appShell = (
    <div className="min-h-screen flex flex-col bg-[#06090F] text-slate-100 futuristic-grid">
      {/* Mandatory Demo-Key Quota Exceeded Banner */}
      {quotaExceeded && (
        <div
          role="alert"
          className="border-b border-amber-500/30 bg-amber-950/60 px-4 py-2.5 text-xs text-amber-200"
        >
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
              <span>
                Google Maps demo key daily quota reached — live dispatch map has switched to tactical grid mode.
              </span>
            </div>
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-amber-300 underline hover:text-amber-100"
            >
              <span>Resolve quota</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-white/[0.08] bg-[#06090F]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6 py-3">
          {/* Zone 1: Brand Wordmark (single text element) */}
          <button
            type="button"
            onClick={() => setWorkspace('welcome')}
            className="text-lg font-extrabold tracking-tight text-white font-display whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
          >
            Raksha AI
          </button>

          {/* Zone 2: Clean Single-Line Text Navigation Links */}
          <nav
            aria-label="Primary navigation"
            className="flex items-center gap-5 sm:gap-7 overflow-x-auto"
          >
            {navItems.map((item) => {
              const active = workspace === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setWorkspace(item.id)}
                  className={`relative py-1.5 text-xs sm:text-sm font-medium whitespace-nowrap shrink-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 ${
                    active
                      ? 'text-white border-b-2 border-sky-400'
                      : 'text-slate-400 hover:text-slate-100 border-b-2 border-transparent hover:border-white/20'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="hidden sm:flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setWorkspace(workspace === 'split' ? 'welcome' : 'split')}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-400 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-sky-300 active:scale-[0.985] transition-all duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
            >
              <Columns2 className="h-3.5 w-3.5" />
              <span>{workspace === 'split' ? 'Overview' : 'Split Console'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Canvas */}
      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 py-6">
        <motion.div
          key={workspace}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
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
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-[#0D131F] px-5 py-4">
                <div>
                  <h1 className="text-lg font-bold tracking-tight text-white font-display">
                    Dual-Terminal Dispatch Console
                  </h1>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Synchronized citizen mobile distress transmitter and emergency command center
                  </p>
                </div>
                <div className="text-xs font-mono tabular-nums text-sky-400 font-medium">
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

      {/* Quiet Minimal Footer */}
      <footer className="border-t border-white/[0.08] bg-[#06090F]">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4 text-xs text-slate-500">
          <span className="font-medium text-slate-300">
            Raksha AI · Emergency Response &amp; Trauma Coordination
          </span>
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
