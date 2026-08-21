import { api } from "../api.js";
import {
  activityTone,
  babyAvatar,
  badge,
  barList,
  card,
  clear,
  definitionList,
  el,
  emptyState,
  errorBox,
  skeleton,
  table,
} from "../ui.js";
import {
  babyAge,
  dateOnly,
  dateTime,
  decimal,
  duration,
  elapsed,
  num,
  relative,
  titleCase,
} from "../format.js";

const SORTS = [
  { value: "logs", label: "Most entries" },
  { value: "recent", label: "Last entry" },
  { value: "created", label: "Newest" },
  { value: "name", label: "Name" },
];

export async function render(ctx) {
  const state = { q: "", sort: "logs", page: 1, pageSize: 25 };
  const body = el("div", {});
  clear(ctx.root).append(body);

  const search = el("input", {
    class: "field field-search",
    type: "search",
    placeholder: "Search baby name…",
    "aria-label": "Search babies",
  });

  let debounce;
  search.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.q = search.value.trim();
      state.page = 1;
      load();
    }, 220);
  });

  const sortSelect = el(
    "select",
    {
      class: "field",
      "aria-label": "Sort by",
      onChange: (event) => {
        state.sort = event.target.value;
        state.page = 1;
        load();
      },
    },
    SORTS.map((option) => el("option", { value: option.value, text: option.label }))
  );

  clear(ctx.actions).append(search, sortSelect);

  async function load() {
    clear(body).append(skeleton("chart"));
    let data;
    try {
      data = await api.babies(state);
    } catch (err) {
      clear(body).append(errorBox(err.message));
      return;
    }

    ctx.setSubtitle(`${num(data.total)} bab${data.total === 1 ? "y" : "ies"} on the service`);

    const rows = table({
      columns: [
        {
          label: "Baby",
          render: (row) =>
            el(
              "span",
              { class: "row row-tight" },
              babyAvatar(row, 30),
              el(
                "span",
                { class: "stack" },
                el("span", { class: "strong", text: row.name }),
                el("small", {
                  text: [babyAge(row.dob) ?? "no date of birth", titleCase(row.gender)]
                    .filter(Boolean)
                    .join(" · "),
                })
              )
            ),
        },
        {
          label: "Caregivers",
          render: (row) =>
            el(
              "span",
              { class: "row row-tight" },
              (row.caregivers ?? []).slice(0, 3).map((person) =>
                el(
                  "span",
                  { class: "baby-chip", title: person.email },
                  el("span", {
                    class: "baby-avatar",
                    text: person.role === "owner" ? "★" : "•",
                  }),
                  person.name
                )
              ),
              (row.caregivers?.length ?? 0) > 3 &&
                el("span", { class: "subtle", text: `+${row.caregivers.length - 3}` })
            ),
        },
        { label: "Entries", align: "right", render: (row) => num(row.logCount) },
        {
          label: "This week",
          align: "right",
          render: (row) =>
            row.logs7d > 0
              ? num(row.logs7d)
              : el("span", { class: "subtle", text: "0" }),
        },
        {
          label: "Last entry",
          render: (row) =>
            row.runningTimers > 0
              ? badge("timer running", "success", { dot: "live" })
              : el("span", { class: "muted nowrap", text: relative(row.lastLogAt) }),
        },
        {
          label: "Added",
          render: (row) => el("span", { class: "muted nowrap", text: dateOnly(row.createdAt) }),
        },
      ],
      rows: data.babies,
      onRowClick: (row) => openBaby(ctx, row),
      empty: state.q ? `No baby matches “${state.q}”.` : "No babies yet.",
    });

    const pager =
      data.totalPages > 1
        ? el(
            "div",
            { class: "pager" },
            el("span", { text: `Page ${data.page} of ${data.totalPages}` }),
            el(
              "div",
              { class: "row row-tight" },
              el("button", {
                class: "btn",
                text: "Previous",
                disabled: data.page <= 1,
                onClick: () => {
                  state.page -= 1;
                  load();
                },
              }),
              el("button", {
                class: "btn",
                text: "Next",
                disabled: data.page >= data.totalPages,
                onClick: () => {
                  state.page += 1;
                  load();
                },
              })
            )
          )
        : null;

    clear(body).append(card({ class: "card-flush", body: [rows, pager] }));
  }

  await load();
  return () => clearTimeout(debounce);
}

/* ------------------------------------------------------------------ drawer */

async function openBaby(ctx, row) {
  ctx.openDrawer({
    title: row.name,
    subtitle: babyAge(row.dob) ?? "date of birth not set",
    body: skeleton("chart"),
  });

  let data;
  try {
    data = await api.baby(row.id);
  } catch (err) {
    ctx.setDrawerBody(errorBox(err.message));
    return;
  }

  const { baby, logTypes, recentLogs, timers, vaccines, invites, reminders, growth } = data;
  const latestGrowth = growth[growth.length - 1];
  const dosesGiven = vaccines.filter((v) => v.givenAt).length;

  const facts = definitionList([
    ["Date of birth", baby.dob ? `${dateOnly(baby.dob)} · ${babyAge(baby.dob)}` : "not set"],
    ["Gender", titleCase(baby.gender)],
    ["Added", dateOnly(baby.createdAt)],
    ["Created by", `${baby.owner.name} (${baby.owner.email})`],
    ["Entries", num(baby.logCount)],
    [
      "Milk balance correction",
      baby.milkBalanceAdjustmentMl ? `${decimal(baby.milkBalanceAdjustmentMl, 0)} ml` : null,
    ],
    ["Nappies in stock", num(baby.diaperStockCount)],
    ["Bag checklist", `${num(baby.bagItems)} items`],
    ["Immunisations recorded", `${num(dosesGiven)} of 12 months`],
    ["Reminders", num(reminders.length)],
    [
      "Latest measurements",
      latestGrowth
        ? [
            latestGrowth.weightKg ? `${decimal(latestGrowth.weightKg, 2)} kg` : null,
            latestGrowth.heightCm ? `${decimal(latestGrowth.heightCm, 1)} cm` : null,
            latestGrowth.headCircumferenceCm
              ? `${decimal(latestGrowth.headCircumferenceCm, 1)} cm head`
              : null,
          ]
            .filter(Boolean)
            .join(" · ") || null
        : null,
    ],
  ]);

  const caregiversCard = card({
    title: `Caregivers (${baby.caregivers.length})`,
    body: el(
      "div",
      { class: "grid", style: { gap: "10px" } },
      baby.caregivers.map((person) =>
        el(
          "div",
          { class: "row", style: { justifyContent: "space-between" } },
          el(
            "span",
            { class: "stack" },
            el("span", { class: "strong", text: person.name }),
            el("small", {
              text: [
                person.email,
                person.relationNote || person.relation
                  ? titleCase(person.relationNote || person.relation)
                  : null,
              ]
                .filter(Boolean)
                .join(" · "),
            })
          ),
          badge(
            person.role === "owner" ? "Owner" : "Caregiver",
            person.role === "owner" ? "accent" : "muted"
          )
        )
      )
    ),
  });

  const timersCard = timers.length
    ? card({
        title: "Running now",
        body: el(
          "div",
          { class: "grid", style: { gap: "8px" } },
          timers.map((timer) => {
            const tone = activityTone(timer.type);
            return el(
              "div",
              { class: "row", style: { justifyContent: "space-between" } },
              el("span", { class: "row row-tight" }, tone.emoji, tone.label, timer.side ?? ""),
              el(
                "span",
                { class: "row row-tight" },
                el("span", { class: "muted", text: `started by ${timer.enteredByName}` }),
                badge(elapsed(timer.startTime), "success", { dot: "live" })
              )
            );
          })
        ),
      })
    : null;

  const invitesCard = invites.length
    ? card({
        title: `Pending invites (${invites.length})`,
        body: el(
          "div",
          { class: "grid", style: { gap: "8px" } },
          invites.map((invite) =>
            el(
              "div",
              { class: "row", style: { justifyContent: "space-between" } },
              el("span", { text: invite.email ?? "Share link" }),
              el(
                "span",
                { class: "row row-tight" },
                badge(invite.kind === "link" ? "Link" : "Email", "info"),
                invite.expiresAt &&
                  badge(
                    new Date(invite.expiresAt) < new Date()
                      ? "Expired"
                      : `Expires ${relative(invite.expiresAt)}`,
                    new Date(invite.expiresAt) < new Date() ? "danger" : "muted"
                  )
              )
            )
          )
        ),
      })
    : null;

  const typesCard = logTypes.length
    ? card({
        title: "What's recorded",
        body: barList(
          logTypes.slice(0, 10).map((entry) => {
            const tone = activityTone(entry.key);
            return { ...entry, label: tone.label, emoji: tone.emoji, color: tone.main };
          }),
          { colorFor: (item) => item.color, formatValue: num }
        ),
      })
    : null;

  const recentCard = card({
    title: "Recent entries",
    body: recentLogs.length
      ? table({
          columns: [
            {
              label: "Type",
              render: (log) => {
                const tone = activityTone(log.type);
                return el("span", { class: "row row-tight" }, tone.emoji, tone.label);
              },
            },
            {
              label: "Detail",
              render: (log) =>
                el("span", {
                  class: "muted",
                  text:
                    log.amountMl != null
                      ? `${decimal(log.amountMl, 0)} ml`
                      : log.diaperStatus
                        ? titleCase(log.diaperStatus)
                        : log.durationMinutes != null
                          ? duration(log.durationMinutes)
                          : "—",
                }),
            },
            { label: "By", render: (log) => log.enteredByName },
            {
              label: "When",
              render: (log) =>
                el("span", { class: "muted nowrap", text: dateTime(log.startTime) }),
            },
          ],
          rows: recentLogs,
        })
      : emptyState("Nothing logged for this baby yet."),
  });

  ctx.setDrawerBody(
    el(
      "div",
      { class: "grid", style: { gap: "14px" } },
      card({ title: "Baby", body: facts }),
      timersCard,
      caregiversCard,
      invitesCard,
      typesCard,
      recentCard
    )
  );
}
