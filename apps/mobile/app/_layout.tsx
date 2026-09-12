import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { colors } from "@sidequest/ui/theme";
import { PwaInstallPrompt } from "../src/features/shell/PwaInstallPrompt";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.canvas },
          headerShown: false,
        }}
      />
      <PwaInstallPrompt />
    </>
  );
}
