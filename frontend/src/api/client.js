import axios from 'axios';

const client = axios.create({ baseURL: '/api' });

// URLs where a 401 should NOT trigger automatic logout (background polling)
const SILENT_401_URLS = [
  '/notifications/unread-count',
  '/notifications/unread',
  '/notifications/history'
];

client.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  res => res,
  err => {
    if (
      err.response?.status === 401
      && !err.config?.url?.includes('/auth/login')
      && !SILENT_401_URLS.some(url => err.config?.url?.includes(url))
    ) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;
