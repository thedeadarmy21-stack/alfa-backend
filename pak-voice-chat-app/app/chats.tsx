import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Animated,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { apiClient } from "../constants/api";
import { AppTheme } from "../constants/theme";

type ConversationItem = {
  conversation_id: number;
  created_at?: string;
  other_user_id: number;
  other_user_email: string;
  other_user_preferred_language?: string;
  other_user_preferred_voice_id?: string;
};

type LoggedInUser = {
  id: number;
  email: string;
};

function getInitials(email: string) {
  return String(email || "?").slice(0, 2).toUpperCase();
}

function getRandomPresenceLabel() {
  const states = ["online", "last seen recently", "available"];
  return states[Math.floor(Math.random() * states.length)];
}

export default function ChatsScreen() {
  const [isLoadingChats, setIsLoadingChats] = useState(true);
  const [screenMessage, setScreenMessage] = useState("");
  const [conversationList, setConversationList] = useState<ConversationItem[]>([]);
  const [newChatEmail, setNewChatEmail] = useState("");
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [currentUser, setCurrentUser] = useState<LoggedInUser | null>(null);

  const { colors, spacing, radius, fontSize, shadow, fonts } = AppTheme;

  async function getSavedToken() {
    return await AsyncStorage.getItem("token");
  }

  async function loadSavedUser() {
    const raw = await AsyncStorage.getItem("user");
    if (raw) {
      try {
        setCurrentUser(JSON.parse(raw));
      } catch {}
    }
  }

  async function handleLogout() {
    await AsyncStorage.removeItem("token");
    await AsyncStorage.removeItem("user");
    router.replace("/(tabs)");
  }

  async function loadConversations() {
    try {
      setIsLoadingChats(true);
      setScreenMessage("");

      const token = await getSavedToken();

      if (!token) {
        setScreenMessage("Token nahi mila. Dobara login karo.");
        return;
      }

const response = await apiClient.get("/conversations", {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

      setConversationList(response.data?.conversations || []);
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        "Chats load nahi hui";

      setScreenMessage(String(errorMessage));
    } finally {
      setIsLoadingChats(false);
    }
  }

  async function handleStartChat() {
    try {
      if (!newChatEmail.trim()) {
        setScreenMessage("Email required hai");
        return;
      }

      setIsCreatingChat(true);
      setScreenMessage("");

      const token = await getSavedToken();

      if (!token) {
        setScreenMessage("Token nahi mila. Dobara login karo.");
        return;
      }

const response = await apiClient.post(
  "/conversations",
  {
    member_email: newChatEmail.trim().toLowerCase(),
  },
  {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }
);

      const conversationId = response.data?.conversation_id;

      setNewChatEmail("");
      await loadConversations();

      if (conversationId) {
        router.push({
          pathname: "/chat/[conversationId]",
          params: {
            conversationId: String(conversationId),
            email: newChatEmail.trim().toLowerCase(),
          },
        });
      }
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        "Chat create nahi hui";

      setScreenMessage(String(errorMessage));
    } finally {
      setIsCreatingChat(false);
    }
  }

  function openChatConversation(item: ConversationItem) {
    router.push({
      pathname: "/chat/[conversationId]",
      params: {
        conversationId: String(item.conversation_id),
        email: item.other_user_email,
      },
    });
  }

  const sortedConversations = useMemo(() => {
    return [...conversationList].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [conversationList]);

  function renderConversationItem({ item, index }: { item: ConversationItem; index: number }) {
    const presence = getRandomPresenceLabel();

    return (
      <Animated.View
        style={[
          styles.chatRowAnimatedWrap,
          {
            opacity: 1,
            transform: [{ translateY: 0 }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.chatRow}
          onPress={() => openChatConversation(item)}
          activeOpacity={0.9}
        >
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{getInitials(item.other_user_email)}</Text>
          </View>

          <View style={styles.chatRowContent}>
            <View style={styles.chatTopLine}>
              <Text numberOfLines={1} style={styles.chatEmailText}>
                {item.other_user_email}
              </Text>
              <Text style={styles.chatTimeText}>now</Text>
            </View>

            <View style={styles.chatBottomLine}>
              <View style={styles.onlineDot} />
              <Text numberOfLines={1} style={styles.chatMetaText}>
                {presence}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  useEffect(() => {
    loadSavedUser();
    loadConversations();
  }, []);

  return (
    <View style={styles.screenContainer}>
      <View style={styles.topBar}>
        <View>
          <Text style={styles.screenTitle}>Chats</Text>
          <Text style={styles.topSubtitle}>
            {currentUser?.email || "Logged in"}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push("/settings")}
        >
          <Text style={styles.settingsButtonText}>Settings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.newChatCard}>
        <Text style={styles.cardTitle}>Start new chat</Text>

        <TextInput
          placeholder="Enter user email"
          placeholderTextColor="#7c8aa5"
          style={styles.emailInput}
          value={newChatEmail}
          onChangeText={setNewChatEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TouchableOpacity
          style={styles.createChatButton}
          onPress={handleStartChat}
          disabled={isCreatingChat}
        >
          <Text style={styles.createChatButtonText}>
            {isCreatingChat ? "Please wait..." : "Start Chat"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.listHeaderRow}>
        <Text style={styles.listHeaderText}>Recent chats</Text>

        <TouchableOpacity style={styles.refreshButton} onPress={loadConversations}>
          <Text style={styles.refreshButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {screenMessage ? (
        <Text style={styles.screenMessageText}>{screenMessage}</Text>
      ) : null}

      {isLoadingChats ? (
        <ActivityIndicator
          size="large"
          color="#25D366"
          style={{ marginTop: 30 }}
        />
      ) : (
        <FlatList
          data={sortedConversations}
          keyExtractor={(item) => String(item.conversation_id)}
          renderItem={({ item, index }) => renderConversationItem({ item, index })}
          contentContainerStyle={{ paddingBottom: 20 }}
          ListEmptyComponent={
            <Text style={styles.emptyStateText}>
  No chats yet. Start a new conversation above.
</Text>
          }
        />
      )}

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    backgroundColor: "#07111A",
    padding: 14,
    paddingTop: 56,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  screenTitle: {
    color: "#F7FBFF",
    fontSize: 22,
    fontWeight: "800",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  topSubtitle: {
    color: "#A9BBC8",
    fontSize: 13,
    marginTop: 4,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  settingsButton: {
    backgroundColor: "#0F1F2B",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  settingsButtonText: {
    color: "#F7FBFF",
    fontWeight: "700",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  newChatCard: {
    backgroundColor: "#0F1F2B",
    borderRadius: 24,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  cardTitle: {
    color: "#F7FBFF",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  emailInput: {
    backgroundColor: "#203442",
    color: "#F7FBFF",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    fontSize: 15,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  createChatButton: {
    backgroundColor: "#27D367",
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: "center",
  },
  createChatButtonText: {
    color: "#0C2617",
    fontWeight: "800",
    fontSize: 15,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  listHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  listHeaderText: {
    color: "#F7FBFF",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  refreshButton: {
    backgroundColor: "#132634",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  refreshButtonText: {
    color: "#A9BBC8",
    fontWeight: "700",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  chatRowAnimatedWrap: {
    marginBottom: 10,
  },
  chatRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0F1F2B",
    padding: 14,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  avatarCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#27D367",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: {
    color: "#0C2617",
    fontWeight: "800",
    fontSize: 15,
  },
  chatRowContent: {
    flex: 1,
  },
  chatTopLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatBottomLine: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  chatTimeText: {
    color: "#7C93A3",
    fontSize: 12,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#27D367",
    marginRight: 8,
  },
  chatEmailText: {
    color: "#F7FBFF",
    fontSize: 15,
    fontWeight: "700",
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  chatMetaText: {
    color: "#A9BBC8",
    fontSize: 13,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
  screenMessageText: {
    color: "#ffd6d6",
    textAlign: "center",
    marginBottom: 12,
  },
  emptyStateText: {
    color: "#7C93A3",
    textAlign: "center",
    marginTop: 40,
    fontSize: 15,
  },
  logoutButton: {
    backgroundColor: "#132634",
    paddingVertical: 15,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  logoutButtonText: {
    color: "#F7FBFF",
    fontWeight: "800",
    fontSize: 15,
    fontFamily: "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },
});