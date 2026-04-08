import axios from "axios";
import { clearAuthSession, getStoredToken } from "./auth";

const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
const protocol = typeof window !== "undefined" ? window.location.protocol : "http:";
const port = (import.meta as any)?.env?.VITE_API_PORT || "5000";
const configuredUrl = (import.meta as any)?.env?.VITE_API_URL;
const baseURL = configuredUrl || `${protocol}//${host}:${port}/api`;

const api = axios.create({
  baseURL,
});

api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    if (typeof (config.headers as any)?.set === "function") {
      (config.headers as any).set("Authorization", `Bearer ${token}`);
    } else {
      config.headers = {
        ...(config.headers || {}),
        Authorization: `Bearer ${token}`,
      };
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      clearAuthSession();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
