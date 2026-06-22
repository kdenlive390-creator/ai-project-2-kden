// API helper
const API = {
  baseUrl: '/api',

  getToken() {
    return localStorage.getItem('cf_token');
  },

  async request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);

    const res = await fetch(this.baseUrl + path, opts);
    const data = await res.json().catch(() => ({ error: 'Server error' }));

    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  get: (path) => API.request('GET', path),
  post: (path, body) => API.request('POST', path, body),
  delete: (path, body) => API.request('DELETE', path, body),
};
