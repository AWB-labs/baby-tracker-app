import { api } from "../api.js";
import { badge, card, clear, el, emptyState, errorBox, kpi, segmented, skeleton, table } from "../ui.js";
import { heatmap, timeSeries } from "../charts.js";
import { dateShort, decimal, duration, num, percent } from "../format.js";

const WINDOWS = [
  { value: 7, label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

export async function render(ctx) {
  let days = 30;
  const body = el("div", {});
  clear(ctx.root).append(body);

  const paintActions = () => {
    clear(ctx.actions).append(
      segmented(WINDOWS, days, (value) => {
        days = value;
        load();
      })
    );
  };

  async function load() {
    paintActions();
    clear(body).append(el("div", { class: "grid grid-kpi" }, skeleton("kpi", 4)));

    let data;
    try {
      data = await api.engagement({ days });
    } catch (err) {
      clear(body).append(errorBox(err.message));
      return;
    }

    const { activation, stickiness, daily, cohorts, leaderboard } = data;
    ctx.setSubtitle(`Last ${data.windowDays} days`);

    const kpis = el(
      "div",
      { class: "grid grid-kpi" },
      kpi({
        label: "Activation",
        value: percent(activation.everLogged, activation.signedUp),
        tone: "accent",
        foot: `${num(activation.everLogged)} of ${num(activation.signedUp)} ever logged something`,
      }),
      kpi({
        label: "Logged on day one",
        value: percent(activation.within24h, activation.signedUp),
        foot: "wrote their first entry within 24h of signing up",
      }),
      kpi({
        label: "Time to first entry",
        value:
          activation.medianHoursToFirstLog == null
            ? "—"
            : duration(activation.medianHoursToFirstLog * 60),
        foot: "median, from sign-up",
      }),
      kpi({
        label: "Stickiness",
        value: percent(stickiness.avgDailyActive, stickiness.activeInWindow),
        foot: `${decimal(stickiness.avgDailyActive)} caregivers log on an average day, of ${num(
          stickiness.activeInWindow
        )} in the window`,
      })
    );

    const activeChart = card({
      title: "Caregivers logging each day",
      note: "A caregiver counts once per day, however much they wrote",
      // Caregivers only. Entries were on the same axis at first and buried it —
      // a day with sixty entries and four caregivers flattens the line that
      // this card is named after. Entries per day have their own chart on the
      // overview, drawn at their own scale.
      body: timeSeries({
        labels: daily.map((point) => point.date),
        series: [
          {
            label: "Caregivers",
            color: "var(--accent)",
            values: daily.map((point) => point.users),
          },
        ],
        formatLabel: (value) => dateShort(value),
      }),
    });

    const heatCard = card({
      title: "When entries happen",
      note: "By the time the activity started, in UTC — the night shift is the dark band",
      body: heatmap(data.heatmap),
    });

    const cohortCard = card({
      class: "card-flush",
      title: "Weekly cohorts",
      note: "Each sign-up week, and the weeks after it they came back to log",
      body: table({
        columns: [
          {
            label: "Joined week of",
            render: (row) => el("span", { class: "nowrap", text: dateShort(row.week) }),
          },
          { label: "Size", align: "right", render: (row) => num(row.size) },
          {
            label: "Activated",
            align: "right",
            render: (row) => cohortCell(row.activated, row.size, true),
          },
          ...[0, 1, 2, 3].map((week) => ({
            label: `W${week}`,
            align: "right",
            render: (row) =>
              row.weeksElapsed < week
                ? el("span", { class: "subtle", text: "—", title: "That week hasn't happened yet" })
                : cohortCell(row.retained[week], row.size),
          })),
          {
            label: "Still active",
            align: "right",
            render: (row) =>
              row.stillActive > 0
                ? badge(`${row.stillActive}`, "success")
                : el("span", { class: "subtle", text: "0" }),
          },
        ],
        rows: cohorts,
        empty: "No cohorts yet.",
      }),
    });

    const leaderCard = card({
      class: "card-flush",
      title: "Most active caregivers",
      note: `Entries written in the last ${data.windowDays} days`,
      body: leaderboard.length
        ? table({
            columns: [
              {
                label: "#",
                render: (row) =>
                  el("span", { class: "subtle", text: String(leaderboard.indexOf(row) + 1) }),
              },
              {
                label: "Caregiver",
                render: (row) =>
                  el(
                    "div",
                    { class: "stack" },
                    el("span", { class: "strong", text: row.name }),
                    row.email && el("small", { text: row.email })
                  ),
              },
              { label: "Entries", align: "right", render: (row) => num(row.logs) },
            ],
            rows: leaderboard,
          })
        : emptyState("Nobody has logged anything in this window."),
    });

    clear(body).append(
      kpis,
      el("div", { class: "section" }, activeChart),
      el("div", { class: "section" }, heatCard),
      el("div", { class: "section grid grid-2" }, cohortCard, leaderCard)
    );
  }

  await load();
}

/**
 * A retention cell: the count, tinted by the share it represents, so a reader
 * follows the fade down a column instead of comparing twenty numbers.
 */
function cohortCell(value, size, emphasise = false) {
  const share = size > 0 ? value / size : 0;
  return el("span", {
    class: "cohort-cell",
    // The percentage is what a column is read down; the raw count would make
    // four narrow columns wrap, so it moves to the tooltip.
    text: emphasise ? `${value} · ${Math.round(share * 100)}%` : `${Math.round(share * 100)}%`,
    title: `${value} of ${size}`,
    style: {
      background: share > 0 ? `color-mix(in srgb, var(--accent) ${Math.round(share * 70)}%, transparent)` : "transparent",
      color: share > 0.55 ? "var(--text)" : emphasise ? "var(--accent-text)" : "var(--text-muted)",
    },
  });
}
