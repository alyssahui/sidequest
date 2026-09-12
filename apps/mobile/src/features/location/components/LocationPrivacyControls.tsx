import { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";

import type {
  LocationPrivacySummary,
  LocationSession,
  LocationSharingPreference,
} from "@sidequest/contracts/location";
import { HudCard } from "@sidequest/ui/components";
import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

import type { LocationApi } from "../api";

export type LocationPrivacyControlsProps = {
  api: LocationApi;
  /** The session currently running, so it can be paused from here. */
  activeSession: LocationSession | null;
  isTracking: boolean;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
};

const durationOptions = [
  { label: "15 MIN", ms: 15 * 60_000 },
  { label: "45 MIN", ms: 45 * 60_000 },
  { label: "2 HRS", ms: 2 * 60 * 60_000 },
];

/**
 * The player's controls over their own location.
 *
 * Everything here is reachable without leaving the map: pause, stop, choose how
 * long sharing lasts, turn party presence off, and delete what has been stored.
 * Nothing is punished — pausing is one tap and has no cost.
 */
export function LocationPrivacyControls({
  api,
  activeSession,
  isTracking,
  onPause,
  onResume,
  onStop,
}: LocationPrivacyControlsProps) {
  const [preference, setPreference] =
    useState<LocationSharingPreference | null>(null);
  const [summary, setSummary] = useState<LocationPrivacySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await api.getPrivacy();
      setPreference(result.preference);
      setSummary(result.summary);
      setError(null);
    } catch {
      setError("Couldn't load your privacy settings. Try again.");
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const update = useCallback(
    async (patch: Partial<LocationSharingPreference>) => {
      setBusy(true);
      try {
        setPreference(await api.updatePrivacy(patch));
        setError(null);
        await load();
      } catch {
        setError("Couldn't save that change. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [api, load],
  );

  const deleteData = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api.deleteMyLocationData();
      setNotice(
        `Deleted ${result.deletedSampleCount} stored readings and stopped ${result.stoppedSessionCount} sessions.`,
      );
      await load();
    } catch {
      setError("Couldn't delete your location data. Try again.");
    } finally {
      setBusy(false);
    }
  }, [api, load]);

  const retentionHours = summary
    ? Math.round(summary.rawSampleRetentionMs / 3_600_000)
    : null;

  return (
    <HudCard accessibilityLabel="Location privacy controls">
      <Text accessibilityRole="header" style={styles.title}>
        WHO CAN SEE YOU
      </Text>

      <Text style={styles.body}>
        Your party sees a rough area and how recently you moved — never your
        exact position. Readings are deleted automatically
        {retentionHours ? ` after ${retentionHours} hours` : ""}.
      </Text>

      {activeSession ? (
        <View style={styles.sessionRow}>
          <Text style={styles.sessionText}>
            {isTracking ? "Sharing until" : "Paused · expires"}{" "}
            {new Date(activeSession.expiresAt).toLocaleTimeString([], {
              hour: "numeric",
              minute: "2-digit",
            })}
          </Text>
          <View style={styles.actions}>
            <Pressable
              accessibilityLabel={
                isTracking
                  ? "Pause location sharing"
                  : "Resume location sharing"
              }
              accessibilityRole="button"
              onPress={isTracking ? onPause : onResume}
              style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            >
              <Text style={styles.chipText}>
                {isTracking ? "PAUSE" : "RESUME"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Stop location sharing now"
              accessibilityRole="button"
              onPress={onStop}
              style={({ pressed }) => [
                styles.chip,
                styles.chipDanger,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.chipText}>STOP</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {preference ? (
        <View style={styles.toggles}>
          <Toggle
            hint="Turning this off stops every running session immediately."
            label="Share location at all"
            onChange={(value) => void update({ sharingEnabled: value })}
            value={preference.sharingEnabled}
            disabled={busy}
          />
          <Toggle
            hint="Your party sees a rough area only, never a point."
            label="Show me in party presence"
            onChange={(value) => void update({ sharePartyPresence: value })}
            value={preference.sharePartyPresence}
            disabled={busy || !preference.sharingEnabled}
          />
          <Toggle
            hint="Only while a quest is active. It stops when the quest ends."
            label="Allow background during a quest"
            onChange={(value) =>
              void update({ allowBackgroundDuringQuest: value })
            }
            value={preference.allowBackgroundDuringQuest}
            disabled={busy || !preference.sharingEnabled}
          />

          <Text style={styles.subheading}>SHARE FOR</Text>
          <View style={styles.actions}>
            {durationOptions.map((option) => {
              const selected =
                preference.defaultSessionDurationMs === option.ms;
              return (
                <Pressable
                  accessibilityLabel={`Share location for ${option.label}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  disabled={busy}
                  key={option.label}
                  onPress={() =>
                    void update({ defaultSessionDurationMs: option.ms })
                  }
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={styles.chipText}>{option.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {summary ? (
        <Text style={styles.summary}>
          {summary.storedSampleCount} readings stored ·{" "}
          {summary.activeSessions.length} session
          {summary.activeSessions.length === 1 ? "" : "s"} open
        </Text>
      ) : null}

      <Pressable
        accessibilityHint="Permanently removes every location reading SideQuest has stored for you"
        accessibilityLabel="Delete my location data"
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void deleteData()}
        style={({ pressed }) => [
          styles.deleteButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.deleteText}>DELETE MY LOCATION DATA</Text>
      </Pressable>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </HudCard>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleLabel}>
        <Text style={styles.toggleText}>{label}</Text>
        <Text style={styles.toggleHint}>{hint}</Text>
      </View>
      <Switch
        accessibilityHint={hint}
        accessibilityLabel={label}
        disabled={disabled}
        onValueChange={onChange}
        thumbColor={value ? colors.brand : colors.surface}
        trackColor={{ false: colors.outline, true: colors.brandDeep }}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.ink,
    fontSize: typeScale.body,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  body: { color: colors.muted, lineHeight: 21, marginTop: spacing.sm },
  subheading: {
    color: colors.ink,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.2,
    marginTop: spacing.md,
  },
  sessionRow: { gap: spacing.sm, marginTop: spacing.md },
  sessionText: { color: colors.ink, fontWeight: "700" },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.pill,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: spacing.md,
  },
  chipSelected: { backgroundColor: colors.brand },
  chipDanger: { backgroundColor: colors.danger },
  chipText: {
    color: colors.inkInverse,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  pressed: { opacity: 0.82 },
  toggles: { gap: spacing.md, marginTop: spacing.md },
  toggleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: spacing.md,
    justifyContent: "space-between",
    minHeight: 44,
  },
  toggleLabel: { flex: 1 },
  toggleText: { color: colors.ink, fontWeight: "800" },
  toggleHint: { color: colors.muted, fontSize: 12, marginTop: 2 },
  summary: { color: colors.muted, fontSize: 12, marginTop: spacing.md },
  deleteButton: {
    alignItems: "center",
    borderColor: colors.danger,
    borderRadius: radii.sm,
    borderWidth: 2,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  deleteText: { color: colors.danger, fontWeight: "900", letterSpacing: 1 },
  notice: { color: colors.ink, fontSize: 13, marginTop: spacing.sm },
  error: { color: colors.danger, fontSize: 13, marginTop: spacing.sm },
});
