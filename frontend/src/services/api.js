import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL });
const authClient = axios.create({ baseURL });

const getStoredAuth = () => {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const emitAuthUpdate = () => {
  window.dispatchEvent(new Event('auth:updated'));
};

api.interceptors.request.use((config) => {
  const auth = getStoredAuth();
  if (auth?.accessToken) {
    config.headers.Authorization = `Bearer ${auth.accessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original?._retry) {
      const auth = getStoredAuth();
      if (!auth?.refreshToken) {
        localStorage.removeItem('auth');
        emitAuthUpdate();
        return Promise.reject(error);
      }

      original._retry = true;
      try {
        const { data } = await authClient.post('/auth/refresh', {
          refreshToken: auth.refreshToken
        });
        const nextAuth = {
          ...auth,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          roles: data.roles || auth.roles || []
        };
        localStorage.setItem('auth', JSON.stringify(nextAuth));
        emitAuthUpdate();
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        localStorage.removeItem('auth');
        emitAuthUpdate();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
