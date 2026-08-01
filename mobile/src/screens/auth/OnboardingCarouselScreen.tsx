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
    emoji: "🍼",
    title: "You're all set",
    body: "A quick look at how Baby Tracker works — skip in any time.",
  },
  {
    emoji: "⏱️",
    title: "Feeds, pumps and naps are timed",
    body: "Tap Start to begin, tap Finish when it's over. A bottle works the same way — start it, and say how much when it's done.",
  },
  {
    emoji: "🩲",
    title: "Diaper changes log in one tap",
    body: "No timer needed — just pick wet, dirty, or both.",
  },
  {
    emoji: "🍼",
    title: "Milk supply, tracked for you",
    body: "Every pump adds to it, every bottle takes away. See what's on hand from Today, and correct it any time.",
  },
  {
    emoji: "⭐",
    title: "Add your own habits",
    body: "Vitamins, tummy time, bath — or anything you name. Choose which quick-log buttons show up on Today.",
  },
  {
    emoji: "📖",
    title: "Every entry, in one timeline",
    body: "The Activity tab holds your full history. Forgot to log something? Add or edit an entry after the fact.",
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
    body: "Set reminders for feeds, vitamins or anything else, on whatever schedule fits your week.",
  },
  {
    emoji: "🎒",
    title: "Pack smarter",
    body: "Keep a shared checklist of what goes in the bag, so nothing gets left behind on the way out the door.",
  },
  {
    emoji: "👤",
    title: "Make it yours",
    body: "Switch units, pick a theme, add more babies — it's all in Account. Ready to start tracking?",
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
