# Admin dashboard

A read-only view of the service — who's using it, what they're recording, and
whether anything needs a person to look at it. It lives inside this API rather
than beside it: the JSON is served from `/admin/api`, the pages from `/admin`,
and both deploy with everything else.

## Signing in

    /admin

Credentials come from the `AdminUser` table, which is deliberately not the
caregivers' `Account` table. An admin has no baby, would otherwise show up in
every number the dashboard exists to report, and has no business being able to
sign in to the mobile app. Sessions last 12 hours against the app's 30 days.

Seed or reset the account:

```bash
npm run db:seed-admin --workspace=api
```

It upserts on the email, so running it again resets the password rather than
making a second admin. Override the defaults per run:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='…' npm run db:seed-admin --workspace=api
```

## What's in it

| Screen         | Answers                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| **Overview**   | Caregivers, active vs dormant, babies, entries, what gets logged, sharing |
| **Users**      | Every caregiver with their babies, when they were last active, what they wrote |
| **Babies**     | Every baby, its caregivers, how much is recorded, running timers          |
| **Engagement** | Activation, retention cohorts, stickiness, when in the day entries happen |
| **Live**       | Timers running right now, the newest entries across every family          |
| **System**     | Reminders, devices, invites, preferences, and the states worth a look     |

Nothing here writes to a family's data. An admin looking at numbers has no
reason to edit anyone's logs, and not building the ability means a leaked
dashboard session can only expose data, not damage it.

## "Active" means the last 36 hours

Not 24. A parent who logs the 2am feed and then the next night's 11pm one is
plainly still using the app, and a one-day window calls them dormant in
between. A day and a half spans one skipped day without stretching far enough
to keep a genuinely lapsed account looking alive.

Activity is the newest of four independent traces, because no single column
would be honest:

- **log** — wrote an entry (`ActivityLog.createdAt`, not `startTime`: a feed can
  be back-dated to this morning while the person typing it is here now)
- **timer** — has a running timer, or last touched one
- **seen** — made any authenticated request, so reading counts as using the app
  (`Account.lastSeenAt`, stamped by the auth middleware, throttled to one write
  per five minutes per account)
- **push** — the app registered or refreshed a notification token

`lastSeenAt` only started being recorded when this dashboard was built, so on
its own it would report the whole existing user base as dormant. The other
three cover the history. The System screen shows how much of the user base has
a heartbeat yet, so a low active count early on isn't mistaken for a drop.

## Environment

| Variable            | Needed | Notes                                                                     |
| ------------------- | ------ | ------------------------------------------------------------------------- |
| `ADMIN_JWT_SECRET`  | No     | Signs dashboard sessions. Falls back to `JWT_SECRET`; set it in production |
| `ADMIN_EMAIL`       | No     | Seed script only. Defaults to `admin@mail.com`                             |
| `ADMIN_PASSWORD`    | No     | Seed script only                                                           |
| `ADMIN_NAME`        | No     | Seed script only                                                           |

Admin tokens carry `typ: "admin"` and are checked for it, so the two session
kinds stay separate even where both fall back to the same secret: a caregiver
token can't open the dashboard, and an admin token is rejected by the app's own
routes rather than running with no account behind it.

## Connection pooling

Every screen asks a dozen or more unrelated questions at once. Supabase's
session-mode pooler allows fifteen connections for the whole project, so the
dashboard's queries go through `lib/adminPrisma.ts`, which caps them at five in
flight — module-level, because three admin tabs refreshing together are three
times the fan-out and it's the total the pooler counts. Queries past the limit
queue rather than fail.

The app's own routes keep the ungated client; they issue three parallel queries
at most and shouldn't wait behind a dashboard refresh.

Separately, give `DATABASE_URL` a `connection_limit` below whatever the pooler
allows. Prisma otherwise sizes its pool from the CPU count, which on a large
machine asks for more connections than exist:

    postgresql://…/postgres?connection_limit=8

## Front end

Plain ES modules under `public/admin`, no build step and no dependencies — the
charts are hand-drawn SVG. Colours come from the mobile app's own tokens
(`mobile/src/design/palette.ts`) so a chart of feeds is the same rose the parent
sees in their log. Edit a file and reload; there's nothing to compile.
