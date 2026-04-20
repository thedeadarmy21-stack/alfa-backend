import React from "react";
import { Tabs } from "expo-router";
import { AppTheme, Colors } from "../../constants/theme";

export default function TabLayout() {
  const colors = Colors.dark;
  const { fonts, fontSize } = AppTheme;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: colors?.card || "#0E2231",
          borderTopColor: colors?.border || "#333",
          height: 64,
        },
        tabBarActiveTintColor: colors?.accent || "#27D367",
        tabBarInactiveTintColor: colors?.textMuted || "#888",
        tabBarLabelStyle: {
          fontFamily: fonts?.sans || "system-ui",
          fontSize: fontSize?.xs || 11,
          fontWeight: "700",
          marginBottom: 6,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
        }}
      />
    </Tabs>
  );
}