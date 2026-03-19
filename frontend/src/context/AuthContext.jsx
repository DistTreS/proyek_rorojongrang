import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { normalizeRoles } from '../constants/rbac';
import { AuthContext } from './auth-context';

const loadTokens = () => {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed ? { ...parsed, roles: normalizeRoles(parsed.roles) } : null;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(() => loadTokens());

  const login = (payload) => {
    const nextAuth = {
      ...payload,
      roles: normalizeRoles(payload?.roles)
    };
    setAuth(nextAuth);
    localStorage.setItem('auth', JSON.stringify(nextAuth));
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
        const nextAuth = { ...auth, roles: normalizeRoles(res.data.roles) };
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
  }, [auth]);

  const value = useMemo(() => ({
    auth,
    accessToken: auth?.accessToken || null,
    refreshToken: auth?.refreshToken || null,
    roles: normalizeRoles(auth?.roles),
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
