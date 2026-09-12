import { Stack } from "expo-router";

import { colors } from "@sidequest/ui/theme";

export default function ProfileStack() {
  return (
    <Stack
      screenOptions={{
        contentStyle: { backgroundColor: colors.canvas },
        headerShown: false,
      }}
    />
  );
}
