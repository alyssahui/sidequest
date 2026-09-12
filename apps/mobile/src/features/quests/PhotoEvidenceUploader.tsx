import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing } from "@sidequest/ui/theme";

/** Small browser uploader; the API owns storage, validation, and CV review. */
export function PhotoEvidenceUploader({
  disabled = false,
  onUpload,
}: {
  disabled?: boolean;
  onUpload: (dataUrl: string) => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose() {
    if (typeof document === "undefined" || working || disabled) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp";
    input.setAttribute("capture", "environment");
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        setError("Choose an image smaller than 5 MB.");
        return;
      }
      setWorking(true);
      setError(null);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          if (typeof reader.result !== "string")
            throw new Error("Invalid image");
          await onUpload(reader.result);
        } catch (caught) {
          setError(
            caught instanceof Error ? caught.message : "Photo upload failed.",
          );
        } finally {
          setWorking(false);
        }
      };
      reader.onerror = () => {
        setError("Could not read that image.");
        setWorking(false);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel="Upload photo evidence"
        accessibilityRole="button"
        disabled={disabled || working}
        onPress={() => void choose()}
        style={[styles.button, (disabled || working) && styles.disabled]}
      >
        <Text style={styles.buttonText}>
          {working ? "CHECKING PHOTO…" : "📸 UPLOAD PHOTO EVIDENCE"}
        </Text>
      </Pressable>
      <Text style={styles.help}>
        Your photo is checked against this quest’s requirement. Grok can assist;
        a review is still required.
      </Text>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs, marginTop: spacing.sm },
  button: {
    alignItems: "center",
    backgroundColor: colors.brand,
    borderRadius: radii.sm,
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.md,
  },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.ink, fontWeight: "900", letterSpacing: 0.5 },
  help: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  error: { color: colors.brandDeep, fontSize: 12 },
});
