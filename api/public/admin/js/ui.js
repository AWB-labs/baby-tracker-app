/** DOM building blocks. Everything the views render is assembled from these. */

/**
 * Make an element.
 *
 * Text is always set through `textContent` and attributes through
 * `setAttribute`, never by writing markup — every string in this dashboard came
 * out of somebody's account, and a caregiver called `<img onerror=…>` should be
 * a funny row in a table, not script running with an admin session.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") Object.assign(node.style, value);
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : value);
  }

  append(node, children);
  return node;
}

function append(parent, children) {
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    parent.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function frag(...children) {
  const f = document.createDocumentFragment();
  append(f, children);
  return f;
}

export function clear(node) {
  node.replaceChildren();
  return node;
}

/* ------------------------------------------------------------------ pieces */

export function card({ title, note, actions, body, class: className = "" }) {
  const head =
    title || actions
      ? el(
          "div",
          { class: "card-head" },
          el("div", {}, el("h2", { text: title }), note && el("p", { text: note })),
          actions && el("div", { class: "row row-tight" }, actions)
        )
      : null;

  return el(
    "section",
    { class: `card ${className}` },
    head,
    el("div", { class: "card-body" }, body)
  );
}

export function kpi({ label, value, unit, foot, tone }) {
  return el(
    "div",
    { class: `card kpi ${tone ? `kpi-${tone}` : ""}` },
    el("span", { class: "kpi-label", text: label }),
    el("span", { class: "kpi-value" }, String(value), unit && el("small", { text: unit })),
    foot && (foot instanceof Node ? foot : el("span", { class: "kpi-foot", text: foot }))
  );
}

export function badge(text, tone = "muted", { dot = false } = {}) {
  return el(
    "span",
    { class: `badge badge-${tone}` },
    dot && el("span", { class: `dot ${dot === "live" ? "dot-live" : ""}` }),
    text
  );
}

export function emptyState(message, mark = "🍼") {
  return el("div", { class: "empty" }, el("span", { class: "empty-mark", text: mark }), message);
}

export function errorBox(message) {
  return el("div", { class: "error-box", text: message });
}

export function skeleton(kind = "chart", count = 1) {
  return frag(
    ...Array.from({ length: count }, () => el("div", { class: `skeleton skeleton-${kind}` }))
  );
}

/**
 * A table.
 *
 * `columns` is [{ key, label, align, render }]; `render` gets the whole row so
 * a cell can be a badge or a chip rather than a string.
 */
export function table({ columns, rows, onRowClick, empty = "Nothing here yet." }) {
  if (!rows.length) return emptyState(empty);

  const head = el(
    "thead",
    {},
    el(
      "tr",
      {},
      columns.map((col) =>
        el("th", { class: col.align === "right" ? "num" : "", text: col.label })
      )
    )
  );

  const body = el(
    "tbody",
    {},
    rows.map((row) =>
      el(
        "tr",
        {
          class: onRowClick ? "clickable" : "",
          ...(onRowClick ? { onClick: () => onRowClick(row) } : {}),
        },
        columns.map((col) =>
          el(
            "td",
            { class: col.align === "right" ? "num" : "" },
            col.render ? col.render(row) : row[col.key]
          )
        )
      )
    )
  );

  return el("div", { class: "table-wrap" }, el("table", {}, head, body));
}

/** A ranked list of labelled bars — the shape most breakdowns here want. */
export function barList(items, { colorFor, formatValue = (v) => v, max } = {}) {
  if (!items.length) return emptyState("No data yet.");
  const ceiling = max ?? Math.max(...items.map((i) => i.count), 1);

  return el(
    "div",
    { class: "bars" },
    items.map((item) =>
      el(
        "div",
        { class: "bar-row" },
        el(
          "span",
          { class: "bar-label" },
          item.emoji && el("span", { text: item.emoji }),
          el("span", { text: item.label })
        ),
        el(
          "span",
          { class: "bar-track" },
          el("span", {
            class: "bar-fill",
            style: {
              width: `${Math.max(2, (item.count / ceiling) * 100)}%`,
              background: colorFor ? colorFor(item) : "var(--accent)",
            },
          })
        ),
        el("span", { class: "num", text: formatValue(item.count) })
      )
    )
  );
}

export function segmented(options, current, onChange) {
  return el(
    "div",
    { class: "segmented", role: "group" },
    options.map((option) =>
      el("button", {
        type: "button",
        text: option.label,
        "aria-pressed": String(option.value === current),
        onClick: () => onChange(option.value),
      })
    )
  );
}

export function definitionList(pairs) {
  return el(
    "dl",
    { class: "deflist" },
    pairs
      .filter(([, value]) => value !== null && value !== undefined && value !== "")
      .map(([term, value]) =>
        frag(
          el("dt", { text: term }),
          el("dd", {}, value instanceof Node ? value : String(value))
        )
      )
  );
}

/* ------------------------------------------------------- activity identity */

/**
 * Emoji and colour per activity type, copied from the mobile app's own table
 * (mobile/src/design/activity.ts) so a chart of feeds is the same rose the
 * parent sees in their log.
 */
export const ACTIVITY = {
  feed: { emoji: "🤱", main: "#ff6b95", label: "Feed" },
  pump: { emoji: "🍼", main: "#3b82f6", label: "Pump" },
  sleep: { emoji: "😴", main: "#6366f1", label: "Sleep" },
  diaper: { emoji: "🩲", main: "#f59e0b", label: "Nappy" },
  shower: { emoji: "🚿", main: "#06b6d4", label: "Shower" },
  vitamin: { emoji: "💊", main: "#22c55e", label: "Vitamin" },
  nailcut: { emoji: "💅", main: "#8b5cf6", label: "Nail cut" },
  growth: { emoji: "📏", main: "#a855f7", label: "Growth" },
  health: { emoji: "🩺", main: "#f43f5e", label: "Health" },
  tummy: { emoji: "🤸", main: "#10b981", label: "Tummy time" },
  sunlight: { emoji: "☀️", main: "#eab308", label: "Sunlight" },
  bath: { emoji: "🛁", main: "#0ea5e9", label: "Bath" },
  massage: { emoji: "💆", main: "#ec4899", label: "Massage" },
  teeth: { emoji: "🪥", main: "#14b8a6", label: "Teeth" },
  walk: { emoji: "🚶", main: "#84cc16", label: "Walk" },
  medicine: { emoji: "💉", main: "#ef4444", label: "Medicine" },
  habit: { emoji: "⭐", main: "#f97316", label: "Habit" },
  // Not a log type — a reminder can also be a free-text one the caregiver named
  // themselves, and the reminders breakdown looks its type up in this table.
  custom: { emoji: "🔔", main: "#94a3b8", label: "Custom" },
};

const UNKNOWN_ACTIVITY = { emoji: "❓", main: "#9ca3af", label: "Other" };

export const activityTone = (type) => ACTIVITY[type] ?? { ...UNKNOWN_ACTIVITY, label: type };

/** The little emoji circle a baby is identified by everywhere in the app. */
export function babyAvatar(baby, size = 22) {
  return el("span", {
    class: "baby-avatar",
    text: baby.avatarEmoji || (baby.gender === "boy" ? "👦" : "👧"),
    style: {
      width: `${size}px`,
      height: `${size}px`,
      fontSize: `${Math.round(size * 0.55)}px`,
      background: baby.avatarColor ? `${baby.avatarColor}33` : "var(--accent-soft)",
    },
  });
}
