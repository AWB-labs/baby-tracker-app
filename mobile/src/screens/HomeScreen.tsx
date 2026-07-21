import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { useBaby } from "../context/BabyContext";
import { useTheme } from "../theme";
import { useLogs } from "../hooks/useLogs";
import ActivityTimerCard from "../components/ActivityTimerCard";
import LogsList from "../components/LogsList";
import LastFeedBanner from "../components/LastFeedBanner";
import NailCutBanner from "../components/NailCutBanner";
import DailyActionButtons from "../components/DailyActionButtons";
import BabySwitcher from "../components/BabySwitcher";
import ManualEntryModal from "../components/ManualEntryModal";
import { ActivityType } from "../hooks/useTimer";

// Shower and vitamin are once-daily quick actions rendered by
// DailyActionButtons; nail cut is prompted by its own reminder banner.
const ACTIVITIES: ActivityType[] = ["pump", "feed", "sleep", "diaper"];

export default function HomeScreen() {
  const { account } = useAuth();
  const { activeBaby } = useBaby();
  const theme = useTheme();
  const { logs, loading, refresh, handleDelete } = useLogs(200);
  const [showManual, setShowManual] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-refresh every 15 seconds
  useEffect(() => {
    const id = setInterval(refresh, 15000);
    return () => clearInterval(id);
  }, [refresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  if (!activeBaby) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        <View style={styles.noBaby}>
          <Text style={styles.noBabyEmoji}>👶</Text>
          <Text style={styles.noBabyText}>No baby selected</Text>
          <BabySwitcher />
        </View>
      </SafeAreaView>
    );
  }

  const enteredByName = account?.name || "Unknown";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.appTitle}>Baby Tracker</Text>
            <Text style={styles.greeting}>
              Hi,{" "}
              <Text style={[styles.greetingName, { color: theme.primary }]}>
                {account?.name}
              </Text>{" "}
              👋
            </Text>
          </View>
          <BabySwitcher />
        </View>

        {/* Reminders */}
        <NailCutBanner
          babyId={activeBaby.id}
          logs={logs}
          enteredByName={enteredByName}
          onLogSaved={refresh}
        />
        <LastFeedBanner logs={logs} />

        {/* Timer cards */}
        <View style={styles.section}>
          {ACTIVITIES.map((type) => (
            <ActivityTimerCard
              key={`${type}-${activeBaby.id}`}
              type={type}
              babyId={activeBaby.id}
              babyName={activeBaby.name}
              enteredByName={enteredByName}
              onLogSaved={refresh}
            />
          ))}
          <DailyActionButtons
            babyId={activeBaby.id}
            logs={logs}
            enteredByName={enteredByName}
            onLogSaved={refresh}
          />
        </View>

        {/* Manual entry */}
        <TouchableOpacity
          style={[styles.manualBtn, { borderColor: theme.primary }]}
          onPress={() => setShowManual(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.manualBtnEmoji}>📝</Text>
          <Text style={[styles.manualBtnText, { color: theme.primary }]}>
            Add Manual Entry
          </Text>
        </TouchableOpacity>

        {/* Activity log */}
        <Text style={[styles.sectionTitle, { color: theme.primary }]}>
          ACTIVITY LOG
        </Text>
        {loading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : (
          <LogsList logs={logs} onDelete={handleDelete} onEdit={refresh} />
        )}
      </ScrollView>

      <ManualEntryModal
        visible={showManual}
        babyId={activeBaby.id}
        babyName={activeBaby.name}
        enteredByName={enteredByName}
        onSaved={refresh}
        onClose={() => setShowManual(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  appTitle: { fontSize: 22, fontWeight: "800", color: "#1a1a1a", marginBottom: 2 },
  greeting: { fontSize: 14, color: "#888" },
  greetingName: { fontWeight: "700" },
  section: { gap: 12, marginBottom: 16 },
  manualBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 2,
    borderStyle: "dashed",
    borderRadius: 18,
    paddingVertical: 14,
    marginBottom: 16,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  manualBtnEmoji: { fontSize: 18 },
  manualBtnText: { fontSize: 14, fontWeight: "700" },
  sectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.5,
    textAlign: "center",
    marginBottom: 12,
    textTransform: "uppercase",
  },
  loadingText: { textAlign: "center", color: "#ccc", fontSize: 14 },
  noBaby: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  noBabyEmoji: { fontSize: 48 },
  noBabyText: { fontSize: 16, color: "#aaa", marginBottom: 8 },
});
