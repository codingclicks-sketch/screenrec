import { useEffect, useState } from 'react';
import API from '../api';

// Public billing config (no auth). `comingSoon` means Pro is configured but
// checkout is intentionally held back (e.g. Paddle approval pending) — the UI
// should show "Coming soon" instead of a working checkout button. Defaults to
// comingSoon=true until loaded so we never flash a live checkout we can't honor.
export function useBillingConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    let alive = true;
    fetch(`${API}/api/billing/config`)
      .then((r) => r.json())
      .then((d) => { if (alive) setCfg(d); })
      .catch(() => { if (alive) setCfg({ enabled: false, comingSoon: true }); });
    return () => { alive = false; };
  }, []);
  return {
    cfg,
    loaded: !!cfg,
    paymentsEnabled: !!cfg?.enabled,
    // treat "not loaded yet" and "configured-but-held-back" both as coming soon
    comingSoon: cfg ? (cfg.comingSoon || !cfg.enabled) : true,
  };
}
