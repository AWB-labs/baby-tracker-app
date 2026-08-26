import React from "react";
import {
  Activity,
  AlertCircle,
  BabyIcon,
  BarChart3,
  Bell,
  BellOff,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Copy,
  Droplet,
  Droplets,
  Eye,
  EyeOff,
  HelpCircle,
  Info,
  LogOut,
  Mail,
  Milk,
  Minus,
  Moon,
  MoreHorizontal,
  Palette,
  Pause,
  Pencil,
  Pill,
  Play,
  Plus,
  Redo2,
  Ruler,
  Scale,
  Scissors,
  Settings2,
  Share2,
  ShowerHead,
  Snowflake,
  Sparkles,
  Square,
  Stethoscope,
  Sun,
  SunMoon,
  Thermometer,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
  Utensils,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react-native";
import { iconSize, iconStroke } from "./tokens";

/**
 * One icon family, one stroke weight.
 *
 * The previous UI used emoji as structural icons. Emoji render differently on
 * every OS version, can't be recoloured for dark mode or theming, and are
 * announced verbatim by screen readers ("woman feeding baby medium-dark skin
 * tone"), which makes them unusable as controls.
 *
 * Emoji still appear where they are *content* rather than chrome — the picker
 * for a baby's avatar, for instance — which is a legitimate use.
 */

export type IconName =
  | "feed"
  | "pump"
  | "sleep"
  | "diaper"
  | "shower"
  | "vitamin"
  | "nailcut"
  | "growth"
  | "health"
  | "weight"
  | "height"
  | "temperature"
  | "cold"
  | "stomach"
  | "otherCondition"
  | "home"
  | "history"
  | "analytics"
  | "care"
  | "settings"
  | "play"
  | "pause"
  | "stop"
  | "plus"
  | "minus"
  | "check"
  | "checkCircle"
  | "close"
  | "edit"
  | "trash"
  | "chevronDown"
  | "chevronUp"
  | "chevronLeft"
  | "chevronRight"
  | "clock"
  | "calendar"
  | "bell"
  | "bellOff"
  | "users"
  | "userPlus"
  | "mail"
  | "palette"
  | "logout"
  | "alert"
  | "info"
  | "more"
  | "sun"
  | "moon"
  | "auto"
  | "reset"
  | "drop"
  | "eye"
  | "eyeOff"
  | "sparkles"
  | "timer"
  | "copy"
  | "share";

const ICONS: Record<IconName, LucideIcon> = {
  // Activities
  feed: Utensils,
  pump: Milk,
  sleep: Moon,
  diaper: Droplets,
  shower: ShowerHead,
  vitamin: Pill,
  nailcut: Scissors,
  growth: Ruler,
  health: Stethoscope,
  weight: Scale,
  height: Ruler,
  temperature: Thermometer,
  cold: Snowflake,
  stomach: Waves,
  otherCondition: HelpCircle,

  // Navigation
  home: BabyIcon,
  history: Calendar,
  analytics: BarChart3,
  care: TrendingUp,
  settings: Settings2,

  // Controls
  play: Play,
  pause: Pause,
  stop: Square,
  plus: Plus,
  minus: Minus,
  check: Check,
  checkCircle: CheckCircle2,
  close: X,
  edit: Pencil,
  trash: Trash2,
  chevronDown: ChevronDown,
  chevronUp: ChevronUp,
  chevronLeft: ChevronLeft,
  chevronRight: ChevronRight,
  clock: Clock,
  // Same glyph as the History tab, under the name a date control wants. Kept
  // separate so renaming either one doesn't silently change the other.
  calendar: Calendar,
  bell: Bell,
  bellOff: BellOff,
  users: Users,
  userPlus: UserPlus,
  mail: Mail,
  palette: Palette,
  logout: LogOut,
  alert: AlertCircle,
  info: Info,
  more: MoreHorizontal,
  sun: Sun,
  moon: Moon,
  auto: SunMoon,
  reset: Redo2,
  drop: Droplet,
  eye: Eye,
  eyeOff: EyeOff,
  sparkles: Sparkles,
  timer: Activity,
  copy: Copy,
  share: Share2,
};

export interface IconProps {
  name: IconName;
  size?: keyof typeof iconSize | number;
  color?: string;
  strokeWidth?: number;
  /**
   * Decorative icons sit next to a text label and must stay silent for screen
   * readers; a standalone icon control needs its own label instead.
   */
  label?: string;
}

export function Icon({
  name,
  size = "md",
  color,
  strokeWidth = iconStroke.regular,
  label,
}: IconProps) {
  const Component = ICONS[name];
  const resolved = typeof size === "number" ? size : iconSize[size];
  return (
    <Component
      size={resolved}
      color={color}
      strokeWidth={strokeWidth}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? "yes" : "no-hide-descendants"}
    />
  );
}

/* -------------------------------------------------------------------------- */
/* Shared UI vocabulary — one place, so every surface says things identically  */
/* -------------------------------------------------------------------------- */

/** Activity type -> icon. */
export const ACTIVITY_ICON: Record<string, IconName> = {
  feed: "feed",
  pump: "pump",
  sleep: "sleep",
  diaper: "diaper",
  shower: "shower",
  vitamin: "vitamin",
  nailcut: "nailcut",
  growth: "growth",
  health: "health",
};

export const ACTIVITY_LABEL: Record<string, string> = {
  feed: "Feed",
  pump: "Pump",
  sleep: "Sleep",
  diaper: "Nappy",
  shower: "Bath",
  vitamin: "Vitamin",
  nailcut: "Nails",
  growth: "Growth",
  health: "Health",
};

export const DIAPER_LABEL: Record<string, string> = {
  empty: "Clean",
  wet: "Wet",
  dirty: "Dirty",
  wet_and_dirty: "Both",
};

/** Health condition -> icon (replaces the emoji carried in the data layer). */
export const CONDITION_ICON: Record<string, IconName> = {
  fever: "temperature",
  cold: "cold",
  stomach: "stomach",
  other: "otherCondition",
};

/** Reminder type -> icon. Custom reminders get the clock. */
export const REMINDER_ICON: Record<string, IconName> = {
  feed: "feed",
  pump: "pump",
  sleep: "sleep",
  diaper: "diaper",
  shower: "shower",
  vitamin: "vitamin",
  nailcut: "nailcut",
  custom: "clock",
};
