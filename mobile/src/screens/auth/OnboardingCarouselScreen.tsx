import React, { useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useTheme } from "../../design/ThemeProvider";
import { space, radius } from "../../design/tokens";
import { Screen, Text, Emoji, Button, screenContentPadding } from "../../components/ui";

/** Screen pads its content horizontally — the carousel must bleed past that
 *  to span the true device width, or each page's declared width (from
 *  useWindowDimensions) won't match the narrower scrollable viewport and
 *  paging misaligns. */
const SCREEN_INSET = screenContentPadding().paddingHorizontal;

interface Slide {
  emoji: string;
  title: string;
  body: string;
}

/**
 * One slide per feature area, using the same emoji that area uses everywhere
 * else in the app (tab bar, snapshot cards, settings rows) — so this reads as
 * a preview of the real thing, not a separate pitch.
 */
const SLIDES: Slide[] = [
  {
    emoji: "👋",
    title: "A quick tour",
    body: "Here's how Baby Tracker works, including what's new. Skip any time — it's in Account if you want it again.",
  },
  {
    emoji: "🏠",
    title: "Today, at a glance",
    body: "The top of Today shows the last feed, sleep, diaper and pump. Tap any of them to jump to that history.",
  },
  {
    emoji: "🤱",
    title: "Feeds are timed, left or right",
    body: "Tap L or R to start a breastfeed and switch sides mid-way. The bottle button times a bottle and asks how much when it's done.",
  },
  {
    emoji: "⏱️",
    title: "Pumps and sleep, the same way",
    body: "Start, pause, finish. Nudge the start time by a minute if you tapped late. Anyone else with access sees the timer running too.",
  },
  {
    emoji: "🩲",
    title: "Diaper changes log in one tap",
    body: "No timer — just pick wet, dirty, or both. Each change draws one from your diaper stock, so you know when to restock.",
  },
  {
    emoji: "🥣",
    title: "New: track her food",
    body: "Log meals like carrot + potato, rate how each food went, and flag a reaction. Foods shows everything tried, what she loved, and what to watch.",
  },
  {
    emoji: "⭐",
    title: "Habits and stock",
    body: "Vitamins, bath, tummy time — tap once a day; tap again to undo. Below that, milk on hand and diapers left, kept up to date for you.",
  },
  {
    emoji: "📖",
    title: "Every entry, in one timeline",
    body: "The Activity tab holds your full history. Forgot something? Add it after the fact, edit it, or swipe to delete.",
  },
  {
    emoji: "📊",
    title: "See the patterns",
    body: "Analytics breaks feeds, sleep and more down by day — including how naps split from night sleep.",
  },
  {
    emoji: "🩺",
    title: "Vaccines and illness, together",
    body: "The vaccine schedule unlocks month by month, and illness entries keep fever and medication front and center.",
  },
  {
    emoji: "🤝",
    title: "Bring in your caregivers",
    body: "Invite a partner, grandparent or nanny from Account → Caregivers. Everyone sees and adds to the same log.",
  },
  {
    emoji: "🔔",
    title: "Never miss a beat",
    body: "Set reminders at the times of day that fit your routine — feeds, vitamins, or anything else. They're in Account → Reminders.",
  },
  {
    emoji: "👤",
    title: "Make it yours",
    body: "Switch units, pick a theme, pack the diaper bag, add more babies — it's all in Account. Ready?",
  },
];

interface Props {
  onDone: () => void;
}

export default function OnboardingCarouselScreen({ onDone }: Props) {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;

  const goTo = (next: number) => {
    scrollRef.current?.scrollTo({ x: next * width, animated: true });
    setIndex(next);
  };

  const handleMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    setIndex(Math.max(0, Math.min(SLIDES.length - 1, next)));
  };

  return (
    <Screen scroll={false} contentStyle={styles.screenContent}>
      <View style={styles.topRow}>
        <Button label="Skip" variant="ghost" size="sm" onPress={onDone} />
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={handleMomentumEnd}
        style={[styles.flex, styles.bleed]}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={[styles.mark, { backgroundColor: t.accentSoft }]}>
              <Emoji size={48}>{slide.emoji}</Emoji>
            </View>
            <Text variant="display" center accessibilityRole="header">
              {slide.title}
            </Text>
            <Text variant="body" tone="muted" center style={styles.body}>
              {slide.body}
            </Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i === index ? t.accent : t.border,
                width: i === index ? 18 : 6,
              },
            ]}
          />
        ))}
      </View>

      <Button
        label={isLast ? "Start tracking" : "Next"}
        variant="primary"
        size="lg"
        fullWidth
        onPress={() => (isLast ? onDone() : goTo(index + 1))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenContent: { flex: 1, paddingBottom: space.xl },
  bleed: { marginHorizontal: -SCREEN_INSET },
  topRow: { flexDirection: "row", justifyContent: "flex-end" },
  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  mark: {
    width: 96,
    height: 96,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: space.md,
  },
  body: { maxWidth: 320 },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: space.xs,
    marginBottom: space.lg,
  },
  dot: { height: 6, borderRadius: radius.pill },
});
