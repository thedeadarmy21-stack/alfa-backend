import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { apiClient } from "../../constants/api";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { AppTheme } from "../../constants/theme";

export default function AuthHomeScreen() {
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [screenMessage, setScreenMessage] = useState("");

  const { colors, spacing, radius, fontSize, shadow, fonts } = AppTheme;

  async function handleAuthSubmit() {
    try {
      if (!email.trim() || !password.trim()) {
        setScreenMessage("Email aur password required hain");
        return;
      }

      setIsSubmitting(true);
      setScreenMessage("");

      const endpoint = isLoginMode ? "/auth/login" : "/auth/register";

      const response = await apiClient.post(endpoint, {
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });

      if (!response.data?.token) {
        setScreenMessage("Token nahi mila");
        return;
      }

      await AsyncStorage.setItem("token", response.data.token);
      await AsyncStorage.setItem(
        "user",
        JSON.stringify(response.data.user || {})
      );

      setScreenMessage(
        isLoginMode ? "Login successful" : "Register successful"
      );

      setTimeout(() => {
        router.replace("/chats");
      }, 500);
    } catch (error: any) {
      console.log("AUTH_SUBMIT_ERROR:", error?.response?.data || error.message);

      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        "Something went wrong";

      setScreenMessage(String(errorMessage));
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleAuthMode() {
    setIsLoginMode((prev) => !prev);
    setScreenMessage("");
  }

  return (
    <View style={styles.screenContainer}>
      <View style={styles.brandBlock}>
        <View style={styles.brandLogoOuter}>
          <View style={styles.brandLogoInner}>
            <View style={styles.brandSpark} />
            <Text style={styles.brandBadgeText}>A</Text>
          </View>
        </View>

        <Text style={styles.brandTitle}>Alfa</Text>
        <Text style={styles.brandSubtitle}>
          Smart multilingual voice and text conversations
        </Text>
      </View>

      <Text style={styles.screenTitle}>
        {isLoginMode ? "Welcome back" : "Create your account"}
      </Text>

      <TextInput
        placeholder="Enter your email"
        placeholderTextColor="#888"
        style={styles.inputField}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        placeholder="Enter your password"
        placeholderTextColor="#888"
        secureTextEntry
        style={styles.inputField}
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleAuthSubmit}
        disabled={isSubmitting}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting
            ? "Please wait..."
            : isLoginMode
            ? "Continue to chats"
            : "Create account"}
        </Text>
      </TouchableOpacity>

      {screenMessage ? (
        <Text style={styles.screenMessageText}>{screenMessage}</Text>
      ) : null}

      <TouchableOpacity onPress={toggleAuthMode}>
        <Text style={styles.switchModeText}>
          {isLoginMode
            ? "Don't have an account? Register"
            : "Already have an account? Login"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: "#07111A",
    justifyContent: "center",
    padding: 18,
  },
  brandBlock: {
    alignItems: "center",
    marginBottom: 26,
  },
  brandLogoOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(39, 211, 103, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  brandLogoInner: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#27D367",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  brandSpark: {
    position: "absolute",
    top: 10,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ffffff",
    opacity: 0.9,
  },
  brandBadgeText: {
    color: "#0C2617",
    fontSize: 32,
    fontWeight: "900",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    letterSpacing: 1,
  },
  brandTitle: {
    color: "#F7FBFF",
    fontSize: 30,
    fontWeight: "900",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    color: "#A9BBC8",
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    maxWidth: 300,
    lineHeight: 20,
  },
  screenTitle: {
    color: "#F7FBFF",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 18,
    textAlign: "center",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  inputField: {
    backgroundColor: "#203442",
    color: "#F7FBFF",
    padding: 16,
    borderRadius: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    fontSize: 15,
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  submitButton: {
    backgroundColor: "#27D367",
    padding: 16,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 8,
  },
  submitButtonText: {
    color: "#0C2617",
    fontWeight: "800",
    fontSize: 15,
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  screenMessageText: {
    color: "#A9BBC8",
    textAlign: "center",
    marginTop: 18,
    fontSize: 13,
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  switchModeText: {
    color: "#7C93A3",
    marginTop: 20,
    textAlign: "center",
    fontSize: 13,
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
});