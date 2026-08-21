import { api } from "../api.js";
import {
  activityTone,
  babyAvatar,
  badge,
  card,
  clear,
  el,
  emptyState,
  errorBox,
  skeleton,
  table,
} from "../ui.js";
import { dateTime, decimal, duration, elapsed, relative, titleCase } from "../format.js";

const REFRESH_MS = 20_000;

export async function render(ctx) {
  const body = el("div", {});
  clear(ctx.root).append(body);

  let auto = true;
  let refreshTimer = null;
  let tickTimer = null;
  let stopped = false;

  const paintActions = () => {
    clear(ctx.actions).append(
      el("button", {
        class: auto ? "btn btn-primary" : "btn",
        text: auto ? "Auto-refresh on" : "Auto-refresh off",
        onClick: () => {
          auto = !auto;
          paintActions();
          schedule();
        },
      }),
      el("button", { class: "btn", text: "Refresh now", onClick: () => load() })
    );
  };

  function schedule() {
    clearTimeout(refreshTimer);
    if (auto && !stopped) refreshTimer = setTimeout(load, REFRESH_MS);
  }

  async function load() {
    let data;
    try {
      data = await api.live({ limit: 40 });
    } catch (err) {
      clear(body).append(errorBox(err.message));
      schedule();
      return;
    }
    if (stopped) return;

    ctx.setStamp(data.generatedAt);
    clear(body).append(view(data));
    schedule();
  }

  paintActions();
  clear(body).append(skeleton("chart"));
  await load();

  // The elapsed labels on running timers advance every second on their own, so
  // a nap in progress doesn't sit frozen between the 20-second refreshes.
  tickTimer = setInterval(() => {
    for (const node of body.querySelectorAll("[data-since]")) {
      node.textContent = elapsed(node.dataset.since);
    }
  }, 1000);

  return () => {
    stopped = true;
    clearTimeout(refreshTimer);
    clearInterval(tickTimer);
  };
}

function view(data) {
  const timersCard = card({
    title: "Timers running now",
    note: "One row per feed, pump or sleep in progress anywhere",
    body: data.timers.length
      ? el(
          "div",
          { class: "grid", style: { gap: "10px" } },
          data.timers.map((timer) => {
            const tone = activityTone(timer.type);
            const stale = Date.now() - new Date(timer.startTime).getTime() > 86_400_000;
            return el(
              "div",
              { class: "live-row" },
              el(
                "span",
                { class: "row row-tight" },
                babyAvatar(timer.baby, 30),
                el(
                  "span",
                  { class: "stack" },
                  el(
                    "span",
                    { class: "strong" },
                    `${tone.emoji} ${tone.label}`,
                    timer.side ? el("span", { class: "muted", text: ` · ${timer.side}` }) : null
                  ),
                  el("small", { text: `${timer.baby.name} · started by ${timer.enteredByName}` })
                )
              ),
              el(
                "span",
                { class: "row row-tight" },
                stale && badge("running over a day", "warning"),
                el(
                  "span",
                  { class: `badge ${stale ? "badge-warning" : "badge-success"}` },
                  el("span", { class: "dot dot-live" }),
                  el("span", { dataset: { since: timer.startTime }, text: elapsed(timer.startTime) })
                )
              )
            );
          })
        )
      : emptyState("Nothing in progress right now.", "😴"),
  });

  const feedCard = card({
    class: "card-flush",
    title: "Latest entries",
    note: "Across every family, newest first",
    body: table({
      columns: [
        {
          label: "Type",
          render: (log) => {
            const tone = activityTone(log.type);
            return el("span", { class: "row row-tight nowrap" }, tone.emoji, tone.label);
          },
        },
        {
          label: "Baby",
          render: (log) =>
            el("span", { class: "row row-tight" }, babyAvatar(log.baby), log.baby.name),
        },
        { label: "Detail", render: (log) => el("span", { class: "muted", text: detail(log) }) },
        { label: "By", render: (log) => log.enteredByName },
        {
          label: "Logged",
          render: (log) =>
            el("span", {
              class: "muted nowrap",
              title: dateTime(log.createdAt),
              text: relative(log.createdAt),
            }),
        },
      ],
      rows: data.logs,
      empty: "No entries yet.",
    }),
  });

  const signupsCard = card({
    class: "card-flush",
    title: "Newest caregivers",
    body: table({
      columns: [
        {
          label: "Caregiver",
          render: (row) =>
            el(
              "div",
              { class: "stack" },
              el("span", { class: "strong", text: row.name }),
              el("small", { text: row.email })
            ),
        },
        {
          label: "Joined",
          render: (row) => el("span", { class: "muted nowrap", text: relative(row.createdAt) }),
        },
      ],
      rows: data.signups,
      empty: "No sign-ups yet.",
    }),
  });

  return el(
    "div",
    { class: "grid", style: { gap: "14px" } },
    timersCard,
    el("div", { class: "grid grid-live" }, feedCard, signupsCard)
  );
}

/** The one number or word that makes an entry recognisable at a glance. */
function detail(log) {
  if (log.amountMl != null) return `${decimal(log.amountMl, 0)} ml`;
  if (log.diaperStatus) return titleCase(log.diaperStatus);
  if (log.feverCelsius != null) return `${decimal(log.feverCelsius, 1)}°C`;
  if (log.weightKg != null) return `${decimal(log.weightKg, 2)} kg`;
  if (log.durationMinutes != null) {
    return log.sleepKind
      ? `${titleCase(log.sleepKind)} · ${duration(log.durationMinutes)}`
      : duration(log.durationMinutes);
  }
  if (log.side) return titleCase(log.side);
  return "—";
}
