import React, { useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, View } from "react-native";
import Constants from "expo-constants";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import { Sheet, Text, Input, Button } from "./ui";
import { sendFeedback } from "../api/feedback";
import { useToast } from "./Toast";

/**
 * The App Store listing. `action=write-review` opens straight on the review
 * composer rather than the product page, so the tap lands where the person
 * thought it would.
 */
const APP_STORE_ID = "6793272200";
const REVIEW_URL = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
/** Opens the App Store app directly instead of bouncing through Safari. */
const REVIEW_URL_NATIVE = `itms-apps://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;

const STARS = [1, 2, 3, 4, 5] as const;

interface Props {
  visible: boolean;
  /** Closed without going to the App Store. */
  onDismiss: () => void;
  /** They tapped through to write a review. */
  onRated: () => void;
}

/**
 * "How's it going?" — stars and a note, in one sheet.
 *
 * Deliberately *not* a sentiment gate. Every rating, one star or five, sees
 * the same two options: leave a review, or tell us what's missing. Sending
 * only the happy ones to the App Store is what App Review rejects prompts
 * for, and it would also mean never hearing the thing worth hearing.
 *
 * The stars are recorded for our own reading (see the admin dashboard), not
 * used to decide what this sheet offers.
 */
export default function RatePromptSheet({ visible, onDismiss, onRated }: Props) {
  const t = useTheme();
  const toast = useToast();

  const [rating, setRating] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const appVersion = Constants.expoConfig?.version ?? undefined;
  const trimmed = message.trim();
  const canSend = rating != null || trimmed.length > 0;

  const payload = () => ({
    rating: rating ?? undefined,
    message: trimmed || undefined,
    appVersion,
    platform: Platform.OS,
  });

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await sendFeedback(payload());
      toast.success("Thank you — that's landed with us.");
      onDismiss();
    } catch (err) {
      toast.showError(err);
    } finally {
      setSending(false);
    }
  };

  const handleReview = async () => {
    // Record whatever they gave us before leaving, but never let a failed
    // request block the trip to the App Store: the review is the thing they
    // asked for, and our copy of the stars is a nicety beside it.
    if (canSend) {
      try {
        await sendFeedback(payload());
      } catch {
        /* see above */
      }
    }
    try {
      const native = await Linking.canOpenURL(REVIEW_URL_NATIVE);
      await Linking.openURL(native ? REVIEW_URL_NATIVE : REVIEW_URL);
      onRated();
    } catch {
      toast.error("Couldn't open the App Store from here.");
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onDismiss}
      title="How's Baby Tracker going?"
      subtitle="However you answer, both options below stay open — tell us what's missing, leave a review, or both."
      footer={
        <>
          <Button
            label="Rate on the App Store"
            icon="sparkles"
            variant="primary"
            fullWidth
            onPress={handleReview}
            accessibilityHint="Opens the App Store review page"
          />
          <Button
            label={trimmed ? "Send this to us" : "Send"}
            variant="ghost"
            fullWidth
            loading={sending}
            disabled={!canSend}
            onPress={handleSend}
          />
        </>
      }
    >
      <View style={styles.starBlock}>
        <View
          style={styles.stars}
          accessibilityRole="radiogroup"
          accessibilityLabel="Rate Baby Tracker out of five"
        >
          {STARS.map((star) => {
            const on = rating != null && star <= rating;
            return (
              <Pressable
                key={star}
                onPress={() => setRating(star)}
                hitSlop={6}
                accessibilityRole="radio"
                accessibilityState={{ selected: rating === star }}
                accessibilityLabel={`${star} star${star === 1 ? "" : "s"}`}
                style={({ pressed }) => [
                  styles.star,
                  {
                    backgroundColor: on ? t.accentSofter : t.surfaceSunken,
                    borderColor: on ? t.accent : t.border,
                    transform: [{ scale: pressed ? 0.92 : 1 }],
                  },
                ]}
              >
                <Text style={[styles.starGlyph, { color: on ? t.accent : t.textSubtle }]}>
                  {on ? "★" : "☆"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text variant="caption" tone="subtle" center>
          {rating == null
            ? "Tap a star — or skip straight to telling us something."
            : RATING_REPLY[rating]}
        </Text>
      </View>

      <Input
        label="Need something the app doesn't do? Tell us"
        placeholder="A tracker we're missing, something that got in your way, anything at all."
        value={message}
        onChangeText={setMessage}
        multiline
        numberOfLines={4}
        maxLength={2000}
        helper="Goes straight to the people who build the app. We read every one."
      />
    </Sheet>
  );
}

/**
 * A word back, so tapping a star feels answered rather than swallowed. None
 * of these change what the sheet offers — they only acknowledge the tap.
 */
const RATING_REPLY: Record<number, string> = {
  1: "Sorry — that's not what we wanted. Tell us what went wrong below.",
  2: "Not good enough. What would have made it better?",
  3: "Fair enough. What's the thing that would move it up?",
  4: "Glad it's working. What's the last thing missing?",
  5: "That means a lot. Anything you'd still add?",
};

const styles = StyleSheet.create({
  starBlock: { gap: space.md, alignItems: "center" },
  stars: { flexDirection: "row", gap: space.sm },
  star: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // Not a Text variant: the glyph is a control, sized to fill its tile rather
  // than to sit in a paragraph.
  starGlyph: { fontSize: 26, lineHeight: 32 },
});
