import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../design/ThemeProvider";
import { space, radius, PRESSED_OPACITY } from "../design/tokens";
import { Icon } from "../design/icons";
import {
  Screen,
  ScreenHeader,
  Text,
  IconButton,
  Input,
  Button,
  Sheet,
  EmptyState,
  SkeletonList,
  FadeInUp,
  ConfirmDialog,
} from "../components/ui";
import { useBaby } from "../context/BabyContext";
import { useToast } from "../components/Toast";
import {
  getBagItems,
  createBagItem,
  updateBagItem,
  deleteBagItem,
  type BagItem,
} from "../api/bag";

/**
 * What goes in the bag before you're out the door.
 *
 * One shared list per baby, not one per caregiver — whoever's packing should
 * see what another caregiver already checked off, the same way any of them
 * can see a feed the other one logged.
 */
export default function BagScreen() {
  const t = useTheme();
  const toast = useToast();
  const navigation = useNavigation();
  const { activeBaby } = useBaby();

  const [items, setItems] = useState<BagItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BagItem | null>(null);
  const [editingItem, setEditingItem] = useState<BagItem | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    if (!activeBaby) {
      setLoading(false);
      return;
    }
    try {
      setItems(await getBagItems(activeBaby.id));
    } catch (err) {
      toast.showError(err);
    } finally {
      setLoading(false);
    }
  }, [activeBaby, toast]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleAdd = async () => {
    const label = newLabel.trim();
    if (!label || !activeBaby) return;
    setAdding(true);
    try {
      const created = await createBagItem(activeBaby.id, label);
      setItems((prev) => [...prev, created]);
      setNewLabel("");
    } catch (err) {
      toast.showError(err);
    } finally {
      setAdding(false);
    }
  };

  // Optimistic, with a rollback — a packing checklist gets tapped in a hurry
  // on the way out the door, and waiting on a round trip per item would make
  // it feel like it dropped half the taps.
  const handleToggle = async (item: BagItem) => {
    const next = !item.checked;
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, checked: next } : i))
    );
    try {
      await updateBagItem(item.id, { checked: next });
    } catch (err) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, checked: item.checked } : i
        )
      );
      toast.showError(err);
    }
  };

  // Swaps this item's order with its neighbour's — a straight value swap, not
  // a renumber of the whole list, so it's the same one-PATCH-per-item shape
  // regardless of how many items there are or what their current values are.
  const moveItem = async (item: BagItem, dir: -1 | 1) => {
    const index = items.findIndex((i) => i.id === item.id);
    const targetIndex = index + dir;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;
    const target = items[targetIndex];

    const previous = items;
    setItems((prev) => {
      const next = [...prev];
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    try {
      await Promise.all([
        updateBagItem(item.id, { order: target.order }),
        updateBagItem(target.id, { order: item.order }),
      ]);
    } catch (err) {
      setItems(previous);
      toast.showError(err);
    }
  };

  const openEdit = (item: BagItem) => {
    setEditingItem(item);
    setEditLabel(item.label);
  };

  const closeEdit = () => {
    setEditingItem(null);
  };

  const handleSaveEdit = async () => {
    if (!editingItem) return;
    const label = editLabel.trim();
    if (!label) return;
    setSavingEdit(true);
    try {
      const updated = await updateBagItem(editingItem.id, { label });
      setItems((prev) =>
        prev.map((i) => (i.id === updated.id ? updated : i))
      );
      setEditingItem(null);
    } catch (err) {
      toast.showError(err);
    } finally {
      setSavingEdit(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    const previous = items;
    setItems((prev) => prev.filter((i) => i.id !== target.id));
    try {
      await deleteBagItem(target.id);
    } catch (err) {
      setItems(previous);
      toast.showError(err);
    }
  };

  const packedCount = items.filter((i) => i.checked).length;

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={styles.headerRow}>
        <IconButton
          icon="chevronLeft"
          label="Back to Account"
          variant="surface"
          onPress={() => navigation.goBack()}
        />
        <ScreenHeader
          title={activeBaby ? `${activeBaby.name}'s diaper bag` : "Diaper bag"}
          subtitle={
            activeBaby
              ? items.length > 0
                ? `${packedCount} of ${items.length} packed`
                : "Add what to bring before you're out the door"
              : undefined
          }
          style={styles.headerText}
        />
      </View>

      {loading ? (
        <SkeletonList rows={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="checkCircle"
          title="Nothing on the list yet"
          body="Add what needs to go in the bag — nappies, wipes, a spare outfit. Every caregiver sees the same list."
        />
      ) : (
        <View style={styles.list}>
          {items.map((item, index) => (
            <FadeInUp key={item.id} index={index}>
              <View
                style={[
                  styles.row,
                  { backgroundColor: t.surface, borderColor: t.border },
                ]}
              >
                <Pressable
                  onPress={() => handleToggle(item)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: item.checked }}
                  accessibilityLabel={`Mark ${item.label} as packed`}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <View
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: item.checked
                          ? t.success
                          : "transparent",
                        borderColor: item.checked ? t.success : t.borderStrong,
                      },
                    ]}
                  >
                    {item.checked && (
                      <Icon
                        name="check"
                        size="xs"
                        color={t.textInverse}
                        strokeWidth={3}
                      />
                    )}
                  </View>
                </Pressable>
                {/* The identity — the name itself — is what you'd tap to
                    rename; the checkbox next to it stays a dedicated target
                    so packing doesn't risk opening an edit form instead. */}
                <Pressable
                  onPress={() => openEdit(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.label}`}
                  style={({ pressed }) => [
                    styles.labelRow,
                    { opacity: pressed ? PRESSED_OPACITY : 1 },
                  ]}
                >
                  <Text
                    variant="body"
                    numberOfLines={1}
                    style={[
                      styles.label,
                      { color: item.checked ? t.textSubtle : t.text },
                      item.checked && styles.labelChecked,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
                <IconButton
                  icon="chevronUp"
                  label={`Move ${item.label} up`}
                  variant="ghost"
                  size="sm"
                  disabled={index === 0}
                  onPress={() => moveItem(item, -1)}
                />
                <IconButton
                  icon="chevronDown"
                  label={`Move ${item.label} down`}
                  variant="ghost"
                  size="sm"
                  disabled={index === items.length - 1}
                  onPress={() => moveItem(item, 1)}
                />
                <IconButton
                  icon="trash"
                  label={`Remove ${item.label}`}
                  variant="ghost"
                  size="sm"
                  onPress={() => setPendingDelete(item)}
                />
              </View>
            </FadeInUp>
          ))}
        </View>
      )}

      <View style={styles.addRow}>
        <Input
          label="Item"
          containerStyle={styles.flex}
          value={newLabel}
          onChangeText={setNewLabel}
          placeholder="Nappies, wipes, …"
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <Button
          label="Add"
          variant="primary"
          loading={adding}
          disabled={!newLabel.trim()}
          onPress={handleAdd}
        />
      </View>

      <ConfirmDialog
        visible={pendingDelete !== null}
        icon="trash"
        title="Remove this item?"
        message={
          pendingDelete
            ? `"${pendingDelete.label}" will be removed from the list for every caregiver.`
            : ""
        }
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <Sheet
        visible={editingItem !== null}
        onClose={closeEdit}
        title="Rename item"
        footer={
          <View style={styles.editActions}>
            <Button
              label="Cancel"
              variant="ghost"
              onPress={closeEdit}
              style={styles.flex}
            />
            <Button
              label="Save"
              variant="primary"
              loading={savingEdit}
              disabled={!editLabel.trim()}
              onPress={handleSaveEdit}
              style={styles.flex}
            />
          </View>
        }
      >
        <Input
          label="Item"
          value={editLabel}
          onChangeText={setEditLabel}
          maxLength={60}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSaveEdit}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headerRow: { flexDirection: "row", alignItems: "flex-start", gap: space.sm },
  headerText: { flex: 1 },
  list: { gap: space.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  labelRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  editActions: { flexDirection: "row", gap: space.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.md,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  label: { flex: 1 },
  labelChecked: { textDecorationLine: "line-through" },
  addRow: { flexDirection: "row", alignItems: "flex-end", gap: space.sm },
});
