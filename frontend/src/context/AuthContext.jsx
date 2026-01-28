import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const AuthContext = createContext(null);

const loadTokens = () => {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(() => loadTokens());

  const login = (payload) => {
    setAuth(payload);
    localStorage.setItem('auth', JSON.stringify(payload));
  };

  const logout = () => {
    setAuth(null);
    localStorage.removeItem('auth');
  };

  useEffect(() => {
    const handler = () => setAuth(loadTokens());
    window.addEventListener('storage', handler);
    window.addEventListener('auth:updated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('auth:updated', handler);
    };
  }, []);

  useEffect(() => {
    if (!auth?.accessToken || (auth.roles && auth.roles.length)) {
      return;
    }
    let active = true;
    api.get('/users/me')
      .then((res) => {
        if (!active) return;
        const nextAuth = { ...auth, roles: res.data.roles || [] };
        setAuth(nextAuth);
        localStorage.setItem('auth', JSON.stringify(nextAuth));
      })
      .catch(() => {
        if (!active) return;
        setAuth(null);
        localStorage.removeItem('auth');
      });
    return () => {
      active = false;
    };
  }, [auth?.accessToken]);

  const value = useMemo(() => ({
    auth,
    accessToken: auth?.accessToken || null,
    refreshToken: auth?.refreshToken || null,
    roles: auth?.roles || [],
    isAuthenticated: Boolean(auth?.accessToken),
    login,
    logout
  }), [auth]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
};
