import React, { useState } from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
      >
        <Download className="h-3.5 w-3.5" />
        <span>Install Phone App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-[#121A2B] px-4 py-2 text-xs font-semibold text-slate-100 hover:bg-[#192338] transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
        >
          <Download className="h-3.5 w-3.5 text-sky-400" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-xl border border-white/15 bg-[#0D131F] p-6 shadow-2xl">
              <h3 className="text-base font-bold text-white font-display">
                Install Raksha SOS on iPhone / iPad
              </h3>
              <p className="mt-2.5 text-xs text-slate-300 leading-relaxed">
                1. Tap the <strong className="text-white">Share</strong> button in the Safari toolbar.
                <br />
                2. Scroll down and tap <strong className="text-white">Add to Home Screen</strong> to launch Citizen SOS directly.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-lg bg-sky-400 py-2.5 text-xs font-semibold text-slate-950 hover:bg-sky-300 transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
