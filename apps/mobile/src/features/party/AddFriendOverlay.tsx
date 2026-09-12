import { useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radii, spacing, typeScale } from "@sidequest/ui/theme";

type Props = {
  onClose: () => void;
  onAdd: (name: string) => void;
};

export function AddFriendOverlay({ onClose, onAdd }: Props) {
  const [name, setName] = useState("");
  const valid = name.trim().length >= 2;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <Pressable
          accessibilityLabel="Close add friend"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View accessibilityLabel="Add a friend" style={styles.sheet}>
          <Text style={styles.kicker}>INVITE</Text>
          <Text accessibilityRole="header" style={styles.title}>
            Add a friend
          </Text>
          <Text style={styles.help}>
            Drop a name into the party. They will see approximate presence only.
          </Text>
          <TextInput
            accessibilityLabel="Friend name"
            onChangeText={setName}
            placeholder="Friend's name"
            placeholderTextColor={colors.muted}
            style={styles.input}
            value={name}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !valid }}
            disabled={!valid}
            onPress={() => onAdd(name.trim())}
            style={[styles.primary, !valid && styles.disabled]}
          >
            <Text style={styles.primaryText}>ADD TO PARTY</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.close}
          >
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "rgba(0, 18, 22, 0.72)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  kicker: {
    color: colors.brandDeep,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1.4,
  },
  title: {
    color: colors.ink,
    fontSize: typeScale.title,
    fontWeight: "900",
    marginTop: spacing.xs,
  },
  help: { color: colors.muted, lineHeight: 20, marginTop: spacing.sm },
  input: {
    borderColor: colors.outline,
    borderRadius: radii.sm,
    borderWidth: 1,
    color: colors.ink,
    marginTop: spacing.md,
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  primary: {
    alignItems: "center",
    backgroundColor: colors.brandDeep,
    borderRadius: radii.sm,
    justifyContent: "center",
    marginTop: spacing.md,
    minHeight: 48,
  },
  disabled: { opacity: 0.45 },
  primaryText: { color: colors.inkInverse, fontWeight: "900" },
  close: { alignItems: "center", justifyContent: "center", minHeight: 44 },
  closeText: { color: colors.ink, fontWeight: "800" },
});
