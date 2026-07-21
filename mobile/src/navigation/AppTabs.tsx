import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import { useTheme } from "../theme";
import HomeScreen from "../screens/HomeScreen";
import HistoryScreen from "../screens/HistoryScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import GrowthScreen from "../screens/GrowthScreen";
import HealthScreen from "../screens/HealthScreen";
import SettingsScreen from "../screens/SettingsScreen";

export type TabParamList = {
  Home: undefined;
  History: undefined;
  Analytics: undefined;
  Growth: undefined;
  Health: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  const icons: Record<string, string> = {
    Home: "🏠",
    History: "📅",
    Analytics: "📊",
    Growth: "📏",
    Health: "🩺",
    Settings: "⚙️",
  };
  return (
    <Text style={{ fontSize: focused ? 22 : 20, opacity: focused ? 1 : 0.5 }}>
      {icons[label] || "•"}
    </Text>
  );
}

export default function AppTabs() {
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: "#aaa",
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor: theme.primaryLight,
          borderTopWidth: 1,
          paddingBottom: 4,
          height: 60,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Growth" component={GrowthScreen} />
      <Tab.Screen name="Health" component={HealthScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}
