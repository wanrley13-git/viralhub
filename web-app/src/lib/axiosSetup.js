/**
 * Global axios interceptor — injects the active workspace ID into every
 * outgoing request so the backend can scope data to the correct workspace.
 *
 * Import this module once (e.g. in App.jsx) for the side-effect to take place.
 */
import axios from 'axios';

const LS_KEY = 'activeWorkspaceId';

axios.interceptors.request.use((config) => {
  try {
    const wsId = localStorage.getItem(LS_KEY);
    if (wsId) {
      config.headers = config.headers || {};
      config.headers['X-Workspace-Id'] = wsId;
    }
  } catch {
    // localStorage may throw in private mode — silently ignore
  }
  return config;
});
