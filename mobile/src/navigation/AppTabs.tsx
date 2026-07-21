import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  createBottomTabNavigator,
  type BottomTabBarProps,
} from "@react-navigation/bottom-tabs";
import { useThemeContext } from "../design/ThemeProvider";
import { TAB_EMOJI } from "../design/activity";
import { space, radius, tabBar, elevation } from "../design/tokens";
import { Text, Emoji } from "../components/ui";
import HomeScreen from "../screens/HomeScreen";
import HistoryScreen from "../screens/HistoryScreen";
import AnalyticsScreen from "../screens/AnalyticsScreen";
import GrowthScreen from "../screens/GrowthScreen";
import HealthScreen from "../screens/HealthScreen";

/**
 * Five destinations, the platform maximum for a bottom bar. Settings lives
 * behind the Today header — it isn't a peer of the daily-use screens.
 */
export type TabParamList = {
  Today: undefined;
  History: undefined;
  Trends: undefined;
  Growth: undefined;
  Health: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

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
      <Tab.Screen name="History" component={HistoryScreen} />
      <Tab.Screen name="Trends" component={AnalyticsScreen} />
      <Tab.Screen name="Growth" component={GrowthScreen} />
      <Tab.Screen name="Health" component={HealthScreen} />
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
