// Remembers small per-browser preferences (dashboard choices). Never required: if the browser blocks
// storage, everything still works with defaults.
export function loadPref(key, fallback) {
  try {
    const raw = localStorage.getItem(`cjr.${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key, value) {
  try {
    localStorage.setItem(`cjr.${key}`, JSON.stringify(value));
  } catch {
    // ignore
  }
}
