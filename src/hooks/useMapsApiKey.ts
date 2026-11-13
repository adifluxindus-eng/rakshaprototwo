import { useEffect, useState } from 'react';

export function useMapsApiKey() {
  const envKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) || '';
  const [apiKey, setApiKey] = useState<string>(envKey);
  const [loading, setLoading] = useState<boolean>(!envKey);
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(false);

  useEffect(() => {
    const handleQuota = () => setQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  useEffect(() => {
    if (envKey) {
      setApiKey(envKey);
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch('/api/maps-config')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.apiKey) {
          setApiKey(String(data.apiKey));
        }
      })
      .catch(() => {
        // Fallback map remains active if config endpoint is unavailable
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [envKey]);

  return { apiKey, loading, quotaExceeded };
}
