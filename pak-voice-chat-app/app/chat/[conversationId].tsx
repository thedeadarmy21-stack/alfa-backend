import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Animated,
  Modal,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  useWindowDimensions,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient, API_BASE_URL } from "../../constants/api";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { fetch as expoFetch } from "expo/fetch";
import { File } from "expo-file-system";
import {
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";

type AppLanguage =
  | "en"
  | "ur"
  | "sd"
  | "ps"
  | "bal"
  | "de"
  | "hinglish"
  | "es"
  | "zh";

type MessageItem = {
  id: number;
  conversation_id: number;
  sender_id: number;
  type: string;
  original_lang: string;
  original_audio_url?: string | null;
  status: string;
  created_at?: string;
  text_body?: string | null;
};

type MessageOutputItem = {
  id: number;
  message_id: number;
  receiver_id: number;
  target_lang: string;
  tts_voice_id?: string;
  translated_text?: string | null;
  tts_audio_url?: string | null;
  status: string;
  created_at?: string;
};

type MessageOutputMap = {
  [messageId: number]: MessageOutputItem;
};

type LoggedInUser = {
  id: number;
  email: string;
  preferred_language?: AppLanguage;
  preferred_voice_id?: string;
};

function formatLanguageLabel(language: AppLanguage) {
  if (language === "en") return "English";
  if (language === "ur") return "Urdu";
  if (language === "sd") return "Sindhi";
  if (language === "ps") return "Pashto";
  if (language === "bal") return "Balochi";
  if (language === "de") return "German";
  if (language === "hinglish") return "Hinglish";
  if (language === "es") return "Spanish";
  if (language === "zh") return "Chinese";
  return language;
}

function getEmailInitials(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "U";
  return clean.slice(0, 2).toUpperCase();
}

function formatRecordingTime(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

// ============================================
// Audio Player Component
// ============================================

type AudioMessagePlayerProps = {
  uri: string;
  isWeb: boolean;
  onAudioError?: (message: string) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
};

function AudioMessagePlayer({
  uri,
  isWeb,
  onAudioError,
  onPlay,
  onPause,
  onEnd,
}: AudioMessagePlayerProps) {
  const [webAudioSrc, setWebAudioSrc] = useState<string>("");
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const soundRef = useRef<any>(null);

  useEffect(() => {
    let objectUrl = "";
    let isMounted = true;

    async function loadWebAudio() {
      if (!isWeb || !uri) return;

      try {
        setIsLoadingAudio(true);

        const response = await apiClient.get(uri, {
          responseType: "blob",
        });

        objectUrl = URL.createObjectURL(response.data);

        if (isMounted) {
          setWebAudioSrc(objectUrl);
        }
      } catch (error) {
        console.log("WEB_AUDIO_LOAD_ERROR:", error);
        if (isMounted && onAudioError) {
          onAudioError("Audio load nahi hui");
        }
      } finally {
        if (isMounted) {
          setIsLoadingAudio(false);
        }
      }
    }

    loadWebAudio();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, [uri, isWeb, onAudioError]);

  if (!uri) return null;

  if (isWeb) {
    if (isLoadingAudio || !webAudioSrc) {
      return (
        <View style={styles.audioLoadingWrap}>
          <Text style={styles.audioLoadingText}>Loading audio...</Text>
        </View>
      );
    }

    return React.createElement("audio", {
      controls: true,
      preload: "metadata",
      src: webAudioSrc,
      style: { width: "100%", height: 40, borderRadius: 10 },
      onPlay: onPlay,
      onPause: onPause,
      onEnded: onEnd,
    });
  }

  return (
    <TouchableOpacity
      style={styles.nativeAudioButton}
      onPress={async () => {
        try {
          if (onPlay) onPlay();
          const { sound } = await Audio.Sound.createAsync(
            { uri },
            { shouldPlay: true }
          );
          soundRef.current = sound;
          sound.setOnPlaybackStatusUpdate((status) => {
            if ("didJustFinish" in status && status.didJustFinish) {
              if (onEnd) onEnd();
              sound.unloadAsync();
              soundRef.current = null;
            }
          });
          await sound.playAsync();
        } catch (error) {
          if (onPause) onPause();
          console.log("AUDIO_PLAY_ERROR:", error);
          if (onAudioError) {
            onAudioError("Audio play nahi hui");
          }
        }
      }}
    >
      <Text style={styles.nativeAudioButtonText}>Play Audio</Text>
    </TouchableOpacity>
  );
}

function ChatImagePreview({ uri }: { uri: string }) {
  return (
    <View style={styles.mediaPreviewWrap}>
      <Image
        source={{ uri }}
        style={styles.nativeImagePreview}
        contentFit="cover"
        transition={200}
      />
    </View>
  );
}

function ChatVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (playerInstance) => {
    playerInstance.loop = false;
  });

  return (
    <View style={styles.mediaPreviewWrap}>
      <VideoView
        player={player}
        style={styles.nativeVideoPreview}
        nativeControls
      />
    </View>
  );
}

// ============================================
// MAIN COMPONENT
// ============================================

export default function ChatConversationScreen() {
  const { conversationId, email } = useLocalSearchParams();

  const flatListRef = useRef<FlatList>(null);
  const micScale = useRef(new Animated.Value(1)).current;
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousMessageCountRef = useRef(0);

  const [isLoadingMessages, setIsLoadingMessages] = useState(true);
  const [screenMessage, setScreenMessage] = useState("");
  const [messageList, setMessageList] = useState<MessageItem[]>([]);
  const [messageOutputMap, setMessageOutputMap] = useState<MessageOutputMap>({});
  const [textMessage, setTextMessage] = useState("");
  const [isSendingText, setIsSendingText] = useState(false);
  const [isSendingVoice, setIsSendingVoice] = useState(false);
  const [isSendingMedia, setIsSendingMedia] = useState(false);
  const [loggedInUser, setLoggedInUser] = useState<LoggedInUser | null>(null);
  const [selectedSourceLanguage, setSelectedSourceLanguage] =
    useState<AppLanguage>("en");
  const [selectedTargetLanguage, setSelectedTargetLanguage] =
    useState<AppLanguage>("en");
  const [isTranslateMode, setIsTranslateMode] = useState(true);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [activeLanguagePicker, setActiveLanguagePicker] = useState<
    "source" | "target"
  >("source");
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(audioRecorder);

  function getConversationIdAsNumber() {
    return Number(conversationId);
  }

  function scrollToBottom(animated = true) {
    setTimeout(() => {
      flatListRef.current?.scrollToEnd?.({ animated });
    }, 180);
  }

  function getFullAudioUrl(path?: string | null) {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    return `${API_BASE_URL}${path}`;
  }

  async function sendRecordedAudioFromMobile(params: {
    recordedUri: string;
    token: string;
    conversationId: number;
    originalLang: string;
    targetLang: string;
  }) {
    const { recordedUri, token, conversationId, originalLang, targetLang } =
      params;

    const formData = new FormData();
    formData.append("conversation_id", String(conversationId));
    formData.append("original_lang", originalLang);
    formData.append("target_lang", targetLang);

    const audioFile = new File(recordedUri);
    formData.append("audio", audioFile);

    const response = await expoFetch(`${API_BASE_URL}/messages/voice`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const text = await response.text();

    console.log("MOBILE_UPLOAD_STATUS:", response.status);
    console.log("MOBILE_UPLOAD_BODY:", text);

    if (!response.ok) {
      throw new Error(text || "VOICE_UPLOAD_FAILED");
    }

    return response;
  }

  async function sendMediaFromMobile(params: {
    assetUri: string;
    token: string;
    conversationId: number;
    mediaType: "image" | "video";
  }) {
    const { assetUri, token, conversationId, mediaType } = params;

    const formData = new FormData();
    formData.append("conversation_id", String(conversationId));
    formData.append("type", mediaType);

    const mediaFile = new File(assetUri);
    formData.append("media", mediaFile);

    const response = await expoFetch(`${API_BASE_URL}/messages/media`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const text = await response.text();

    console.log("MOBILE_MEDIA_UPLOAD_STATUS:", response.status);
    console.log("MOBILE_MEDIA_UPLOAD_BODY:", text);

    if (!response.ok) {
      throw new Error(text || "MEDIA_UPLOAD_FAILED");
    }

    return response;
  }

  function getEffectiveSourceLanguage(): AppLanguage {
    return selectedSourceLanguage || "en";
  }

  function getEffectiveTargetLanguage(): AppLanguage {
    if (!isTranslateMode) {
      return getEffectiveSourceLanguage();
    }
    return selectedTargetLanguage || selectedSourceLanguage || "en";
  }

  function shouldShowOutput(
    item: MessageItem,
    output?: MessageOutputItem | null
  ) {
    if (!output) return false;
    if (!isTranslateMode && output.target_lang === item.original_lang) {
      return false;
    }
    if (output.target_lang === item.original_lang && item.type === "text") {
      return false;
    }
    return true;
  }

  async function getSavedAuthToken() {
    return await AsyncStorage.getItem("token");
  }

  async function getSavedLoggedInUser(): Promise<LoggedInUser | null> {
    const rawUser = await AsyncStorage.getItem("user");
    return rawUser ? JSON.parse(rawUser) : null;
  }

  async function loadMessagesForConversation(showLoading = true) {
    try {
      if (showLoading) setIsLoadingMessages(true);
      setScreenMessage("");

      const token = await getSavedAuthToken();
      if (!token) {
        setScreenMessage("Token nahi mila. Dobara login karo.");
        return;
      }

      const response = await apiClient.get(
        `/messages/with-outputs?conversation_id=${getConversationIdAsNumber()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const nextMessages: MessageItem[] = response.data?.messages || [];
      const nextOutputs: MessageOutputItem[] = response.data?.outputs || [];

      setMessageList(nextMessages);

      const nextOutputMap: MessageOutputMap = {};
      for (const output of nextOutputs) {
        nextOutputMap[output.message_id] = output;
      }
      setMessageOutputMap(nextOutputMap);

      const hasNewMessages = nextMessages.length > previousMessageCountRef.current;

      if (showLoading) {
        scrollToBottom(true);
      } else if (hasNewMessages && shouldAutoScrollRef.current) {
        scrollToBottom(true);
      }

      previousMessageCountRef.current = nextMessages.length;
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        "Messages load nahi hui";
      setScreenMessage(String(errorMessage));
    } finally {
      setIsLoadingMessages(false);
    }
  }

  async function loadDefaults() {
    const user = await getSavedLoggedInUser();
    setLoggedInUser(user);

    if (user?.preferred_language) {
      setSelectedSourceLanguage(user.preferred_language);

      if (!isTranslateMode) {
        setSelectedTargetLanguage(user.preferred_language);
      } else {
        setSelectedTargetLanguage((prev) =>
          prev || user.preferred_language || "en"
        );
      }
    }
  }

  function openLanguagePicker(type: "source" | "target") {
    setActiveLanguagePicker(type);
    setShowLanguageModal(true);
  }

  function selectLanguage(value: AppLanguage) {
    if (activeLanguagePicker === "source") {
      setSelectedSourceLanguage(value);

      if (!isTranslateMode) {
        setSelectedTargetLanguage(value);
      }
    } else {
      setSelectedTargetLanguage(value || selectedSourceLanguage || "en");
    }

    setShowLanguageModal(false);
  }

  async function startRecordingVoice() {
    try {
      const permission = await requestRecordingPermissionsAsync();

      if (!permission.granted) {
        setScreenMessage("Microphone permission required");
        return;
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      setScreenMessage("");

      await audioRecorder.prepareToRecordAsync();
      await audioRecorder.record();

      setRecordingSeconds(0);

      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
      }

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);

      setScreenMessage("Recording...");
    } catch (error: any) {
      console.log("START_RECORDING_ERROR:", error);
      setScreenMessage(error?.message || "Recording start nahi hui");
    }
  }

  async function stopRecordingAndSend() {
    try {
      if (!recorderState.isRecording) return;

      await audioRecorder.stop();

      const recordedUri = audioRecorder.uri || recorderState.url;
      if (!recordedUri) {
        setScreenMessage("Recorded file nahi mili");
        return;
      }

      const token = await getSavedAuthToken();
      if (!token) {
        setScreenMessage("Token nahi mila. Dobara login karo.");
        return;
      }

      // ✅ Change C: Voice send me translate mode ka correct payload
      const sourceLang = getEffectiveSourceLanguage();
      const targetLang = getEffectiveTargetLanguage();
      const effectiveOriginalLang = sourceLang;
      const effectiveTargetLang = isTranslateMode ? targetLang : sourceLang;

      setIsSendingVoice(true);
      setScreenMessage("Sending voice...");

      if (Platform.OS === "web") {
        const formData = new FormData();
        formData.append("conversation_id", String(getConversationIdAsNumber()));
        formData.append("original_lang", effectiveOriginalLang);
        formData.append("target_lang", effectiveTargetLang);

        const response = await fetch(recordedUri);
        const blob = await response.blob();
        const WebFile = globalThis.File;
        const file = new WebFile(
          [blob],
          `recorded_voice_${Date.now()}.webm`,
          {
            type: blob.type || "audio/webm",
          }
        );

        formData.append("audio", file);

        await apiClient.post("/messages/voice", formData, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 45000,
        });
      } else {
        await sendRecordedAudioFromMobile({
          recordedUri,
          token,
          conversationId: getConversationIdAsNumber(),
          originalLang: effectiveOriginalLang,
          targetLang: effectiveTargetLang,
        });
      }

      setScreenMessage("Recorded voice send ho gayi");
      await loadMessagesForConversation(false);
      shouldAutoScrollRef.current = true;
      scrollToBottom(true);
    } catch (error: any) {
      console.log(
        "STOP_RECORDING_SEND_ERROR:",
        error?.response?.data || error?.message || error
      );

      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        "Recorded voice send nahi hui";

      setScreenMessage(String(errorMessage));
    } finally {
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      setRecordingSeconds(0);
      setIsSendingVoice(false);
    }
  }

  async function handleSendTextMessage() {
    try {
      if (!textMessage.trim()) {
        setScreenMessage("Message empty nahi ho sakta");
        return;
      }

      const token = await getSavedAuthToken();
      if (!token) {
        setScreenMessage("Token nahi mila. Dobara login karo.");
        return;
      }

      setIsSendingText(true);
      setScreenMessage("Sending message...");

      await apiClient.post(
        "/messages/text",
        {
          conversation_id: getConversationIdAsNumber(),
          original_lang: getEffectiveSourceLanguage(),
          target_lang: getEffectiveTargetLanguage(),
          text: textMessage.trim(),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        }
      );

      setTextMessage("");
      setScreenMessage("Message send ho gaya");
      await loadMessagesForConversation(false);
      shouldAutoScrollRef.current = true;
      scrollToBottom(true);
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        "Message send nahi hua";
      setScreenMessage(String(errorMessage));
    } finally {
      setIsSendingText(false);
    }
  }

  async function handleSendVoiceFileMessage() {
    try {
      const token = await getSavedAuthToken();
      if (!token) {
        setScreenMessage("Token nahi mila. Dobara login karo.");
        return;
      }

      const pickerResult = await DocumentPicker.getDocumentAsync({
        type: ["audio/*"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (pickerResult.canceled) return;

      const selectedFile = pickerResult.assets?.[0];
      if (!selectedFile) {
        setScreenMessage("Audio file select nahi hui");
        return;
      }

      // ✅ Change C: Voice send me translate mode ka correct payload
      const sourceLang = getEffectiveSourceLanguage();
      const targetLang = getEffectiveTargetLanguage();
      const effectiveOriginalLang = sourceLang;
      const effectiveTargetLang = isTranslateMode ? targetLang : sourceLang;

      setIsSendingVoice(true);
      setScreenMessage("Uploading voice file...");

      const formData = new FormData();
      formData.append("conversation_id", String(getConversationIdAsNumber()));
      formData.append("original_lang", effectiveOriginalLang);
      formData.append("target_lang", effectiveTargetLang);

      if (Platform.OS === "web" && (selectedFile as any).file) {
        formData.append(
          "audio",
          (selectedFile as any).file,
          selectedFile.name || "voice.mp3"
        );
      } else {
        formData.append(
          "audio",
          {
            uri: selectedFile.uri,
            name: selectedFile.name || "voice.mp3",
            type: selectedFile.mimeType || "audio/mpeg",
          } as any
        );
      }

      await apiClient.post("/messages/voice", formData, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        timeout: 45000,
      });

      setScreenMessage("Voice send ho gayi");
      await loadMessagesForConversation(false);
      shouldAutoScrollRef.current = true;
      scrollToBottom(true);
    } catch (error: any) {
      const errorMessage =
        error?.response?.data?.error ||
        error?.message ||
        "Voice send nahi hui";
      setScreenMessage(String(errorMessage));
    } finally {
      setIsSendingVoice(false);
    }
  }

  async function handleSendMediaMessage(type: "image" | "video") {
    try {
      const token = await getSavedAuthToken();
      if (!token) {
        setScreenMessage("Token nahi mila. Dobara login karo.");
        return;
      }

      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setScreenMessage("Media library permission required");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: type === "image" ? ["images"] : ["videos"],
        quality: 1,
        allowsEditing: false,
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset?.uri) {
        setScreenMessage(`${type} select nahi hui`);
        return;
      }

      setIsSendingMedia(true);
      setScreenMessage(type === "image" ? "Sending image..." : "Sending video...");

      if (Platform.OS === "web") {
        const formData = new FormData();
        formData.append("conversation_id", String(getConversationIdAsNumber()));
        formData.append("type", type);

        const webFile = (asset as any).file;

        if (webFile) {
          formData.append("media", webFile);
        } else {
          const response = await fetch(asset.uri);
          const blob = await response.blob();
          const fileName = asset.fileName || `${type}.${type === "image" ? "jpg" : "mp4"}`;
          const WebFile = globalThis.File;
          const file = new WebFile([blob], fileName, {
            type: asset.mimeType || (type === "image" ? "image/jpeg" : "video/mp4"),
          });
          formData.append("media", file);
        }

        await apiClient.post("/messages/media", formData, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 45000,
        });
      } else {
        await sendMediaFromMobile({
          assetUri: asset.uri,
          token,
          conversationId: getConversationIdAsNumber(),
          mediaType: type,
        });
      }

      setScreenMessage(type === "image" ? "Image send ho gayi" : "Video send ho gaya");
      await loadMessagesForConversation(false);
      shouldAutoScrollRef.current = true;
      scrollToBottom(true);
    } catch (error: any) {
      console.log("SEND_MEDIA_ERROR:", error?.response?.data || error?.message || error);
      const errorMessage = error?.response?.data?.error || error?.message || `${type} send nahi hui`;
      setScreenMessage(String(errorMessage));
    } finally {
      setIsSendingMedia(false);
    }
  }

  // ✅ Change A & B: Auto polling band - sirf ek baar load hoga, manual refresh se kaam hoga
  useEffect(() => {
    loadDefaults();
    loadMessagesForConversation();
  }, [conversationId]);

  useEffect(() => {
    if (recorderState.isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(micScale, {
            toValue: 1.08,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(micScale, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      micScale.stopAnimation();
      micScale.setValue(1);
    }
  }, [recorderState.isRecording]);

  const orderedMessages = useMemo(() => {
    return [...messageList].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return aTime - bTime;
    });
  }, [messageList]);

  function renderMessageItem({ item }: { item: MessageItem }) {
    const isMine = loggedInUser?.id === item.sender_id;
    const output = messageOutputMap[item.id];
    const showOutput = shouldShowOutput(item, output);
    
    // ✅ Change D: Translated text sirf receiver ko dikhao
    const translatedTextForViewer = !isMine && output?.translated_text ? output.translated_text : null;
    const translatedVoiceForViewer = !isMine && output?.tts_audio_url ? output.tts_audio_url : null;

    return (
      <Animated.View
        key={item.id}
        style={[
          styles.rowWrap,
          isMine ? styles.rowMine : styles.rowOther,
          {
            opacity: 1,
            transform: [{ translateY: 0 }],
          },
        ]}
      >
        <View
          style={[
            styles.messageBubble,
            isMine ? styles.messageBubbleMine : styles.messageBubbleOther,
            item.type === "voice" ? styles.voiceBubble : null,
          ]}
        >
          <View style={styles.badgeRow}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {item.type === "voice"
                  ? "Voice"
                  : item.type === "image"
                  ? "Image"
                  : item.type === "video"
                  ? "Video"
                  : "Text"}
              </Text>
            </View>
            <View style={styles.badgeSecondary}>
              <Text style={styles.badgeSecondaryText}>
                {formatLanguageLabel(item.original_lang as AppLanguage)}
              </Text>
            </View>
          </View>

          {item.text_body ? (
            <Text style={styles.messageText}>{item.text_body}</Text>
          ) : null}

          {item.type === "image" && item.original_audio_url ? (
            <ChatImagePreview uri={getFullAudioUrl(item.original_audio_url)} />
          ) : null}

          {item.type === "video" && item.original_audio_url ? (
            <ChatVideoPreview uri={getFullAudioUrl(item.original_audio_url)} />
          ) : null}

          {item.type === "voice" && item.original_audio_url ? (
            <View style={styles.audioPlayerWrap}>
              <AudioMessagePlayer
                uri={getFullAudioUrl(item.original_audio_url)}
                isWeb={Platform.OS === "web"}
                onAudioError={(message) => {
                  console.log("AUDIO_MESSAGE_ERROR:", message);
                }}
              />
            </View>
          ) : null}

          <Text style={styles.messageStatusText}>
            {item.status === "ready"
              ? "Delivered"
              : item.status === "processing"
              ? "Processing..."
              : item.status === "failed"
              ? "Failed"
              : item.status}
          </Text>

          {/* ✅ Change D: Sirf receiver ko translated output dikhao */}
          {showOutput && output && !isMine ? (
            <View style={styles.outputBox}>
              <View style={styles.outputHeaderRow}>
                <Text style={styles.outputTitle}>
                  {item.type === "voice"
                    ? "Translated Voice Output"
                    : "Translated Text Output"}
                </Text>
                <Text style={styles.outputTarget}>
                  {formatLanguageLabel(output.target_lang as AppLanguage)}
                </Text>
              </View>

              {translatedTextForViewer ? (
                <Text style={styles.outputText}>{translatedTextForViewer}</Text>
              ) : null}

              <Text style={styles.outputStatusText}>
                {output.status === "failed"
                  ? "Text ready, voice failed"
                  : output.status === "ready"
                  ? "Translated"
                  : output.status === "processing"
                  ? "Translating..."
                  : output.status}
              </Text>

              {item.type === "voice" && output.status === "failed" ? (
                <Text style={styles.outputWarningText}>
                  Translated text aa gayi hai, lekin translated voice nahi bani.
                </Text>
              ) : null}

              {translatedVoiceForViewer ? (
                <View style={styles.audioPlayerWrap}>
                  <AudioMessagePlayer
                    uri={getFullAudioUrl(output.tts_audio_url)}
                    isWeb={Platform.OS === "web"}
                    onAudioError={(message) => {
                      console.log("AUDIO_MESSAGE_ERROR:", message);
                    }}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 8}
    >
      <View style={styles.screen}>
        <View
          style={[
            styles.screenContainer,
            { maxWidth: isMobile ? "100%" : 760 },
          ]}
        >
          <View style={styles.chatHeaderCard}>
            <View style={styles.chatHeaderTopRow}>
              <View style={styles.chatHeaderIdentityRow}>
                <View style={styles.chatAvatarCircle}>
                  <Text style={styles.chatAvatarText}>
                    {getEmailInitials(String(email || ""))}
                  </Text>
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.screenTitle}>Conversation</Text>
                  <Text style={styles.chatUserEmailText}>
                    {String(email || "")}
                  </Text>

                  <View style={styles.presenceRow}>
                    <View style={styles.presenceDot} />
                    <Text style={styles.presenceText}>
                      {isTranslateMode
                        ? "Translate mode active"
                        : "Normal mode"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* ✅ Change B: Manual refresh button - sirf loadMessagesForConversation call karega */}
              <TouchableOpacity onPress={() => loadMessagesForConversation(false)}>
                <Text style={styles.headerActionText}>Refresh</Text>
              </TouchableOpacity>
            </View>

            <View
              style={[
                styles.chatHeaderControlRow,
                isMobile ? styles.chatHeaderControlRowMobile : null,
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.modeChip,
                  isTranslateMode ? styles.modeChipActive : null,
                  isMobile ? styles.modeChipMobile : null,
                ]}
                onPress={() => {
                  setIsTranslateMode((prev) => {
                    const next = !prev;
                    if (!next) {
                      setSelectedTargetLanguage(selectedSourceLanguage || "en");
                    }
                    return next;
                  });
                }}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    isTranslateMode ? styles.modeChipTextActive : null,
                  ]}
                >
                  {isTranslateMode ? "Translate ON" : "Normal"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.languageMiniChip}
                onPress={() => openLanguagePicker("source")}
              >
                <Text style={styles.languageMiniChipLabel}>Source</Text>
                <Text style={styles.languageMiniChipValue}>
                  {formatLanguageLabel(selectedSourceLanguage)}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.languageMiniChip}
                onPress={() => openLanguagePicker("target")}
                disabled={!isTranslateMode}
              >
                <Text style={styles.languageMiniChipLabel}>Target</Text>
                <Text style={styles.languageMiniChipValue}>
                  {isTranslateMode
                    ? formatLanguageLabel(selectedTargetLanguage)
                    : "Same"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.messageListCard}>
            <View style={styles.messageListTopBar}>
              <Text style={styles.messageListTopBarText}>Messages</Text>
              {/* ✅ Change B: Manual refresh button */}
              <TouchableOpacity onPress={() => loadMessagesForConversation(false)}>
                <Text style={styles.messageListTopBarAction}>Refresh</Text>
              </TouchableOpacity>
            </View>

            {isLoadingMessages ? (
              <ActivityIndicator
                size="large"
                color="#25D366"
                style={{ marginTop: 24 }}
              />
            ) : (
              <FlatList
                ref={flatListRef}
                data={orderedMessages}
                keyExtractor={(item) => String(item.id)}
                renderItem={renderMessageItem}
                style={styles.messageList}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ padding: 12, paddingBottom: 20 }}
                ListEmptyComponent={
                  <Text style={styles.emptyStateText}>
                    Abhi koi message nahi hai.
                  </Text>
                }
                removeClippedSubviews={true}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                onScroll={(event) => {
                  const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
                  const distanceFromBottom =
                    contentSize.height - (contentOffset.y + layoutMeasurement.height);
                  shouldAutoScrollRef.current = distanceFromBottom < 120;
                }}
                scrollEventThrottle={16}
              />
            )}
          </View>

          {screenMessage ? (
            <Text style={styles.screenMessageText}>{screenMessage}</Text>
          ) : null}

          <View style={styles.composerCard}>
            {recorderState.isRecording ? (
              <View style={styles.recordingBar}>
                <View style={styles.recordingLeftWrap}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingText}>
                    Recording {formatRecordingTime(recordingSeconds)}
                  </Text>
                </View>
                <Text style={styles.recordingHintText}>Tap again to send</Text>
              </View>
            ) : null}

            <View style={styles.composerRow}>
              <TouchableOpacity
                style={styles.iconActionButton}
                onPress={() => setShowAttachMenu(true)}
                disabled={isSendingVoice || isSendingMedia || isSendingText}
              >
                <Ionicons name="add" size={20} color="#F7FBFF" />
              </TouchableOpacity>

              <TextInput
                placeholder="Type your message"
                placeholderTextColor="#7c8aa5"
                style={styles.newMessageInput}
                value={textMessage}
                onChangeText={setTextMessage}
                multiline
              />

              {textMessage.trim() ? (
                <TouchableOpacity
                  style={styles.sendCircleButton}
                  onPress={handleSendTextMessage}
                  disabled={isSendingText || isSendingVoice || isSendingMedia}
                >
                  {isSendingText ? (
                    <Text style={{ color: "#0C2617", fontWeight: "800", fontSize: 11 }}>
                      SEND
                    </Text>
                  ) : (
                    <Ionicons name="send" size={18} color="#0C2617" />
                  )}
                </TouchableOpacity>
              ) : (
                <Animated.View style={{ transform: [{ scale: micScale }] }}>
                  <TouchableOpacity
                    style={[
                      styles.sendCircleButton,
                      recorderState.isRecording
                        ? styles.recordingCircleButton
                        : null,
                    ]}
                    onPress={async () => {
                      if (recorderState.isRecording) {
                        await stopRecordingAndSend();
                      } else {
                        await startRecordingVoice();
                      }
                    }}
                    disabled={isSendingVoice || isSendingText || isSendingMedia}
                  >
                    <Ionicons
                      name={recorderState.isRecording ? "stop" : "mic"}
                      size={18}
                      color={recorderState.isRecording ? "#fff" : "#0C2617"}
                    />
                  </TouchableOpacity>
                </Animated.View>
              )}
            </View>
          </View>

          <Modal
            visible={showLanguageModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowLanguageModal(false)}
          >
            <Pressable
              style={styles.languageModalOverlay}
              onPress={() => setShowLanguageModal(false)}
            >
              <View style={styles.languageModalCard}>
                <Text style={styles.languageModalTitle}>
                  {activeLanguagePicker === "source"
                    ? "Choose source language"
                    : "Choose target language"}
                </Text>

                {(
                  ["en", "ur", "sd", "ps", "bal", "de", "hinglish", "es", "zh"] as AppLanguage[]
                ).map((lang) => (
                  <TouchableOpacity
                    key={lang}
                    style={styles.languageModalOption}
                    onPress={() => selectLanguage(lang)}
                  >
                    <Text style={styles.languageModalOptionText}>
                      {formatLanguageLabel(lang)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Pressable>
          </Modal>

          <Modal
            visible={showAttachMenu}
            transparent
            animationType="fade"
            onRequestClose={() => setShowAttachMenu(false)}
          >
            <Pressable
              style={styles.languageModalOverlay}
              onPress={() => setShowAttachMenu(false)}
            >
              <View style={styles.attachMenuCard}>
                <Text style={styles.attachMenuTitle}>Choose action</Text>

                <TouchableOpacity
                  style={styles.attachMenuOption}
                  onPress={async () => {
                    setShowAttachMenu(false);
                    await handleSendMediaMessage("image");
                  }}
                >
                  <Ionicons name="image-outline" size={18} color="#F7FBFF" />
                  <Text style={styles.attachMenuOptionText}>Send image</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.attachMenuOption}
                  onPress={async () => {
                    setShowAttachMenu(false);
                    await handleSendMediaMessage("video");
                  }}
                >
                  <Ionicons
                    name="videocam-outline"
                    size={18}
                    color="#F7FBFF"
                  />
                  <Text style={styles.attachMenuOptionText}>Send video</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.attachMenuOption}
                  onPress={async () => {
                    setShowAttachMenu(false);
                    await handleSendVoiceFileMessage();
                  }}
                >
                  <Ionicons
                    name="document-attach-outline"
                    size={18}
                    color="#F7FBFF"
                  />
                  <Text style={styles.attachMenuOptionText}>
                    Upload audio file
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Modal>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07141F",
  },
  screenContainer: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 54,
    paddingBottom: 8,
    width: "100%",
    alignSelf: "center",
  },
  chatHeaderCard: {
    backgroundColor: "#0E2231",
    borderRadius: 22,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: 10,
  },
  chatHeaderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  chatHeaderIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  chatAvatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#27D367",
    alignItems: "center",
    justifyContent: "center",
  },
  chatAvatarText: {
    color: "#0C2617",
    fontSize: 16,
    fontWeight: "800",
  },
  headerActionText: {
    color: "#27D367",
    fontWeight: "700",
    fontSize: 13,
  },
  presenceRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#27D367",
    marginRight: 6,
  },
  presenceText: {
    color: "#A9BBC8",
    fontSize: 11,
  },
  chatHeaderControlRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  chatHeaderControlRowMobile: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  modeChip: {
    backgroundColor: "#152C3D",
    borderRadius: 22,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    justifyContent: "center",
  },
  modeChipMobile: {
    minWidth: 96,
  },
  modeChipActive: {
    backgroundColor: "#27D367",
    borderColor: "#27D367",
  },
  modeChipText: {
    color: "#F7FBFF",
    fontWeight: "700",
    fontSize: 12,
  },
  modeChipTextActive: {
    color: "#0C2617",
  },
  languageMiniChip: {
    flex: 1,
    backgroundColor: "#132634",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    minHeight: 58,
    justifyContent: "center",
  },
  languageMiniChipLabel: {
    color: "#7C93A3",
    fontSize: 11,
    marginBottom: 2,
  },
  languageMiniChipValue: {
    color: "#F7FBFF",
    fontSize: 13,
    fontWeight: "700",
  },
  screenTitle: {
    color: "#F7FBFF",
    fontSize: 20,
    fontWeight: "800",
  },
  chatUserEmailText: {
    color: "#A9BBC8",
    fontSize: 12,
    marginTop: 2,
  },
  messageListCard: {
    flex: 1,
    minHeight: 180,
    backgroundColor: "#071C2A",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
    marginBottom: 10,
  },
  messageList: {
    flex: 1,
  },
  messageListTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  messageListTopBarText: {
    color: "#F7FBFF",
    fontSize: 13,
    fontWeight: "700",
  },
  messageListTopBarAction: {
    color: "#27D367",
    fontSize: 12,
    fontWeight: "700",
  },
  rowWrap: {
    marginBottom: 10,
    flexDirection: "row",
  },
  rowMine: {
    justifyContent: "flex-end",
  },
  rowOther: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 18,
    padding: 10,
  },
  messageBubbleMine: {
    backgroundColor: "#1F8F63",
    borderTopRightRadius: 6,
  },
  messageBubbleOther: {
    backgroundColor: "#1B2D3A",
    borderTopLeftRadius: 6,
  },
  voiceBubble: {
    minWidth: 180,
  },
  badgeRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 6,
    flexWrap: "wrap",
    alignItems: "center",
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
  },
  badgeSecondary: {
    backgroundColor: "rgba(37,211,102,0.18)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeSecondaryText: {
    color: "#d7ffe7",
    fontSize: 10,
    fontWeight: "700",
  },
  messageText: {
    color: "#F7FBFF",
    fontSize: 14,
    lineHeight: 20,
  },
  messageStatusText: {
    color: "#A9BBC8",
    fontSize: 10,
    marginTop: 6,
  },
  outputBox: {
    marginTop: 10,
    backgroundColor: "rgba(0,0,0,0.22)",
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  outputHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
    alignItems: "center",
  },
  outputTitle: {
    color: "#27D367",
    fontWeight: "800",
    fontSize: 12,
  },
  outputTarget: {
    color: "#A9BBC8",
    fontSize: 11,
    fontWeight: "700",
  },
  outputText: {
    color: "#F7FBFF",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  outputStatusText: {
    color: "#7C93A3",
    fontSize: 11,
    marginTop: 6,
  },
  outputWarningText: {
    color: "#FFD166",
    fontSize: 11,
    marginTop: 4,
  },
  emptyStateText: {
    color: "#7C93A3",
    textAlign: "center",
    marginTop: 28,
  },
  composerCard: {
    backgroundColor: "#0E2231",
    borderRadius: 22,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    marginBottom: Platform.OS === "ios" ? 8 : 4,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#132634",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  newMessageInput: {
    flex: 1,
    backgroundColor: "#203442",
    color: "#F7FBFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 22,
    minHeight: 48,
    maxHeight: 96,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    fontSize: 15,
  },
  sendCircleButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: "#27D367",
    alignItems: "center",
    justifyContent: "center",
  },
  recordingCircleButton: {
    backgroundColor: "#FF6B6B",
  },
  audioPlayerWrap: {
    marginTop: 8,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 4,
  },
  nativeAudioButton: {
    backgroundColor: "#203442",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  nativeAudioButtonText: {
    color: "#F7FBFF",
    fontSize: 13,
    fontWeight: "700",
  },
  audioLoadingWrap: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  audioLoadingText: {
    color: "#D7E3F4",
    fontSize: 13,
    fontWeight: "600",
  },
  recordingBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  recordingLeftWrap: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#FF6B6B",
    marginRight: 8,
  },
  recordingText: {
    color: "#F7FBFF",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  recordingHintText: {
    color: "#FFD166",
    fontSize: 11,
    fontWeight: "600",
  },
  screenMessageText: {
    color: "#A9BBC8",
    textAlign: "center",
    marginBottom: 8,
    marginTop: 2,
    fontSize: 12,
  },
  mediaPreviewWrap: {
    marginTop: 8,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#0B1822",
  },
  nativeImagePreview: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  nativeVideoPreview: {
    width: "100%",
    height: 200,
    borderRadius: 12,
  },
  languageModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  languageModalCard: {
    width: "100%",
    maxWidth: 320,
    backgroundColor: "#0E2231",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  languageModalTitle: {
    color: "#F7FBFF",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  languageModalOption: {
    backgroundColor: "#132634",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  languageModalOptionText: {
    color: "#F7FBFF",
    fontSize: 14,
    fontWeight: "700",
  },
  attachMenuCard: {
    width: "100%",
    maxWidth: 300,
    backgroundColor: "#0E2231",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  attachMenuTitle: {
    color: "#F7FBFF",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  attachMenuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#132634",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  attachMenuOptionText: {
    color: "#F7FBFF",
    fontSize: 14,
    fontWeight: "700",
  },
});