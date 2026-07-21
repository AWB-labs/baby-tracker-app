import React from "react";
import { ActivityIndicator, View } from "react-native";
import {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  type Theme as NavTheme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { useAuth } from "../context/AuthContext";
import { useBaby } from "../context/BabyContext";
import { useThemeContext } from "../design/ThemeProvider";
import LoginScreen from "../screens/auth/LoginScreen";
import SignupScreen from "../screens/auth/SignupScreen";
import SetupBabyScreen from "../screens/auth/SetupBabyScreen";
import SettingsScreen from "../screens/SettingsScreen";
import AppTabs from "./AppTabs";

export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type AppStackParamList = {
  SetupBaby: undefined;
  Main: undefined;
  Settings: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();

function Splash() {
  const { theme } = useThemeContext();
  return (
    <View
      style={{
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: theme.bg,
      }}
    >
      <ActivityIndicator size="large" color={theme.accent} />
    </View>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
    </AuthStack.Navigator>
  );
}

function AppNavigator() {
  const { babies, loading } = useBaby();

  if (loading) return <Splash />;

  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      {babies.length === 0 ? (
        <AppStack.Screen name="SetupBaby" component={SetupBabyScreen} />
      ) : (
        <>
          <AppStack.Screen name="Main" component={AppTabs} />
          {/* Pushed rather than a tab: reachable from the Today header, and
              presented as a modal so dismissing returns you where you were. */}
          <AppStack.Screen
            name="Settings"
            component={SettingsScreen}
            options={{
              presentation: "modal",
              animation: "slide_from_bottom",
              // Swipe-down to dismiss. iOS gives it to modals for free; naming
              // it explicitly keeps the gesture and the grabber consistent, and
              // Android — which has no such gesture — relies on the close
              // button the screen draws instead.
              gestureEnabled: true,
              gestureDirection: "vertical",
            }}
          />
        </>
      )}
    </AppStack.Navigator>
  );
}

export default function RootNavigator() {
  const { token, loading } = useAuth();
  const { theme, isDark } = useThemeContext();

  // Navigation draws its own container background during transitions; without
  // this the screen flashes white when pushing in dark mode.
  const navTheme: NavTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: theme.bg,
      card: theme.surface,
      text: theme.text,
      border: theme.border,
      primary: theme.accent,
      notification: theme.danger,
    },
  };

  if (loading) return <Splash />;

  return (
    <NavigationContainer theme={navTheme}>
      {token ? <AppNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
