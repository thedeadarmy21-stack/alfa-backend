import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { AppTheme } from "../constants/theme";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "@/constants/api";

type ThemeMode = "dark" | "light";
type AppLanguage = "en" | "ur";

export default function SettingsScreen() {
  const [selectedTheme, setSelectedTheme] = useState<ThemeMode>("dark");
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>("en");

  const savePreferences = async (language: string) => {
    try {
      // 1. Backend save
      await apiClient.put("/users/me/preferences", {
        preferred_language: language,
      });

      // 2. Local save
      const userStr = await AsyncStorage.getItem("user");
      if (userStr) {
        const user = JSON.parse(userStr);
        user.preferred_language = language;
        await AsyncStorage.setItem("user", JSON.stringify(user));
      }

      console.log("Preferences saved");
    } catch (err) {
      console.error("Save preferences error:", err);
    }
  };

  const themeColors = useMemo(() => {
    if (selectedTheme === "light") {
      return {
        screenBg: "#F4F7FB",
        cardBg: "#FFFFFF",
        cardSoft: "#EEF3F8",
        text: "#0F172A",
        textSoft: "#475569",
        border: "rgba(15, 23, 42, 0.08)",
        accent: "#27D367",
        accentText: "#0C2617",
      };
    }

    return {
      screenBg: AppTheme.colors.bg,
      cardBg: AppTheme.colors.card,
      cardSoft: AppTheme.colors.cardSoft,
      text: AppTheme.colors.text,
      textSoft: AppTheme.colors.textSoft,
      border: AppTheme.colors.border,
      accent: AppTheme.colors.accent,
      accentText: AppTheme.colors.accentDark,
    };
  }, [selectedTheme]);

  function renderChoiceButton(
    label: string,
    active: boolean,
    onPress: () => void
  ) {
    return (
      <TouchableOpacity
        style={[
          styles.choiceButton,
          {
            backgroundColor: active
              ? themeColors.accent
              : themeColors.cardSoft,
            borderColor: active ? themeColors.accent : themeColors.border,
          },
        ]}
        onPress={onPress}
      >
        <Text
          style={[
            styles.choiceButtonText,
            {
              color: active ? themeColors.accentText : themeColors.text,
            },
          ]}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  function renderSection(
    title: string,
    icon: keyof typeof Ionicons.glyphMap,
    content: React.ReactNode
  ) {
    return (
      <View
        style={[
          styles.sectionCard,
          {
            backgroundColor: themeColors.cardBg,
            borderColor: themeColors.border,
          },
        ]}
      >
        <View style={styles.sectionHeader}>
          <View
            style={[
              styles.sectionIconWrap,
              { backgroundColor: themeColors.cardSoft },
            ]}
          >
            <Ionicons name={icon} size={18} color={themeColors.accent} />
          </View>
          <Text style={[styles.sectionTitle, { color: themeColors.text }]}>
            {title}
          </Text>
        </View>

        <View style={styles.sectionBody}>{content}</View>
      </View>
    );
  }

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: themeColors.screenBg }]}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: themeColors.cardBg,
              borderColor: themeColors.border,
            },
          ]}
        >
          <View style={styles.heroTopRow}>
            <TouchableOpacity
              style={[
                styles.backButton,
                { backgroundColor: themeColors.cardSoft },
              ]}
              onPress={() => router.back()}
            >
              <Ionicons
                name="arrow-back"
                size={20}
                color={themeColors.text}
              />
            </TouchableOpacity>

            <View
              style={[
                styles.logoCircleOuter,
                { backgroundColor: "rgba(39, 211, 103, 0.14)" },
              ]}
            >
              <View
                style={[
                  styles.logoCircleInner,
                  { backgroundColor: themeColors.accent },
                ]}
              >
                <Text
                  style={[
                    styles.logoText,
                    { color: themeColors.accentText },
                  ]}
                >
                  A
                </Text>
              </View>
            </View>
          </View>

          <Text style={[styles.heroTitle, { color: themeColors.text }]}>
            Alfa
          </Text>
          <Text style={[styles.heroSubtitle, { color: themeColors.textSoft }]}>
            Smart multilingual voice and text conversations
          </Text>
        </View>

        {renderSection(
          "App Theme",
          "color-palette-outline",
          <View style={styles.choiceRow}>
            {renderChoiceButton("Dark", selectedTheme === "dark", () =>
              setSelectedTheme("dark")
            )}
            {renderChoiceButton("Light", selectedTheme === "light", () =>
              setSelectedTheme("light")
            )}
          </View>
        )}

        {renderSection(
          "App Language",
          "language-outline",
          <View style={styles.choiceRow}>
            {renderChoiceButton("English", selectedLanguage === "en", () => {
              setSelectedLanguage("en");
              savePreferences("en");
            })}
            {renderChoiceButton("Urdu", selectedLanguage === "ur", () => {
              setSelectedLanguage("ur");
              savePreferences("ur");
            })}
          </View>
        )}

        {renderSection(
          "App Details",
          "information-circle-outline",
          <Text style={[styles.sectionParagraph, { color: themeColors.textSoft }]}>
            Alfa is a multilingual voice and text chat app. It allows users to
            send normal or translated messages, voice notes, images, and videos.
            The app is designed to make communication easy between people who
            prefer different languages in everyday conversations.
          </Text>
        )}

        {renderSection(
          "App Benefits",
          "sparkles-outline",
          <Text style={[styles.sectionParagraph, { color: themeColors.textSoft }]}>
            Alfa helps users communicate across language barriers, supports text
            and voice messaging, allows translation mode and normal mode, and
            makes personal chat more flexible with media sharing and multilingual
            conversation support.
          </Text>
        )}

        {renderSection(
          "Creator",
          "person-outline",
          <Text style={[styles.sectionParagraph, { color: themeColors.textSoft }]}>
            This app was created by Tariq Sarkar. Alfa was built to provide a
            modern chat experience with multilingual text, voice communication,
            translation support, and a clean user interface for real users.
          </Text>
        )}

        <View
          style={[
            styles.footerCard,
            {
              backgroundColor: themeColors.cardBg,
              borderColor: themeColors.border,
            },
          ]}
        >
          <Text style={[styles.footerText, { color: themeColors.textSoft }]}>
            Supported chat languages include English, Urdu, Sindhi, Pashto,
            Balochi, German, Hinglish, Spanish, and Chinese.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  heroCard: {
    borderRadius: 26,
    padding: 18,
    borderWidth: 1,
    marginBottom: 14,
  },
  heroTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  logoCircleOuter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  logoCircleInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: {
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 30,
    fontWeight: "900",
    marginBottom: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  sectionCard: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "800",
  },
  sectionBody: {
    marginTop: 2,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 10,
    flexWrap: "wrap",
  },
  choiceButton: {
    minWidth: 120,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceButtonText: {
    fontSize: 14,
    fontWeight: "800",
  },
  sectionParagraph: {
    fontSize: 14,
    lineHeight: 22,
  },
  footerCard: {
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    marginTop: 2,
  },
  footerText: {
    fontSize: 13,
    lineHeight: 20,
  },
});