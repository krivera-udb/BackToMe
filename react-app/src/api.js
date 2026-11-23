const localApiBase = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin;
const authUrlOverride = import.meta.env.VITE_API_AUTH_URL;

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (authUrlOverride ? authUrlOverride.replace(/\/api\/auth\/?$/, '') : localApiBase);
export const API_AUTH_URL = authUrlOverride || `${API_BASE_URL}/api/auth`;
