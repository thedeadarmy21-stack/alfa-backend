import { Platform } from "react-native";

/* ✅ FIXED STRUCTURE (VERY IMPORTANT) */
export const Colors = {
  light: {
    bg: "#F4F8FB",
    bgElevated: "#FFFFFF",
    card: "#FFFFFF",
    cardSoft: "#EAF1F6",
    bubbleMine: "#27D367",
    bubbleOther: "#E3EDF5",
    input: "#F1F5F9",
    border: "rgba(0,0,0,0.08)",
    accent: "#27D367",
    accentDark: "#0C2617",
    text: "#0B1D2A",
    textSoft: "#4A5C6A",
    textMuted: "#6B7F8F",
    danger: "#FF6B6B",
    warning: "#FFD166",
    info: "#56A8FF",
    shadow: "rgba(0,0,0,0.15)",
    overlay: "rgba(0,0,0,0.03)",
  },

  dark: {
    bg: "#07141F",
    bgElevated: "#0B1D2A",
    card: "#0E2231",
    cardSoft: "#152C3D",
    bubbleMine: "#1F8F63",
    bubbleOther: "#1B2D3A",
    input: "#203442",
    border: "rgba(255,255,255,0.08)",
    accent: "#27D367",
    accentDark: "#0C2617",
    text: "#F7FBFF",
    textSoft: "#A9BBC8",
    textMuted: "#7C93A3",
    danger: "#FF6B6B",
    warning: "#FFD166",
    info: "#56A8FF",
    shadow: "rgba(0,0,0,0.35)",
    overlay: "rgba(255,255,255,0.04)",
  },
};

/* ✅ App Theme */
export const AppTheme = {
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 22,
    xl: 30,
  },

  radius: {
    sm: 10,
    md: 14,
    lg: 18,
    xl: 24,
    pill: 999,
  },

  fontSize: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 18,
    xl: 28,
  },

  shadow: {
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },

  fonts: Platform.select({
    ios: {
      sans: "system-ui",
      serif: "ui-serif",
      rounded: "ui-rounded",
      mono: "ui-monospace",
    },
    web: {
      sans: "Inter, system-ui, sans-serif",
      serif: "Georgia, serif",
      rounded: "Inter, system-ui, sans-serif",
      mono: "monospace",
    },
    default: {
      sans: "normal",
      serif: "serif",
      rounded: "normal",
      mono: "monospace",
    },
  }),
};

/* ✅ Fonts export (IMPORTANT for your explore.tsx) */
export const Fonts = AppTheme.fonts;