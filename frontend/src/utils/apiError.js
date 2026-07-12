export function getApiErrorMessage(err, fallback = 'Request failed') {
  const data = err?.response?.data;

  if (typeof data === 'string' && data.trim()) return data;
  if (data && typeof data.error === 'string' && data.error.trim()) return data.error;
  if (data && typeof data.message === 'string' && data.message.trim()) return data.message;
  if (data && Array.isArray(data.errors) && data.errors.length > 0) {
    const first = data.errors.find(Boolean);
    if (typeof first === 'string') return first;
    if (first && typeof first.message === 'string') return first.message;
  }

  if (typeof err?.message === 'string' && err.message.trim()) return err.message;
  return fallback;
}

