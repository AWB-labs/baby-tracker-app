import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
  TextInput,
} from "react-native";
import { useBaby } from "../context/BabyContext";
import { useTheme } from "../theme";
import { useToast } from "./Toast";
import type { Baby } from "../api/auth";

export default function BabySwitcher() {
  const { babies, activeBaby, setActiveBaby, addBaby, refreshBabies } =
    useBaby();
  const theme = useTheme();
  const toast = useToast();
  const [visible, setVisible] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newGender, setNewGender] = useState<"girl" | "boy">("girl");
  const [saving, setSaving] = useState(false);

  const handleSelect = async (baby: Baby) => {
    await setActiveBaby(baby);
    setVisible(false);
  };

  const handleAdd = async () => {
    if (!newName.trim()) {
      toast.error("Enter a name for your baby.");
      return;
    }
    setSaving(true);
    try {
      const baby = await addBaby({ name: newName.trim(), gender: newGender });
      await setActiveBaby(baby);
      await refreshBabies();
      setShowAddForm(false);
      setNewName("");
      setNewGender("girl");
      setVisible(false);
    } catch (err) {
      toast.showError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.trigger, { borderColor: theme.primaryLight }]}
        onPress={() => setVisible(true)}
        activeOpacity={0.7}
      >
        {activeBaby?.avatarEmoji ? (
          <Text style={styles.triggerEmoji}>{activeBaby.avatarEmoji}</Text>
        ) : (
          <View
            style={[
              styles.dot,
              { backgroundColor: activeBaby?.avatarColor || theme.primary },
            ]}
          />
        )}
        <Text style={[styles.triggerText, { color: theme.primary }]}>
          {activeBaby?.name || "Select Baby"}
        </Text>
        <Text style={[styles.caret, { color: theme.primary }]}>▼</Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => {
            setVisible(false);
            setShowAddForm(false);
          }}
        >
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Select Baby</Text>

            <ScrollView>
              {babies.map((baby) => (
                <TouchableOpacity
                  key={baby.id}
                  style={[
                    styles.babyRow,
                    activeBaby?.id === baby.id && {
                      backgroundColor:
                        baby.gender === "girl" ? "#fff5f7" : "#f0f7ff",
                    },
                  ]}
                  onPress={() => handleSelect(baby)}
                  activeOpacity={0.7}
                >
                  {baby.avatarEmoji ? (
                    <Text style={styles.babyEmoji}>{baby.avatarEmoji}</Text>
                  ) : (
                    <View
                      style={[
                        styles.babyDot,
                        {
                          backgroundColor:
                            baby.avatarColor ||
                            (baby.gender === "girl" ? "#ff6b95" : "#4e9eff"),
                        },
                      ]}
                    />
                  )}
                  <Text style={styles.babyName}>{baby.name}</Text>
                  {!baby.avatarEmoji && (
                    <Text style={styles.babyGender}>
                      {baby.gender === "girl" ? "👧" : "👦"}
                    </Text>
                  )}
                  {activeBaby?.id === baby.id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}

              {!showAddForm && (
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => setShowAddForm(true)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.addBtnText}>➕ Add Baby</Text>
                </TouchableOpacity>
              )}

              {showAddForm && (
                <View style={styles.addForm}>
                  <Text style={styles.addFormTitle}>New Baby</Text>
                  <TextInput
                    style={styles.addInput}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Baby's name"
                    placeholderTextColor="#ccc"
                    autoFocus
                  />
                  <View style={styles.genderRow}>
                    {(["girl", "boy"] as const).map((g) => (
                      <TouchableOpacity
                        key={g}
                        style={[
                          styles.genderBtn,
                          newGender === g && {
                            backgroundColor:
                              g === "girl" ? "#ff6b95" : "#4e9eff",
                            borderColor: g === "girl" ? "#ff6b95" : "#4e9eff",
                          },
                        ]}
                        onPress={() => setNewGender(g)}
                        activeOpacity={0.8}
                      >
                        <Text>
                          {g === "girl" ? "👧 Girl" : "👦 Boy"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View style={styles.addFormBtns}>
                    <TouchableOpacity
                      style={styles.cancelBtn}
                      onPress={() => setShowAddForm(false)}
                    >
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.saveBtn,
                        {
                          backgroundColor:
                            newGender === "girl" ? "#ff6b95" : "#4e9eff",
                        },
                        saving && { opacity: 0.6 },
                      ]}
                      onPress={handleAdd}
                      disabled={saving}
                    >
                      <Text style={styles.saveBtnText}>
                        {saving ? "Adding..." : "Add"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  triggerEmoji: { fontSize: 15 },
  babyEmoji: { fontSize: 20, width: 22, textAlign: "center" },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1.5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: "#fff",
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  triggerText: { fontSize: 13, fontWeight: "700" },
  caret: { fontSize: 10 },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 20,
    maxHeight: 480,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    textAlign: "center",
    marginBottom: 16,
  },
  babyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    marginBottom: 4,
    gap: 10,
  },
  babyDot: { width: 10, height: 10, borderRadius: 5 },
  babyName: { flex: 1, fontSize: 15, fontWeight: "600", color: "#333" },
  babyGender: { fontSize: 18 },
  checkmark: { fontSize: 16, color: "#22c55e", fontWeight: "700" },
  addBtn: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#ddd",
    borderRadius: 12,
  },
  addBtnText: { fontSize: 14, color: "#aaa", fontWeight: "600" },
  addForm: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#f0f0f0" },
  addFormTitle: { fontSize: 13, fontWeight: "700", color: "#666", marginBottom: 10 },
  addInput: {
    borderWidth: 2,
    borderColor: "#ffe0e8",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#333",
    marginBottom: 12,
  },
  genderRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  genderBtn: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#eee",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  addFormBtns: { flexDirection: "row", gap: 8 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  cancelBtnText: { color: "#aaa", fontWeight: "600", fontSize: 14 },
  saveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: "center",
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
