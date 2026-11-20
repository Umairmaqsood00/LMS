export async function api(url, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: isForm ? undefined : { 'Content-Type': 'application/json' },
    body: options.body ? (isForm ? options.body : JSON.stringify(options.body)) : undefined
  });
  const data = await response.json();
  // Cookies are shared by tabs. Notify other tabs when login/logout changes them.
  if (response.ok && ['/auth/login', '/auth/register', '/auth/logout'].includes(url)) {
    try { localStorage.setItem('lms-auth-change', crypto.randomUUID()); } catch { /* Storage may be disabled. Focus checking still works. */ }
  }
  if (response.status === 401 && !url.startsWith('/auth/')) {
    window.dispatchEvent(new Event('lms-session-expired'));
  }
  if (!response.ok) throw new Error(data.message || 'Request failed.');
  return data;
}
export const fileUrl = file => `/api/files/${encodeURIComponent(file.split('/').pop())}`;
export const date = value => value ? new Date(value).toLocaleString() : '—';
