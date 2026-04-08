import api from "./api";

export function getStoredToken() {
  return localStorage.getItem("token") || sessionStorage.getItem("token");
}

export function getStoredUserRaw() {
  return localStorage.getItem("user") || sessionStorage.getItem("user");
}

export function clearAuthSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("activeProfileId");
  sessionStorage.removeItem("token");
  sessionStorage.removeItem("user");
  sessionStorage.removeItem("activeProfileId");
}

function setAuthSession(payload: { token: string; user?: any }, rememberMe: boolean) {
  clearAuthSession();
  const store = rememberMe ? localStorage : sessionStorage;
  store.setItem("token", payload.token);
  if (payload.user) {
    store.setItem("user", JSON.stringify(payload.user));
  }
}

export async function login(email: string, password: string, rememberMe = false) {
  const response = await api.post("/auth/login", {
    email,
    password,
    remember_me: rememberMe,
  });

  setAuthSession(
    {
      token: response.data.access_token,
      user: response.data.user,
    },
    rememberMe
  );
}

export async function register(email: string, password: string, rememberMe = false) {
  const response = await api.post("/auth/register", {
    email,
    password,
    remember_me: rememberMe,
  });

  setAuthSession(
    {
      token: response.data.access_token,
      user: response.data.user,
    },
    rememberMe
  );
}
