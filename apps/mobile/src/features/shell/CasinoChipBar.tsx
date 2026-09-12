import { StyleSheet, View } from "react-native";

import { colors } from "@sidequest/ui/theme";

const STRIPE_COUNT = 56;

export const CASINO_BAR_HEIGHT = 12;

export function CasinoChipBar() {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.clip}
    >
      <View style={styles.band}>
        {Array.from({ length: STRIPE_COUNT }, (_, index) => (
          <View
            key={index}
            style={[
              styles.stripe,
              {
                backgroundColor:
                  index % 2 === 0 ? colors.brandDeep : colors.surface,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    backgroundColor: colors.brandDeep,
    height: CASINO_BAR_HEIGHT,
    overflow: "hidden",
    width: "100%",
  },
  band: {
    flexDirection: "row",
    height: 36,
    marginLeft: -24,
    marginTop: -12,
    transform: [{ rotate: "18deg" }],
    width: "160%",
  },
  stripe: {
    flex: 1,
    height: "100%",
  },
});
