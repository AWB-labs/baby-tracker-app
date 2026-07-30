import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius } from "../design/tokens";
import { useUnits } from "../context/SettingsContext";
import { getMilkBalance, type MilkBalance as MilkBalanceData } from "../api/logs";
import { Text, Emoji } from "./ui";

interface Props {
  babyId: number;
  /** Bumped by the parent whenever a log was created or removed elsewhere. */
  refreshKey?: number;
}

/**
 * Pumped milk minus what's gone into bottles since — a running ledger, not a
 * stock with an expiry. Hidden entirely for a baby with no pump history at
 * all: a family that exclusively bottle-feeds formula would otherwise see
 * "0 ml available" forever, which is just noise, not information.
 */
export default function MilkBalance({ babyId, refreshKey = 0 }: Props) {
  const t = useTheme();
  const units = useUnits();
  const [balance, setBalance] = useState<MilkBalanceData | null>(null);

  const load = useCallback(async () => {
    try {
      setBalance(await getMilkBalance(babyId));
    } catch {
      // Stays as whatever it last showed rather than a broken row.
    }
  }, [babyId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (!balance || balance.pumpedMl <= 0) return null;

  // Can't have negative milk on hand — a family that's fed more than they've
  // logged pumping (formula top-ups, a stash from before this existed) just
  // reads as empty rather than a confusing negative number.
  const availableMl = Math.max(0, balance.balanceMl);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.accentSofter, borderColor: t.accentSoft },
      ]}
      accessible
      accessibilityLabel={`${units.formatVolume(availableMl)} of pumped milk available`}
    >
      <Emoji size={22}>🍼</Emoji>
      <View style={styles.textCol}>
        <Text variant="subheadStrong" style={{ color: t.accentText }}>
          {units.formatVolume(availableMl)} available
        </Text>
        <Text variant="caption" tone="subtle">
          Pumped milk left after bottles
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  textCol: { flex: 1, gap: 1 },
});
