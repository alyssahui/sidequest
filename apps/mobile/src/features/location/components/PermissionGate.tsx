import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { LocationAvailability } from "@sidequest/contracts/location";
import { capabilityFor, guidanceFor } from "@sidequest/location";
import { HudCard } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

export type PermissionGateProps = {
  availability: LocationAvailability | null;
  onRequestForeground: () => void;
  onRequestBackground: () => void;
  /** Rendered instead of the gate once location is usable. */
  children?: React.ReactNode;
};

/**
 * Explains the value before the OS dialog, and gives every denied or degraded
 * state a real next step rather than a dead end.
 *
 * It never blocks the screen behind it: when location is usable but not at full
 * strength, the children render and the gate becomes a dismissible strip.
 */
export function PermissionGate({
  availability,
  onRequestForeground,
  onRequestBackground,
  children,
}: PermissionGateProps) {
  if (!availability) {
    return (
      <HudCard accessibilityLabel="Checking location availability">
        <Text style={styles.title}>Checking location…</Text>
        <Text style={styles.body}>
          Working out what this device can do. The map still works without it.
        </Text>
      </HudCard>
    );
  }

  const capability = capabilityFor(availability);
  const guidance = guidanceFor(availability);

  const onPress = () => {
    switch (guidance.action) {
      case "REQUEST_FOREGROUND":
        onRequestForeground();
        break;
      case "REQUEST_BACKGROUND":
        onRequestBackground();
        break;
      case "OPEN_SETTINGS":
        void Linking.openSettings();
        break;
      case "NONE":
        break;
    }
  };

  // Fully working and nothing worth asking for: get out of the way entirely.
  if (capability.canVerifyArrival && guidance.action === "NONE") {
    return <>{children}</>;
  }

  const card = (
    <HudCard
      accessibilityLabel={`${guidance.title}. ${guidance.body}`}
      style={guidance.degraded ? styles.degraded : undefined}
    >
      <View style={styles.header}>
        <Text style={styles.title}>{guidance.title}</Text>
        {guidance.degraded ? (
          <Text accessibilityLabel="Limited functionality" style={styles.badge}>
            LIMITED
          </Text>
        ) : null}
      </View>

      <Text style={styles.body}>{guidance.body}</Text>

      {guidance.actionLabel ? (
        <Pressable
          accessibilityHint="Opens the system location settings or permission prompt"
          accessibilityLabel={guidance.actionLabel}
          accessibilityRole="button"
          onPress={onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonText}>{guidance.actionLabel}</Text>
        </Pressable>
      ) : null}
    </HudCard>
  );

  // Approximate or foreground-only still shows the map, so the gate sits above
  // the content instead of replacing it.
  return capability.canReadPosition ? (
    <>
      {card}
      {children}
    </>
  ) : (
    card
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.sm,
    justifyContent: "space-between",
  },
  degraded: { borderColor: colors.warning, borderWidth: 2 },
  title: {
    color: colors.ink,
    flexShrink: 1,
    fontSize: typeScale.body + 2,
    fontWeight: "900",
  },
  badge: {
    backgroundColor: colors.warning,
    borderRadius: radii.pill,
    color: colors.ink,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    overflow: "hidden",
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  body: {
    color: colors.muted,
    lineHeight: 21,
    marginTop: spacing.sm,
  },
  button: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    // 48 clears the 44x44 minimum touch target on both platforms.
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  pressed: { opacity: 0.82 },
  buttonText: {
    color: colors.inkInverse,
    fontWeight: "900",
    letterSpacing: 1,
  },
});
