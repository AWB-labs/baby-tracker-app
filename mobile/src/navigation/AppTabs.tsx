import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useThemeContext } from "../design/ThemeProvider";
import { TAB_EMOJI } from "../design/activity";
import { space, radius, tabBar, elevation } from "../design/tokens";
import { Text, Emoji } from "../components/ui";
import HomeScreen from "../screens/HomeScreen";
import LogScreen from "../screens/LogScreen";
import InsightsScreen from "../screens/InsightsScreen";
import HealthScreen from "../screens/HealthScreen";
import SettingsScreen from "../screens/SettingsScreen";
import RemindersScreen from "../screens/RemindersScreen";
import BagScreen from "../screens/BagScreen";
import LegalScreen from "../screens/LegalScreen";

/**
 * Five destinations, the platform maximum for a bottom bar.
 *
 * Activity is the entry timeline ("what happened"); Analytics merges growth and
 * activity trends ("how are things going"); Medical covers vaccines, illness
 * and medication; Account holds settings — in the bar rather than behind the
 * Today header, so it's reachable from anywhere and the header keeps its width
 * for the baby's name and age.
 */
export type TabParamList = {
  Today: undefined;
  /** Snapshot cards deep-link here with an activity filter pre-applied. */
  Activity: { filter?: string } | undefined;
  Analytics: undefined;
  Medical: undefined;
  Account: undefined;
};

export type AccountStackParamList = {
  AccountHome: undefined;
  Reminders: undefined;
  Bag: undefined;
  /** One screen, two documents — see screens/LegalScreen.tsx. */
  Legal: { doc: "privacy" | "terms" };
};

const Tab = createBottomTabNavigator<TabParamList>();
const AccountStack = createNativeStackNavigator<AccountStackParamList>();

/**
 * Account is a stack: settings stays the hub, and flows that deserve room —
 * reminders today, maybe exports tomorrow — push their own screen instead of
 * unfolding inline in the middle of the page.
 */
function AccountNavigator() {
  return (
    <AccountStack.Navigator screenOptions={{ headerShown: false }}>
      <AccountStack.Screen name="AccountHome" component={SettingsScreen} />
      <AccountStack.Screen name="Reminders" component={RemindersScreen} />
      <AccountStack.Screen name="Bag" component={BagScreen} />
      <AccountStack.Screen name="Legal" component={LegalScreen} />
    </AccountStack.Navigator>
  );
}

/**
 * A floating pill instead of an edge-to-edge bar. Content scrolls beneath it
 * (Screen reserves the clearance), and the detached shape gives the app a
 * lighter, more current feel without inventing any new navigation behaviour.
 */
function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { theme: t, isDark } = useThemeContext();

  return (
    <View
      pointerEvents="box-none"
      // Same inset below as at the sides — see tabBar.margin.
      style={[styles.wrap, { bottom: tabBar.margin }]}
    >
      <View
        style={[
          styles.pill,
          {
            backgroundColor: t.surface,
            borderColor: t.border,
            height: tabBar.height,
          },
          elevation(3, isDark),
        ]}
        accessibilityRole="tablist"
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const label =
            (descriptors[route.key].options.title as string) ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected: focused }}
              style={({ pressed }) => [
                styles.item,
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              {/* Website navigation is emoji-first; the pill and label carry
                  the active state so it never rests on colour alone. */}
              <View
                style={[
                  styles.iconPill,
                  focused && { backgroundColor: t.accentSoft },
                ]}
              >
                <Emoji size={focused ? 18 : 16} style={!focused && styles.dimmed}>
                  {TAB_EMOJI[route.name as keyof TabParamList]}
                </Emoji>
              </View>
              {/* The label always renders — icon-only navigation makes people
                  guess, and the active state must not rely on colour alone. */}
              <Text
                variant="caption"
                style={{ color: focused ? t.accentText : t.textSubtle }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Today" component={HomeScreen} />
      <Tab.Screen name="Activity" component={LogScreen} />
      <Tab.Screen name="Analytics" component={InsightsScreen} />
      <Tab.Screen name="Medical" component={HealthScreen} />
      <Tab.Screen name="Account" component={AccountNavigator} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: tabBar.margin,
  },
  pill: {
    flexDirection: "row",
    alignItems: "stretch",
    alignSelf: "stretch",
    maxWidth: 480,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.xs,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  iconPill: {
    minWidth: 44,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dimmed: { opacity: 0.55 },
});
