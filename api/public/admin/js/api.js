/**
 * The dashboard's only way of talking to the server.
 *
 * Same origin as the API it reads, so there is no base URL to configure and no
 * CORS grant to keep in step — see the mount in api/src/app.ts.
 */

const TOKEN_KEY = "babytracker_admin_token";

let onUnauthorized = () => {};

/** Called when the server rejects the session, so the shell can show login. */
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private browsing with storage blocked: the session simply won't persist
    // across reloads, which is a downgrade rather than a failure.
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* see getToken */
  }
}

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const res = await fetch(`/admin/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    // A 401 anywhere means this session is finished — drop the token here
    // rather than letting every caller remember to.
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      setToken(null);
      onUnauthorized();
    }
    throw new ApiError(
      res.status,
      payload?.error ?? `Request failed (${res.status})`,
      payload?.code
    );
  }

  return payload;
}

const qs = (params) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  }
  const str = search.toString();
  return str ? `?${str}` : "";
};

export const api = {
  login: (email, password) =>
    request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  me: () => request("/auth/me"),
  overview: () => request("/overview"),
  users: (params) => request(`/users${qs(params)}`),
  user: (id) => request(`/users/${id}`),
  babies: (params) => request(`/babies${qs(params)}`),
  baby: (id) => request(`/babies/${id}`),
  engagement: (params) => request(`/engagement${qs(params)}`),
  live: (params) => request(`/live${qs(params)}`),
  system: () => request("/system"),
  feedback: (params) => request(`/feedback${qs(params)}`),
};
