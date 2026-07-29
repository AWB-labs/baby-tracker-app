import React from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius, tabBar } from "../../design/tokens";
import { Text } from "./primitives";

export interface ScreenProps {
  children: React.ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /**
   * Renders the drag handle used on modally-presented screens. A sheet that
   * slides up from the bottom is dismissed by dragging it back down, and
   * without the grabber nothing on screen says so.
   */
  grabber?: boolean;
  /**
   * A modal covers the tab bar, so it must not reserve clearance for it —
   * otherwise the last section floats above a large empty gap.
   */
  presentation?: "tab" | "modal";
  /**
   * Drop the top safe-area padding so the first child can paint behind the
   * status bar — e.g. a full-bleed gradient header that supplies its own top
   * inset. Everything below still lays out normally.
   */
  bleedTop?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * The padding `Screen` puts on its scrolling content.
 *
 * Exported because a screen with too many rows to mount at once has to swap the
 * ScrollView for a virtualized list, and that list's content container must
 * carry exactly this chrome — the tab bar floats *above* the content, so the
 * clearance belongs to the content, not to the viewport. Deriving it here keeps
 * one definition instead of a second set of magic numbers that drifts.
 */
export function screenContentPadding(presentation: "tab" | "modal" = "tab") {
  return {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    // The tab bar floats above content, so a tab screen reserves the pill's
    // full footprint — its inset from the bottom edge plus its height — and
    // then a gap, otherwise the last row sits behind the chrome.
    paddingBottom:
      presentation === "modal"
        ? space.giant
        : tabBar.margin + tabBar.height + space.lg,
  };
}

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
  grabber = false,
  presentation = "tab",
  bleedTop = false,
  contentStyle,
}: ScreenProps) {
  const t = useTheme();
  const edges = bleedTop ? ([] as const) : (["top"] as const);
  const topPad = bleedTop ? { paddingTop: 0 } : null;

  const pad = screenContentPadding(presentation);

  const handle = grabber ? (
    <View style={styles.grabberWrap}>
      <View style={[styles.grabber, { backgroundColor: t.borderStrong }]} />
    </View>
  ) : null;

  const body = (
    <>
      {handle}
      {children}
    </>
  );

  if (!scroll) {
    return (
      <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: t.bg }]}>
        <View style={[styles.content, pad, topPad, contentStyle]}>
          {body}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor: t.bg }]}>
      <ScrollView
        contentContainerStyle={[styles.content, pad, topPad, contentStyle]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!refreshing}
              onRefresh={onRefresh}
              tintColor={t.accent}
              colors={[t.accent]}
              progressBackgroundColor={t.surface}
            />
          ) : undefined
        }
      >
        {body}
      </ScrollView>
    </SafeAreaView>
  );
}

export interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
  /**
   * Small line above the title. For secondary context that shouldn't compete
   * with the heading — and shouldn't be crammed into it, where a long phrase
   * would be truncated at 28pt.
   */
  overline?: string;
  /** Trailing controls, e.g. a baby switcher or settings button. */
  actions?: React.ReactNode;
  /** White text, for a header sitting on a coloured/gradient background. */
  light?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({
  title,
  subtitle,
  overline,
  actions,
  light = false,
  style,
}: ScreenHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <View style={styles.headerText}>
        {overline ? (
          <Text
            variant="subheadStrong"
            tone="accent"
            numberOfLines={1}
            style={light && { color: "rgba(255,255,255,0.92)" }}
          >
            {overline}
          </Text>
        ) : null}
        <Text
          variant="title1"
          accessibilityRole="header"
          numberOfLines={1}
          style={light && { color: "#ffffff" }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            variant="subhead"
            tone="subtle"
            numberOfLines={2}
            style={light && { color: "rgba(255,255,255,0.85)" }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? <View style={styles.headerActions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  // Padding lives in screenContentPadding() so a virtualized list can reuse it.
  content: { gap: space.lg },
  // Negative top margin pulls the handle up into the screen's own top padding,
  // so it sits at the very edge the way a sheet's does.
  grabberWrap: { alignItems: "center", marginTop: -space.xxs },
  grabber: { width: 40, height: 4, borderRadius: radius.pill },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
  },
  headerText: { flex: 1, gap: space.xxs },
  headerActions: { flexDirection: "row", alignItems: "center", gap: space.sm },
});
