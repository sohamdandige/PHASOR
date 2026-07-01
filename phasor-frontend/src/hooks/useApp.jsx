import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchConfig, fetchUsage, friendlyError } from '../api/phasor';

const AppContext = createContext(null);

// Plan display metadata
export const PLAN_META = {
  free:  { label: 'Free',  color: '#A1A1AA', gradient: 'from-zinc-500 to-zinc-600' },
  core:  { label: 'Core',  color: '#7C3AED', gradient: 'from-violet-600 to-indigo-600' },
  pro:   { label: 'Pro',   color: '#2563EB', gradient: 'from-blue-600 to-cyan-500' },
  byok:  { label: 'BYOK',  color: '#10b981', gradient: 'from-emerald-500 to-teal-500' },
};

export function AppProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('phasor_token') || null);
  const [plan, setPlan] = useState('free');
  const [usage, setUsage] = useState(null);
  const [serverConfig, setServerConfig] = useState(null);
  const [byokConfig, setByokConfig] = useState(null); // { api_key, models, synthesis_model }

  // Load server config on mount
  useEffect(() => {
    fetchConfig().then(setServerConfig).catch(() => {});
  }, []);

  // Refresh usage when token changes
  const refreshUsage = useCallback(async () => {
    try {
      const u = await fetchUsage(token);
      setUsage(u);
      setPlan(u.plan);
    } catch {
      setUsage(null);
    }
  }, [token]);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  const signIn = useCallback((newToken) => {
    localStorage.setItem('phasor_token', newToken);
    setToken(newToken);
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem('phasor_token');
    setToken(null);
    setPlan('free');
    setUsage(null);
  }, []);

  return (
    <AppContext.Provider value={{
      token,
      plan,
      usage,
      serverConfig,
      byokConfig,
      setByokConfig,
      signIn,
      signOut,
      refreshUsage,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
