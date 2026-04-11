/**
 * Global axios interceptor — injects the active workspace ID into every
 * outgoing request so the backend can scope data to the correct workspace.
 *
 * Import this module once (e.g. in App.jsx) for the side-effect to take place.
 */
import axios from 'axios';

// eslint-disable-next-line no-console
console.log('[axiosSetup] Interceptor carregado');

const LS_KEY = 'activeWorkspaceId';

axios.interceptors.request.use((config) => {
  try {
    const wsId = localStorage.getItem(LS_KEY);
    if (wsId) {
      config.headers.set('X-Workspace-Id', wsId);
    }
    // eslint-disable-next-line no-console
    console.debug('[axiosSetup] X-Workspace-Id:', wsId, '→', config.url);
  } catch {
    // localStorage may throw in private mode — silently ignore
  }
  return config;
});

// Response interceptor — dispatch a custom event on module-permission 403
// so that PermissionGate can react even after the page has loaded.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 403 &&
      typeof error.response?.data?.detail === 'string' &&
      error.response.data.detail.includes('permissão')
    ) {
      window.dispatchEvent(new CustomEvent('api-permission-denied'));
    }
    return Promise.reject(error);
  },
);
