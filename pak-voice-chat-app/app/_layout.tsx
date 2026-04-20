import React from "react";
import { Stack } from "expo-router";
import { AppTheme, Colors } from "../constants/theme";

export default function RootLayout() {
  const colors = Colors.dark;

  const { fontSize, fonts } = AppTheme;

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors?.card || "#0E2231",
        },
        headerTintColor: colors?.text || "#fff",
        headerTitleStyle: {
          fontWeight: "800",
          fontSize: fontSize?.md || 15,
          fontFamily: fonts?.sans || "system-ui",
        },
        headerShadowVisible: false,
        animation: "slide_from_right",
      }}
    >
      <Stack.Screen
        name="(tabs)"
        options={{
          headerShown: false,
        }}
      />

      <Stack.Screen
        name="chats"
        options={{
          title: "Chats",
          headerTitleAlign: "left",
        }}
      />

      <Stack.Screen
        name="settings"
        options={{
          title: "Settings",
          headerTitleAlign: "center",
        }}
      />

      <Stack.Screen
        name="chat/[conversationId]"
        options={{
          title: "Conversation",
          headerTitleAlign: "left",
        }}
      />
    </Stack>
  );
}