import { Tabs } from "expo-router";
import { Text, View } from "react-native";

import { rootTabLabels, type RootTab } from "@sidequest/contracts/navigation";
import { colors } from "@sidequest/ui/theme";

const icons: Record<RootTab, string> = {
  map: "⌖",
  quests: "◆",
  party: "♟",
  bet: "◉",
  profile: "●",
};

const iconScale: Record<RootTab, number> = {
  map: 23,
  quests: 18,
  party: 23,
  bet: 16,
  profile: 15,
};

/** ◆ sits high in the em box; push it down onto the shared icon line. */
const iconShift: Record<RootTab, number> = {
  map: 0,
  quests: 4,
  party: 0,
  bet: 0,
  profile: 0,
};

export default function TabLayout() {
  return (
    <Tabs
      initialRouteName="map"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.surface,
        tabBarStyle: {
          backgroundColor: colors.brandDeep,
          borderTopColor: colors.brand,
          minHeight: 72,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarIconStyle: { marginBottom: 0 },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "800",
          marginTop: 2,
        },
        tabBarIcon: ({ color }) => {
          const name = route.name as RootTab;
          const size = iconScale[name] ?? 16;
          return (
            <View
              style={{
                alignItems: "center",
                height: 24,
                justifyContent: "flex-end",
                overflow: "visible",
                width: 24,
              }}
            >
              <Text
                accessibilityElementsHidden
                style={{
                  color,
                  fontSize: size,
                  includeFontPadding: false,
                  lineHeight: size,
                  marginTop: iconShift[name],
                  textAlign: "center",
                }}
              >
                {icons[name]}
              </Text>
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="map" options={{ title: rootTabLabels.map }} />
      <Tabs.Screen name="quests" options={{ title: rootTabLabels.quests }} />
      <Tabs.Screen name="party" options={{ title: rootTabLabels.party }} />
      <Tabs.Screen name="bet" options={{ title: rootTabLabels.bet }} />
      <Tabs.Screen name="profile" options={{ title: rootTabLabels.profile }} />
    </Tabs>
  );
}
