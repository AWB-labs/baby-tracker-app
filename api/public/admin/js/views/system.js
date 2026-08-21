import { api } from "../api.js";
import {
  activityTone,
  badge,
  barList,
  card,
  clear,
  definitionList,
  el,
  kpi,
} from "../ui.js";
import { num, percent } from "../format.js";

export async function render(ctx) {
  const data = await api.system();
  ctx.setStamp(data.generatedAt);
  clear(ctx.actions).append(
    el("button", { class: "btn", text: "Refresh", onClick: ctx.reload })
  );

  const { invites, reminders, push, settings, content, hygiene } = data;
  const reminderTotal = reminders.enabled + reminders.disabled;

  const kpis = el(
    "div",
    { class: "grid grid-kpi" },
    kpi({
      label: "Reminders live",
      value: num(reminders.enabled),
      foot: `${num(reminders.disabled)} muted · ${num(reminderTotal)} set up`,
    }),
    kpi({
      label: "Devices registered",
      value: num(push.total),
      foot: `${num(settings.notificationsOn)} caregivers have notifications on`,
    }),
    kpi({
      label: "Invites waiting",
      value: num(invites.total),
      foot: `${num(invites.email)} by email · ${num(invites.link)} by link`,
    }),
    kpi({
      label: "Needs a look",
      value: num(hygiene.staleTimers + invites.expiredLinks + hygiene.expiredResets),
      tone: hygiene.staleTimers > 0 ? "accent" : undefined,
      foot: hygiene.staleTimers
        ? `${num(hygiene.staleTimers)} timer${hygiene.staleTimers === 1 ? "" : "s"} running over a day`
        : "nothing urgent",
    })
  );

  const configCard = card({
    title: "This deployment",
    body: definitionList([
      ["Build", el("span", { class: "mono", text: data.commit })],
      [
        "Reminder scheduler",
        el(
          "span",
          { class: "row row-tight" },
          badge(data.reminderMode, data.reminderMode === "inline" ? "info" : "accent"),
          data.reminderMode === "cron" && !data.cronConfigured
            ? badge("CRON_SECRET not set", "danger")
            : null
        ),
      ],
      [
        "Outbound email",
        data.mailConfigured
          ? badge("SMTP configured", "success")
          : badge("Not configured — password resets will fail", "warning"),
      ],
      [
        "Presence tracking",
        `${num(hygiene.accountsWithHeartbeat)} of ${num(hygiene.accountsTotal)} accounts seen since it began`,
      ],
    ]),
  });

  const hygieneCard = card({
    title: "Housekeeping",
    note: "None of these are errors — they're the states worth knowing about",
    body: definitionList([
      [
        "Timers running over a day",
        hygiene.staleTimers
          ? badge(num(hygiene.staleTimers), "warning")
          : badge("none", "success"),
      ],
      [
        "Expired share links",
        invites.expiredLinks
          ? badge(num(invites.expiredLinks), "warning")
          : badge("none", "success"),
      ],
      ["Reset codes outstanding", num(hygiene.outstandingResets)],
      ["Reset codes expired", num(hygiene.expiredResets)],
      [
        "Entries whose author left",
        el(
          "span",
          {},
          num(hygiene.orphanLogs),
          el("span", { class: "muted", text: " — kept with the baby by design" })
        ),
      ],
    ]),
  });

  const remindersCard = card({
    title: "Reminders by type",
    body: reminders.byType.length
      ? barList(
          reminders.byType.map((row) => {
            const tone = activityTone(row.key);
            return { ...row, label: tone.label, emoji: tone.emoji, color: tone.main };
          }),
          { colorFor: (item) => item.color, formatValue: num }
        )
      : el("p", { class: "muted", text: "No reminders set up yet." }),
  });

  const devicesCard = card({
    title: "Devices",
    note: "Push tokens, by platform",
    body: push.byPlatform.length
      ? barList(
          push.byPlatform.map((row) => ({
            ...row,
            label: row.key === "ios" ? "iOS" : row.key === "android" ? "Android" : row.key,
          })),
          { formatValue: num }
        )
      : el("p", { class: "muted", text: "No devices registered." }),
  });

  const prefsCard = card({
    title: "Preferences",
    note: "How caregivers have set the app up",
    body: definitionList([
      ...settings.unitSystem.map((row) => [
        row.key === "metric" ? "Metric units" : "Imperial units",
        `${num(row.count)} (${percent(row.count, hygiene.accountsTotal)})`,
      ]),
      [
        "Notifications",
        `${num(settings.notificationsOn)} on · ${num(settings.notificationsOff)} off`,
      ],
      ["Custom accent colour", num(settings.customThemeColor)],
    ]),
  });

  const contentCard = card({
    title: "What's been recorded",
    body: definitionList([
      ["Caregiver profiles", num(content.profiles)],
      [
        "Immunisation months",
        `${num(content.vaccinesGiven)} marked given, of ${num(content.vaccineRows)} touched`,
      ],
      [
        "Bag checklist items",
        `${num(content.bagChecked)} packed, of ${num(content.bagItems)}`,
      ],
    ]),
  });

  clear(ctx.root).append(
    kpis,
    el("div", { class: "section grid grid-2" }, configCard, hygieneCard),
    el("div", { class: "section grid grid-3" }, remindersCard, devicesCard, prefsCard),
    el("div", { class: "section" }, contentCard)
  );
}
