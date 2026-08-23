import { api } from "../api.js";
import { badge, barList, card, clear, el, emptyState, kpi } from "../ui.js";
import { decimal, num, percent, relative, dateTime } from "../format.js";

/** Stars as a glyph run, so a rating reads at a glance in a dense list. */
const starRun = (rating) => "★".repeat(rating) + "☆".repeat(5 - rating);

/**
 * A rating's tone. Anything at or below 2 is the reason this page exists, so
 * it is coloured for attention; 3 is lukewarm; 4-5 needs nothing drawn to it.
 */
function toneFor(rating) {
  if (rating <= 2) return "danger";
  if (rating === 3) return "warning";
  return "success";
}

export async function render(ctx) {
  let offset = 0;

  async function load() {
    const data = await api.feedback({ offset });
    ctx.setStamp(data.generatedAt);

    clear(ctx.actions).append(
      el("button", { class: "btn", text: "Refresh", onClick: ctx.reload })
    );

    const rated = data.ratedCount ?? 0;
    const unhappy = data.distribution
      .filter((d) => d.star <= 2)
      .reduce((sum, d) => sum + d.count, 0);

    const kpis = el(
      "div",
      { class: "grid grid-kpi" },
      kpi({
        label: "Average rating",
        value: data.averageRating == null ? "—" : decimal(data.averageRating, 1),
        foot: rated
          ? `across ${num(rated)} rating${rated === 1 ? "" : "s"}`
          : "nobody has rated yet",
      }),
      kpi({
        label: "Messages",
        value: num(data.total),
        foot: "sent from the in-app prompt",
      }),
      // The number worth acting on: how much of the feedback is unhappy.
      kpi({
        label: "2 stars or fewer",
        value: num(unhappy),
        tone: unhappy > 0 ? "accent" : undefined,
        foot: rated ? `${percent(unhappy, rated)} of ratings` : "nothing yet",
      })
    );

    // Highest star first, which is the order people read a rating breakdown in.
    const breakdown = barList(
      [...data.distribution].reverse().map((row) => ({
        label: starRun(row.star),
        count: row.count,
        star: row.star,
      })),
      {
        max: rated,
        colorFor: (item) =>
          item.star <= 2
            ? "var(--danger)"
            : item.star === 3
              ? "var(--warning)"
              : "var(--success)",
        formatValue: num,
      }
    );

    // A list rather than a table: the message is the point, and a paragraph
    // squeezed into a narrow cell beside five other columns is unreadable.
    const list = data.items.length
      ? el(
          "div",
          { class: "feedback-list" },
          data.items.map((item) =>
            el(
              "article",
              { class: "feedback-item" },
              el(
                "header",
                { class: "feedback-head" },
                item.rating != null
                  ? badge(starRun(item.rating), toneFor(item.rating))
                  : badge("note only"),
                el("span", {
                  class: "muted",
                  text: relative(item.createdAt),
                  title: dateTime(item.createdAt),
                })
              ),
              item.message
                ? el("p", { class: "feedback-body", text: item.message })
                : el("p", {
                    class: "feedback-body muted",
                    text: "No message — stars only.",
                  }),
              el(
                "footer",
                { class: "feedback-foot muted" },
                el("span", {
                  text: item.account
                    ? `${item.account.name} · ${item.account.email}`
                    : "Account deleted",
                }),
                (item.appVersion || item.platform) &&
                  el("span", {
                    text: [item.platform, item.appVersion]
                      .filter(Boolean)
                      .join(" "),
                  })
              )
            )
          )
        )
      : emptyState("Nobody has sent anything yet.");

    const pager = el(
      "div",
      { class: "row row-tight" },
      el("button", {
        class: "btn btn-ghost",
        text: "Newer",
        disabled: offset === 0,
        onClick: () => {
          offset = Math.max(0, offset - data.pageSize);
          load();
        },
      }),
      el("button", {
        class: "btn btn-ghost",
        text: "Older",
        disabled: offset + data.pageSize >= data.total,
        onClick: () => {
          offset += data.pageSize;
          load();
        },
      }),
      el("span", {
        class: "muted",
        text: `${offset + 1}–${Math.min(
          offset + data.pageSize,
          data.total
        )} of ${num(data.total)}`,
      })
    );

    clear(ctx.root).append(
      kpis,
      card({
        title: "How the stars fall",
        note: "Only entries that carried a rating.",
        body: rated ? breakdown : emptyState("No ratings yet."),
      }),
      card({
        title: "What people said",
        note: "Newest first.",
        actions: data.total > data.pageSize ? pager : null,
        body: list,
      })
    );
  }

  await load();
}
