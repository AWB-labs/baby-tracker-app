import { api } from "../api.js";
import { activityTone, badge, barList, card, clear, el, kpi } from "../ui.js";
import { donut, timeSeries } from "../charts.js";
import { dateShort, decimal, num, percent } from "../format.js";

export async function render(ctx) {
  const data = await api.overview();
  ctx.setStamp(data.generatedAt);
  clear(ctx.actions).append(
    el("button", { class: "btn", text: "Refresh", onClick: ctx.reload })
  );

  const { users, babies, logs, series, logTypes, pushPlatforms } = data;
  const labels = series.logs.map((point) => point.date);

  const kpis = el(
    "div",
    { class: "grid grid-kpi grid-kpi-6" },
    kpi({
      label: "Caregivers",
      value: num(users.total),
      foot: `+${num(users.new7d)} in the last 7 days`,
    }),
    kpi({
      label: `Active · last ${data.activeWindowHours}h`,
      value: num(users.active),
      tone: "accent",
      foot: el(
        "span",
        { class: "kpi-foot row row-tight" },
        badge(`${percent(users.active, users.total)} of all`, "success"),
        `${num(users.dormant)} dormant`
      ),
    }),
    kpi({
      label: "Babies tracked",
      value: num(babies.total),
      foot: `${num(babies.shared)} shared with a second caregiver`,
    }),
    kpi({
      label: "Entries logged",
      value: num(logs.total),
      foot: `${decimal(logs.perBaby)} per baby on average`,
    }),
    kpi({
      label: "Logged today",
      value: num(logs.last24h),
      foot: `${num(logs.last7d)} in the last 7 days`,
    }),
    kpi({
      label: "Timers running",
      value: num(data.liveTimers),
      foot: data.liveTimers
        ? el(
            "span",
            { class: "kpi-foot" },
            badge("live right now", "success", { dot: "live" })
          )
        : "nothing in progress",
    })
  );

  const activityChart = card({
    title: "Entries logged",
    note: "Last 30 days, by the day the entry was written",
    body: timeSeries({
      labels,
      series: [
        {
          label: "Entries",
          color: "var(--accent)",
          values: series.logs.map((point) => point.count),
        },
      ],
      formatLabel: (value) => dateShort(value),
    }),
  });

  const signupChart = card({
    title: "New caregivers",
    note: "Last 30 days",
    body: timeSeries({
      labels,
      series: [
        {
          label: "Sign-ups",
          color: "#6366f1",
          values: series.signups.map((point) => point.count),
        },
      ],
      formatLabel: (value) => dateShort(value),
      formatValue: (value) => String(Math.round(value)),
    }),
  });

  const activeSplit = card({
    class: "card-center",
    title: "Who's still with us",
    note: `Active means any activity in the last ${data.activeWindowHours} hours`,
    body: donut({
      segments: [
        { label: "Active", value: users.active, color: "var(--accent)" },
        { label: "Dormant", value: users.dormant, color: "var(--surface-sunken)" },
      ],
      centerValue: percent(users.active, users.total),
      centerLabel: "active",
    }),
  });

  const typeBreakdown = card({
    title: "What gets logged",
    note: "Every entry ever recorded, by type",
    body: barList(
      logTypes.slice(0, 10).map((row) => {
        const tone = activityTone(row.key);
        return { ...row, label: tone.label, emoji: tone.emoji, color: tone.main };
      }),
      { colorFor: (item) => item.color, formatValue: num }
    ),
  });

  const reach = card({
    title: "Notification reach",
    note: "Registered devices, by platform",
    body: pushPlatforms.length
      ? barList(
          pushPlatforms.map((row) => ({
            ...row,
            label: row.key === "ios" ? "iOS" : row.key === "android" ? "Android" : row.key,
          })),
          { formatValue: num }
        )
      : el("p", { class: "muted", text: "No devices registered yet." }),
  });

  const sharing = card({
    title: "Sharing",
    note: "The invite flow, in one card",
    body: el(
      "div",
      { class: "bars" },
      barList(
        [
          { key: "shared", label: "Shared babies", count: babies.shared },
          { key: "solo", label: "One caregiver", count: babies.solo },
          { key: "invites", label: "Invites pending", count: babies.pendingInvites },
        ],
        {
          colorFor: (item) =>
            item.key === "shared"
              ? "var(--accent)"
              : item.key === "invites"
                ? "#f59e0b"
                : "var(--text-subtle)",
          formatValue: num,
          max: Math.max(babies.total, 1),
        }
      )
    ),
  });

  clear(ctx.root).append(
    kpis,
    el("div", { class: "section grid grid-2" }, activityChart, signupChart),
    el("div", { class: "section grid grid-2" }, activeSplit, typeBreakdown),
    el("div", { class: "section grid grid-2" }, sharing, reach)
  );
}
