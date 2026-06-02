import React, { createContext, useContext, useState, useEffect } from 'react';
import API from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(null);
  const [token, setToken]   = useState(() => localStorage.getItem('sr_token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(u => { setUser(u); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [token]);

  function login(token, user) {
    localStorage.setItem('sr_token', token);
    setToken(token);
    setUser(user);
  }

  function logout() {
    localStorage.removeItem('sr_token');
    setToken(null);
    setUser(null);
  }

  // Authenticated fetch helper
  function authFetch(url, opts = {}) {
    return fetch(url, {
      ...opts,
      headers: { ...(opts.headers || {}), Authorization: `Bearer ${token}` },
    });
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, authFetch, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
