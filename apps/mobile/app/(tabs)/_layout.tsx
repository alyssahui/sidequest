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
  map: 20,
  quests: 14,
  party: 19,
  bet: 16,
  profile: 15,
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
        tabBarIcon: ({ color }) => {
          const name = route.name as RootTab;
          return (
            <View
              style={{
                alignItems: "center",
                height: 24,
                justifyContent: "center",
                width: 24,
              }}
            >
              <Text
                accessibilityElementsHidden
                style={{
                  color,
                  fontSize: iconScale[name] ?? 16,
                  lineHeight: 24,
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
