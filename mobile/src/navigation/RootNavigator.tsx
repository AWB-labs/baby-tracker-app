import React, { useState } from "react";
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
import ParentProfileScreen from "../screens/auth/ParentProfileScreen";
import JoinOrCreateScreen from "../screens/auth/JoinOrCreateScreen";
import SetupBabyScreen from "../screens/auth/SetupBabyScreen";
import AppTabs from "./AppTabs";

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
};

export type AppStackParamList = {
  ParentProfile: undefined;
  JoinOrCreate: undefined;
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
  const { account } = useAuth();
  // Whether this session has said "I'm starting a new family" — only matters
  // for the create path. The join path never needs it: claiming an invite
  // populates `babies` directly, so the ordinary babies.length checks below
  // carry it the rest of the way into Main on their own.
  const [wantsToCreate, setWantsToCreate] = useState(false);

  if (loading) return <Splash />;

  /*
   * Onboarding order: who are you, then whose family this is, then who the
   * baby is.
   *
   * needsProfile is gated on having no babies as well as no relationship, so
   * it only ever catches a genuinely new account — everyone who signed up
   * before the question existed has a null relationship and must not be
   * dragged back through onboarding to answer it; Account has the same
   * picker for that.
   *
   * needsIntent follows the same shape: no babies yet, profile already
   * answered, and this session hasn't said "create" yet. Add Baby only makes
   * sense for someone actually starting a family — not for someone about to
   * gain access to a baby that already exists elsewhere — so this has to be
   * answered before Add Baby can be reached at all.
   */
  const needsProfile = babies.length === 0 && !account?.relation;
  const needsIntent = !needsProfile && babies.length === 0 && !wantsToCreate;

  return (
    <AppStack.Navigator screenOptions={{ headerShown: false }}>
      {needsProfile ? (
        <AppStack.Screen name="ParentProfile" component={ParentProfileScreen} />
      ) : needsIntent ? (
        <AppStack.Screen name="JoinOrCreate">
          {() => <JoinOrCreateScreen onCreate={() => setWantsToCreate(true)} />}
        </AppStack.Screen>
      ) : babies.length === 0 ? (
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
