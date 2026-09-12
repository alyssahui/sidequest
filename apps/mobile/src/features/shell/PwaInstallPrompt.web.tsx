import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing } from "@sidequest/ui/theme";

type InstallPromptEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    return () =>
      window.removeEventListener("beforeinstallprompt", capturePrompt);
  }, []);

  if (!promptEvent || dismissed) return null;

  const install = async () => {
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
  };

  return (
    <View accessibilityRole="alert" style={styles.banner}>
      <View style={styles.copy}>
        <Text style={styles.title}>TAKE SIDEQUEST WITH YOU</Text>
        <Text style={styles.detail}>
          Install the app for a full-screen game experience.
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={install}
        style={styles.install}
      >
        <Text style={styles.installText}>INSTALL</Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Dismiss install suggestion"
        accessibilityRole="button"
        onPress={() => setDismissed(true)}
        style={styles.dismiss}
      >
        <Text style={styles.dismissText}>×</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: "center",
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.brand,
    borderRadius: radii.md,
    borderWidth: 2,
    bottom: 82,
    flexDirection: "row",
    gap: spacing.sm,
    left: spacing.md,
    padding: spacing.md,
    position: "absolute",
    right: spacing.md,
    zIndex: 100,
  },
  copy: { flex: 1 },
  title: { color: colors.ink, fontSize: 13, fontWeight: "900" },
  detail: { color: colors.muted, fontSize: 12, marginTop: spacing.xs },
  install: {
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: spacing.md,
  },
  installText: { color: colors.inkInverse, fontSize: 12, fontWeight: "900" },
  dismiss: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
    minWidth: 44,
  },
  dismissText: { color: colors.ink, fontSize: 24 },
});
