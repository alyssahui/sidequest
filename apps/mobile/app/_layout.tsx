import { Stack } from "expo-router";
import Head from "expo-router/head";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@sidequest/ui/theme";

import { CasinoChipBar } from "../src/features/shell/CasinoChipBar";
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
      <View style={styles.root}>
        <SafeAreaView edges={["top"]} style={styles.top}>
          <CasinoChipBar />
        </SafeAreaView>
        <View style={styles.body}>
          <Stack
            screenOptions={{
              contentStyle: { backgroundColor: colors.canvas },
              headerShown: false,
            }}
          />
        </View>
      </View>
      <PwaInstallPrompt />
    </>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.canvas, flex: 1 },
  top: { backgroundColor: colors.brandDeep },
  body: { flex: 1 },
});
