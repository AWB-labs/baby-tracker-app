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
  segmented,
  skeleton,
  table,
} from "../ui.js";
import {
  babyAge,
  dateOnly,
  dateTime,
  num,
  relative,
  SOURCE_LABEL,
  titleCase,
} from "../format.js";

const SORTS = [
  { value: "recent", label: "Last active" },
  { value: "logs", label: "Most entries" },
  { value: "joined", label: "Newest" },
  { value: "name", label: "Name" },
];

export async function render(ctx) {
  const state = { q: "", status: "all", sort: "recent", page: 1, pageSize: 25 };
  const body = el("div", {});
  clear(ctx.root).append(body);

  const search = el("input", {
    class: "field field-search",
    type: "search",
    placeholder: "Search name or email…",
    "aria-label": "Search caregivers",
  });

  // Wait for a pause in typing rather than firing a query per keystroke — the
  // list is server-side searched and every letter would be its own round trip.
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

  const statusFilter = () =>
    segmented(
      [
        { value: "all", label: "All" },
        { value: "active", label: "Active" },
        { value: "dormant", label: "Dormant" },
      ],
      state.status,
      (value) => {
        state.status = value;
        state.page = 1;
        load();
      }
    );

  const paintActions = () => {
    clear(ctx.actions).append(search, statusFilter(), sortSelect);
  };
  paintActions();

  async function load() {
    clear(body).append(skeleton("chart"));
    let data;
    try {
      data = await api.users(state);
    } catch (err) {
      clear(body).append(errorBox(err.message));
      return;
    }

    paintActions();
    ctx.setSubtitle(
      `${num(data.total)} caregiver${data.total === 1 ? "" : "s"} · ` +
        `${num(data.counts.active)} active in the last ${data.activeWindowHours}h`
    );

    const rows = table({
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
          label: "Babies",
          render: (row) =>
            row.babies?.length
              ? el(
                  "div",
                  { class: "row row-tight" },
                  row.babies.slice(0, 3).map((baby) =>
                    el(
                      "span",
                      {
                        class: "baby-chip",
                        title: `${baby.role} · ${baby.logCount} entries`,
                      },
                      babyAvatar(baby),
                      baby.name,
                      baby.role === "owner" && el("span", { class: "chip-role", text: "owner" })
                    )
                  ),
                  row.babies.length > 3 &&
                    el("span", { class: "subtle", text: `+${row.babies.length - 3}` })
                )
              : el("span", { class: "subtle", text: "none yet" }),
        },
        {
          label: "Status",
          render: (row) =>
            row.active
              ? badge("Active", "success", { dot: true })
              : badge("Dormant", "muted", { dot: true }),
        },
        {
          label: "Last active",
          render: (row) =>
            el(
              "div",
              { class: "stack nowrap" },
              el("span", { text: relative(row.lastActivityAt) }),
              el("small", { text: SOURCE_LABEL[row.source] ?? row.source })
            ),
        },
        { label: "Entries", align: "right", render: (row) => num(row.logCount) },
        {
          label: "Joined",
          render: (row) => el("span", { class: "muted nowrap", text: dateOnly(row.createdAt) }),
        },
      ],
      rows: data.users,
      onRowClick: (row) => openUser(ctx, row),
      empty: state.q ? `No caregiver matches “${state.q}”.` : "No caregivers yet.",
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

async function openUser(ctx, row) {
  ctx.openDrawer({
    title: row.name,
    subtitle: row.email,
    body: skeleton("chart"),
  });

  let data;
  try {
    data = await api.user(row.id);
  } catch (err) {
    ctx.setDrawerBody(errorBox(err.message));
    return;
  }

  const { user, logTypes, recentLogs, pushTokens, reminders } = data;

  const facts = definitionList([
    ["Status", user.active ? badge("Active", "success", { dot: true }) : badge("Dormant", "muted")],
    [
      "Last active",
      el(
        "span",
        {},
        dateTime(user.lastActivityAt),
        el("span", { class: "muted", text: ` — ${SOURCE_LABEL[user.source] ?? user.source}` })
      ),
    ],
    ["Joined", dateOnly(user.createdAt)],
    ["Last request", user.lastSeenAt ? dateTime(user.lastSeenAt) : "not seen since tracking began"],
    ["Entries written", num(user.logCount)],
    ["Relation", user.relation ? titleCase(user.relationNote || user.relation) : null],
    ["Units", titleCase(user.unitSystem)],
    [
      "Notifications",
      user.notificationsEnabled ? badge("On", "success") : badge("Off", "muted"),
    ],
    ["Devices", num(pushTokens.length)],
    ["Reminders", num(reminders.length)],
    ["Profiles", num(user.profiles.length)],
    ["Invites sent", num(user.invitesSent)],
  ]);

  const babiesCard = card({
    title: `Babies (${user.babies.length})`,
    body: user.babies.length
      ? el(
          "div",
          { class: "grid", style: { gap: "10px" } },
          user.babies.map((baby) =>
            el(
              "div",
              { class: "row", style: { justifyContent: "space-between" } },
              el(
                "span",
                { class: "row row-tight" },
                babyAvatar(baby, 30),
                el(
                  "span",
                  { class: "stack" },
                  el("span", { class: "strong", text: baby.name }),
                  el("small", {
                    text: [
                      babyAge(baby.dob) ?? "no date of birth",
                      baby.relationNote || baby.relation
                        ? titleCase(baby.relationNote || baby.relation)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · "),
                  })
                )
              ),
              el(
                "span",
                { class: "row row-tight" },
                badge(baby.role === "owner" ? "Owner" : "Caregiver", baby.role === "owner" ? "accent" : "muted"),
                el("span", { class: "muted nowrap", text: `${num(baby.logCount)} entries` })
              )
            )
          )
        )
      : emptyState("This caregiver hasn't added a baby yet."),
  });

  const typesCard = logTypes.length
    ? card({
        title: "What they log",
        body: barList(
          logTypes.slice(0, 8).map((entry) => {
            const tone = activityTone(entry.key);
            return { ...entry, label: tone.label, emoji: tone.emoji, color: tone.main };
          }),
          { colorFor: (item) => item.color, formatValue: num }
        ),
      })
    : null;

  const recentCard = card({
    title: "Recent entries",
    note: "Newest 25 they wrote",
    body: table({
      columns: [
        {
          label: "Type",
          render: (log) => {
            const tone = activityTone(log.type);
            return el("span", { class: "row row-tight" }, tone.emoji, tone.label);
          },
        },
        { label: "Baby", render: (log) => log.baby.name },
        {
          label: "When",
          render: (log) => el("span", { class: "muted nowrap", text: relative(log.createdAt) }),
        },
      ],
      rows: recentLogs,
      empty: "Nothing logged yet.",
    }),
  });

  ctx.setDrawerBody(
    el(
      "div",
      { class: "grid", style: { gap: "14px" } },
      card({ title: "Account", body: facts }),
      babiesCard,
      typesCard,
      recentCard
    )
  );
}
