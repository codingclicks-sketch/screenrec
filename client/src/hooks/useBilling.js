import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import API from '../api';

// Central hook for everything monetization on the client. It NEVER decides access
// (the server does) — it only fetches the trusted summary so the UI can render
// the right state: meters, badges, locked features, upgrade prompts.
export function useBilling() {
  const { token } = useAuth();
  const [entitlements, setEntitlements] = useState(null);
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  const refresh = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const [eRes, uRes] = await Promise.all([
        fetch(`${API}/api/me/entitlements`, { headers: authHeaders }),
        fetch(`${API}/api/me/usage`, { headers: authHeaders }),
      ]);
      setEntitlements(eRes.ok ? await eRes.json() : null);
      setUsage(uRes.ok ? await uRes.json() : null);
    } catch { /* leave nulls */ } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  // Capability check for UI gating. Mirrors server flags; server still enforces.
  const can = useCallback((featureKey) => {
    const f = entitlements?.plan?.features;
    return !!(f && f[featureKey]);
  }, [entitlements]);

  // Report a paywall impression (conversion analytics).
  const reportUpgradeIntent = useCallback((featureRequested, meta = {}) => {
    if (!token) return;
    fetch(`${API}/api/events/upgrade-intent`, {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ featureRequested, meta }),
    }).catch(() => {});
  }, [token]);

  return {
    loading,
    entitlements,
    usage,
    plan: entitlements?.plan || null,
    planSlug: entitlements?.planSlug || 'free',
    isPaid: !!entitlements?.isPaid,
    subscription: entitlements?.subscription || null,
    can,
    refresh,
    reportUpgradeIntent,
  };
}
