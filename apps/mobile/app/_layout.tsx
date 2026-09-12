import { Stack } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";

import { colors } from "@sidequest/ui/theme";
import { PwaInstallPrompt } from "../src/features/shell/PwaInstallPrompt";

export default function RootLayout() {
  return (
    <>
      {/* Expo Router's head manager always renders a <title>; without this it
          emits an empty one that overrides any static tag in +html.tsx. */}
      <Head>
        <title>SideQuest</title>
        <meta
          name="description"
          content="Turn real life into a multiplayer game with your friends."
        />
      </Head>
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
