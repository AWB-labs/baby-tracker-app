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
import WelcomeScreen from "../screens/auth/WelcomeScreen";
import LoginScreen from "../screens/auth/LoginScreen";
import SignupScreen from "../screens/auth/SignupScreen";
import SetupBabyScreen from "../screens/auth/SetupBabyScreen";
import AppTabs from "./AppTabs";

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
};

export type AppStackParamList = {
  SetupBaby: undefined;
  Main: undefined;
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
      {/* Welcome first: the old landing screen asked for credentials before
          saying what the app was for. */}
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
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
        // Settings now lives inside the tabs as Account, so the app stack is
        // just the tab container.
        <AppStack.Screen name="Main" component={AppTabs} />
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
