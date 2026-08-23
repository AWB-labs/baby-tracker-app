/**
 * The shell: sign-in, the sidebar, and the hash router that swaps views.
 *
 * Hash routing rather than history: the dashboard is one static file behind
 * express.static, and a hash never asks the server for a path it would have to
 * be taught to rewrite.
 */

import { api, getToken, setToken, setUnauthorizedHandler } from "./api.js";
import { el, clear, errorBox, skeleton } from "./ui.js";
import { initials, relative } from "./format.js";

const VIEWS = [
  { id: "overview", icon: "◎", label: "Overview", title: "Overview" },
  { id: "users", icon: "◍", label: "Users", title: "Users & babies" },
  { id: "babies", icon: "☻", label: "Babies", title: "Babies" },
  { id: "engagement", icon: "◈", label: "Engagement", title: "Engagement" },
  { id: "live", icon: "◉", label: "Live", title: "Live activity" },
  { id: "feedback", icon: "★", label: "Feedback", title: "Ratings & feedback" },
  { id: "system", icon: "⚙", label: "System", title: "System health" },
];

const dom = {
  boot: document.getElementById("boot"),
  login: document.getElementById("login"),
  shell: document.getElementById("shell"),
  loginForm: document.getElementById("login-form"),
  loginError: document.getElementById("login-error"),
  loginSubmit: document.getElementById("login-submit"),
  nav: document.getElementById("nav"),
  content: document.getElementById("content"),
  title: document.getElementById("page-title"),
  sub: document.getElementById("page-sub"),
  actions: document.getElementById("page-actions"),
  whoName: document.getElementById("who-name"),
  whoEmail: document.getElementById("who-email"),
  whoAvatar: document.getElementById("who-avatar"),
  signout: document.getElementById("signout"),
  drawer: document.getElementById("drawer"),
  scrim: document.getElementById("drawer-scrim"),
};

/* ------------------------------------------------------------------ drawer */

function closeDrawer() {
  dom.drawer.hidden = true;
  dom.scrim.hidden = true;
  clear(dom.drawer);
}

function openDrawer({ title, subtitle, body }) {
  clear(dom.drawer).append(
    el(
      "div",
      { class: "drawer-head" },
      el(
        "div",
        {},
        el("h2", { text: title }),
        subtitle && el("p", { class: "muted", text: subtitle })
      ),
      el("button", { class: "close-x", text: "✕", "aria-label": "Close", onClick: closeDrawer })
    ),
    el("div", { class: "drawer-body" }, body)
  );
  dom.drawer.hidden = false;
  dom.scrim.hidden = false;
  dom.drawer.scrollTop = 0;
}

/** Swap a drawer's body once its detail request lands, keeping it open. */
function setDrawerBody(body) {
  const container = dom.drawer.querySelector(".drawer-body");
  if (container) clear(container).append(body);
}

dom.scrim.addEventListener("click", closeDrawer);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !dom.drawer.hidden) closeDrawer();
});

/* ------------------------------------------------------------------ router */

let cleanup = null;
let currentId = null;

function currentRoute() {
  const id = location.hash.replace(/^#\/?/, "").split("?")[0];
  return VIEWS.find((v) => v.id === id) ?? VIEWS[0];
}

async function route() {
  const view = currentRoute();
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
  closeDrawer();

  currentId = view.id;
  dom.title.textContent = view.title;
  dom.sub.textContent = "";
  clear(dom.actions);
  clear(dom.content).append(
    el("div", { class: "grid grid-kpi" }, skeleton("kpi", 4)),
    el("div", { class: "section" }, skeleton("chart"))
  );

  for (const link of dom.nav.querySelectorAll("a")) {
    if (link.dataset.id === view.id) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }

  try {
    const module = await import(`./views/${view.id}.js`);
    // A slow import that finishes after the user has moved on must not paint
    // over whatever they navigated to.
    if (currentId !== view.id) return;
    cleanup = (await module.render(context())) ?? null;
  } catch (err) {
    if (currentId !== view.id) return;
    clear(dom.content).append(
      errorBox(err?.message ?? "Something went wrong loading this section.")
    );
  }
}

function context() {
  return {
    root: dom.content,
    actions: dom.actions,
    setSubtitle: (text) => {
      dom.sub.textContent = text ?? "";
    },
    setStamp: (at) => {
      dom.sub.textContent = at ? `Updated ${relative(at)}` : "";
    },
    openDrawer,
    setDrawerBody,
    closeDrawer,
    reload: route,
    navigate: (id) => {
      location.hash = `#/${id}`;
    },
  };
}

/* -------------------------------------------------------------------- shell */

function buildNav() {
  clear(dom.nav).append(
    ...VIEWS.map((view) =>
      el(
        "a",
        { href: `#/${view.id}`, dataset: { id: view.id } },
        el("span", { class: "nav-icon", text: view.icon, "aria-hidden": "true" }),
        view.label
      )
    )
  );
}

function showLogin(message) {
  dom.boot.hidden = true;
  dom.shell.hidden = true;
  dom.login.hidden = false;
  if (message) {
    dom.loginError.textContent = message;
    dom.loginError.hidden = false;
  }
  document.getElementById("email").focus();
}

function showShell(admin) {
  dom.boot.hidden = true;
  dom.login.hidden = true;
  dom.shell.hidden = false;
  dom.whoName.textContent = admin.name;
  dom.whoEmail.textContent = admin.email;
  dom.whoAvatar.textContent = initials(admin.name);
  buildNav();
  route();
}

dom.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  dom.loginError.hidden = true;
  dom.loginSubmit.disabled = true;
  dom.loginSubmit.textContent = "Signing in…";

  try {
    const data = new FormData(dom.loginForm);
    const result = await api.login(data.get("email").trim(), data.get("password"));
    setToken(result.token);
    dom.loginForm.reset();
    showShell(result.admin);
  } catch (err) {
    dom.loginError.textContent = err?.message ?? "Couldn't sign in.";
    dom.loginError.hidden = false;
  } finally {
    dom.loginSubmit.disabled = false;
    dom.loginSubmit.textContent = "Sign in";
  }
});

dom.signout.addEventListener("click", () => {
  setToken(null);
  location.hash = "";
  showLogin();
});

setUnauthorizedHandler(() => showLogin("Your session expired. Please sign in again."));
window.addEventListener("hashchange", () => {
  if (!dom.shell.hidden) route();
});

(async function boot() {
  if (!getToken()) {
    showLogin();
    return;
  }
  try {
    const { admin } = await api.me();
    showShell(admin);
  } catch {
    // setUnauthorizedHandler already swapped to the login screen for a 401;
    // this covers the rest (the server being down mid-refresh, say).
    showLogin();
  }
})();
