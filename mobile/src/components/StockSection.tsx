import React from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { useActivityTone } from "../design/activity";
import { space } from "../design/tokens";
import { Icon } from "../design/icons";
import { PressableCard, SectionHeader, Text, Emoji } from "./ui";
import { useUnits } from "../context/SettingsContext";
import type { MilkBalance } from "../api/logs";

/** Matches the snapshot's low-stock banner threshold — the two should start
 *  worrying at the same number. */
const LOW_STOCK_AT = 6;

interface Props {
  /** Nappies on hand; null while unknown. */
  diaperCount: number | null;
  /** The size the baby is in, or null before anyone has said. */
  diaperSize: string | null;
  onOpenDiaperStock: () => void;
  /** Pumped minus bottled, plus corrections; null while unknown. */
  milkBalance: MilkBalance | null;
  onOpenMilkBalance: () => void;
}

/**
 * What the household has on hand — nappies and pumped milk — as its own
 * section under the habits, now that the snapshot's fourth card belongs to
 * pumping. Two doors, one per pile: each opens the sheet that corrects or
 * restocks it.
 */
export default function StockSection({
  diaperCount,
  diaperSize,
  onOpenDiaperStock,
  milkBalance,
  onOpenMilkBalance,
}: Props) {
  const t = useTheme();
  const units = useUnits();
  const diaperTone = useActivityTone("diaper");
  const pumpTone = useActivityTone("pump");

  const diaperValue =
    diaperCount == null
      ? "—"
      : diaperCount > 0
        ? `${diaperCount} left`
        : "Out of stock";
  // The same escalation the snapshot banner uses, so the two never disagree
  // about whether the pile is fine.
  const diaperColor =
    diaperCount == null
      ? t.text
      : diaperCount === 0
        ? t.danger
        : diaperCount <= LOW_STOCK_AT
          ? t.warning
          : t.text;

  // Floored at zero for display: a negative balance means more was bottled
  // than pumped, and "-40 ml in the fridge" is a bookkeeping artifact, not a
  // fact about the fridge. The correction sheet shows the real number.
  const milkValue =
    milkBalance == null
      ? "—"
      : units.formatVolume(Math.max(0, milkBalance.balanceMl));

  return (
    <View style={styles.section}>
      <SectionHeader title="Stock" />
      <View style={styles.row}>
        <PressableCard
          onPress={onOpenDiaperStock}
          accessibilityLabel={
            diaperCount == null
              ? "Diaper stock. Opens the diaper stock sheet."
              : `${diaperCount} diapers in stock${
                  diaperSize ? `, size ${diaperSize}` : ""
                }. Opens the diaper stock sheet.`
          }
          style={styles.card}
        >
          <View style={styles.top}>
            <View style={styles.labelRow}>
              <Emoji size={14}>{diaperTone.emoji}</Emoji>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                Diapers
              </Text>
            </View>
            <Icon name="edit" size="xs" color={t.textSubtle} />
          </View>
          <Text
            variant="title3"
            tabular
            numberOfLines={1}
            style={{ color: diaperColor }}
          >
            {diaperValue}
          </Text>
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            {diaperSize ? `Size ${diaperSize} · tap to restock` : "Tap to restock"}
          </Text>
        </PressableCard>

        <PressableCard
          onPress={onOpenMilkBalance}
          accessibilityLabel={
            milkBalance == null
              ? "Pumped milk stock. Opens the milk supply sheet."
              : `${milkValue} of pumped milk available. Opens the milk supply sheet to correct it.`
          }
          style={styles.card}
        >
          <View style={styles.top}>
            <View style={styles.labelRow}>
              <Emoji size={14}>{pumpTone.emoji}</Emoji>
              <Text variant="caption" tone="muted" numberOfLines={1}>
                Pumped milk
              </Text>
            </View>
            <Icon name="edit" size="xs" color={t.textSubtle} />
          </View>
          <Text
            variant="title3"
            tabular
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{ color: pumpTone.text }}
          >
            {milkValue}
          </Text>
          <Text variant="caption" tone="subtle" numberOfLines={1}>
            Tap to adjust
          </Text>
        </PressableCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space.sm },
  row: { flexDirection: "row", gap: space.md },
  // Mirrors the snapshot cards' proportions so the two grids read as kin.
  card: {
    flex: 1,
    padding: space.md,
    gap: space.xxs,
    minHeight: 84,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    flexShrink: 1,
  },
});
