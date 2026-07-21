# Design system contract

Every screen and component imports from here. Nothing invents its own colours,
spacing, radii or shadows. The visual language mirrors the web app
(toutistracker.vercel.app) so the two clients read as one product.

## Imports

```ts
import { useTheme, useThemeContext, useReduceMotion } from "../design/ThemeProvider";
import { space, radius, elevation, hitSlop, tabularNums, motion, DISABLED_OPACITY } from "../design/tokens";
import { useActivityTone, useActivityTones, ACTIVITY_LABEL, DIAPER_META,
         SIDE_EMOJI, MEASURE_EMOJI, CONDITION_META, REMINDER_EMOJI } from "../design/activity";
import { Icon } from "../design/icons";
import {
  Screen, ScreenHeader, SectionHeader, Card, PressableCard, Text, Emoji,
  Badge, Divider, Button, IconButton, Input, Field, Sheet, EmptyState,
  Chip, ChipRow, ChipWrap, Segmented, Skeleton, SkeletonList,
  FadeInUp, ConfirmDialog,
} from "../components/ui";
```

## Palette (`useTheme()`)

Surfaces `bg surface surfaceAlt surfaceSunken border borderStrong scrim`
Text `text textMuted textSubtle textInverse`
Accent `accent accentHover accentSoft accentSofter onAccent accentText`
Status `success successSoft successBorder` and the same triples for
`warning` `danger` `info`.

Light mode is the website's rose ramp: `bg` = `#fff5f7`, cards pure white,
`accent` = baby-400 `#ff6b95`, `accentText` = baby-600 `#e02060`.

## Rules

- **Never** hardcode a colour, `#hex`, spacing number or shadow. Use tokens.
  The only literals allowed are `"transparent"` and `StyleSheet.hairlineWidth`.
- **Never** use `<Text>` from react-native — use the `Text` primitive with a
  `variant` (`display title1 title2 title3 body bodyStrong callout subhead
  subheadStrong footnote caption overline`) and a `tone`
  (`default muted subtle accent danger success inverse`).
- Emoji are the product's iconography and go through `<Emoji>`, which hides
  them from screen readers unless given a `label`. Never put a bare emoji in a
  react-native `<Text>`.
- Every screen is wrapped in `<Screen>` (handles safe areas, the floating tab
  bar clearance, and pull-to-refresh) with a `<ScreenHeader>`.
- Interactive targets are ≥44pt. Icon-only controls **must** have a `label`.
  Selected states set `accessibilityState={{ selected }}` — colour alone is
  never the only signal.
- Loading uses `<SkeletonList>`, not a bare spinner. Empty uses `<EmptyState>`
  with a sentence saying what to do next. Destructive actions use
  `<ConfirmDialog>`.
- Buttons: `primary` (solid accent), `secondary` (tinted `accentSofter` fill
  with a 2px `borderStrong` border — the website's look), `ghost`, `danger`,
  `success`.
- List entrances use `<FadeInUp index={i}>`.
- Numbers that tick (timers, totals) use `tabular` on `Text`.
- Units always render through `useUnits()` from `../context/SettingsContext`
  (`formatWeight formatHeight formatVolume formatTemperature`, plus
  `parse*`/`toDisplay*` for inputs and the `weight height volume temperature`
  unit labels). Storage is always metric.
