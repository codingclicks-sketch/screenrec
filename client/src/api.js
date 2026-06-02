// In dev: proxy to localhost:3001 (via vite.config.js)
// In production: set VITE_API_URL to your Railway backend URL
const API = import.meta.env.VITE_API_URL || '';
export default API;
