import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import { useUnits } from "../context/SettingsContext";
import {
  getMilkBalance,
  setMilkBalance,
  type MilkBalance as MilkBalanceData,
} from "../api/logs";
import { Text, Emoji, Input, Button, Sheet } from "./ui";
import { useToast } from "./Toast";

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
 *
 * Tapping it opens a hand correction — the log-derived total is a good
 * default, but it can't know about a stash from before the app, or one lost
 * to a spill it was never told about.
 */
export default function MilkBalance({ babyId, refreshKey = 0 }: Props) {
  const t = useTheme();
  const units = useUnits();
  const toast = useToast();
  const [balance, setBalance] = useState<MilkBalanceData | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

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

  const openEdit = () => {
    setDraft(units.toDisplayVolume(availableMl));
    setEditing(true);
  };

  const handleSave = async () => {
    const ml = units.parseVolume(draft);
    if (isNaN(ml) || ml < 0) {
      toast.error(`Enter an amount in ${units.volume}, zero or more.`);
      return;
    }
    setSaving(true);
    try {
      setBalance(await setMilkBalance(babyId, ml));
      setEditing(false);
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Pressable
        onPress={openEdit}
        accessibilityRole="button"
        accessibilityLabel={`${units.formatVolume(availableMl)} of pumped milk available`}
        accessibilityHint="Correct this amount by hand"
        style={({ pressed }) => [
          styles.card,
          {
            backgroundColor: t.accentSofter,
            borderColor: t.accentSoft,
            opacity: pressed ? PRESSED_OPACITY : 1,
          },
        ]}
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
        <Icon name="edit" size="sm" color={t.textSubtle} />
      </Pressable>

      <Sheet
        visible={editing}
        onClose={() => setEditing(false)}
        title="Correct the balance"
        subtitle="Overrides the running total — future pumps and bottles still move it from here."
        footer={
          <View style={styles.formActions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={() => setEditing(false)}
              style={styles.flex}
            />
            <Button
              label="Save"
              variant="primary"
              loading={saving}
              onPress={handleSave}
              style={styles.flex}
            />
          </View>
        }
      >
        <Input
          label="Available"
          suffix={units.volume}
          value={draft}
          onChangeText={setDraft}
          keyboardType="decimal-pad"
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  textCol: { flex: 1, gap: 1 },
  formActions: { flexDirection: "row", gap: space.sm },
});
