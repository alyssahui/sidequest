import { Tabs } from "expo-router";
import { Text } from "react-native";

import { rootTabLabels, type RootTab } from "@sidequest/contracts/navigation";
import { colors } from "@sidequest/ui/theme";

const icons: Record<RootTab, string> = {
  map: "⌖",
  quests: "◆",
  party: "♟",
  feed: "⚡",
  profile: "●",
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
        tabBarLabelStyle: { fontSize: 10, fontWeight: "800" },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 22 }} accessibilityElementsHidden>
            {icons[route.name as RootTab]}
          </Text>
        ),
      })}
    >
      <Tabs.Screen name="map" options={{ title: rootTabLabels.map }} />
      <Tabs.Screen name="quests" options={{ title: rootTabLabels.quests }} />
      <Tabs.Screen name="party" options={{ title: rootTabLabels.party }} />
      <Tabs.Screen name="feed" options={{ title: rootTabLabels.feed }} />
      <Tabs.Screen name="profile" options={{ title: rootTabLabels.profile }} />
    </Tabs>
  );
}
