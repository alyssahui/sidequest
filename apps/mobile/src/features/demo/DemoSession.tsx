import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing } from "@sidequest/ui/theme";

export const DEMO_USERS = [
  { id: "user-zuri", name: "Zuri", avatar: "Z" },
  { id: "user-ben", name: "Ben", avatar: "B" },
  { id: "user-alyssa", name: "Alyssa", avatar: "A" },
] as const;

type DemoUser = (typeof DEMO_USERS)[number];
type SessionValue = {
  user: DemoUser;
  setUserId: (id: string) => void;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
  requestAudio: (path: string, init?: RequestInit) => Promise<Blob>;
};

const SessionContext = createContext<SessionValue | null>(null);
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

function initialUserId() {
  if (typeof window === "undefined") return DEMO_USERS[0].id;
  const query = new URLSearchParams(window.location.search).get("user");
  return (
    DEMO_USERS.find((user) => user.id === query)?.id ??
    window.localStorage.getItem("sidequest-demo-user") ??
    DEMO_USERS[0].id
  );
}

export function DemoSessionProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState(initialUserId);
  const user =
    DEMO_USERS.find((candidate) => candidate.id === userId) ?? DEMO_USERS[0];

  const setUserId = useCallback((next: string) => {
    if (!DEMO_USERS.some((candidate) => candidate.id === next)) return;
    setUserIdState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("sidequest-demo-user", next);
      const url = new URL(window.location.href);
      url.searchParams.set("user", next);
      window.history.replaceState({}, "", url);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined")
      window.localStorage.setItem("sidequest-demo-user", user.id);
  }, [user.id]);

  const rawRequest = useCallback(
    async (path: string, init: RequestInit = {}) => {
      const response = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          ...(init.body ? { "content-type": "application/json" } : {}),
          "x-demo-user-id": user.id,
          ...init.headers,
        },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = body?.error?.message ?? body?.message ?? body?.code;
        throw new Error(detail || `Request failed (${response.status})`);
      }
      return response;
    },
    [user.id],
  );

  const value = useMemo<SessionValue>(
    () => ({
      user,
      setUserId,
      request: async <T,>(path: string, init?: RequestInit) =>
        (await rawRequest(path, init)).json() as Promise<T>,
      requestAudio: async (path: string, init?: RequestInit) =>
        (await rawRequest(path, init)).blob(),
    }),
    [rawRequest, setUserId, user],
  );

  return (
    <SessionContext.Provider value={value}>
      <DemoIdentityBar user={user} onChange={setUserId} />
      {children}
    </SessionContext.Provider>
  );
}

export function useDemoSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("DemoSessionProvider is missing");
  return value;
}

function DemoIdentityBar({
  user,
  onChange,
}: {
  user: DemoUser;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.bar}>
      <Text style={styles.label}>PLAYING AS</Text>
      <View style={styles.users}>
        {DEMO_USERS.map((candidate) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: candidate.id === user.id }}
            key={candidate.id}
            onPress={() => onChange(candidate.id)}
            style={[
              styles.user,
              candidate.id === user.id && styles.userSelected,
            ]}
          >
            <Text
              style={[
                styles.userText,
                candidate.id === user.id && styles.userTextSelected,
              ]}
            >
              {candidate.name}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.live}>● SHARED LIVE DEMO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignItems: "center",
    backgroundColor: colors.ink,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    paddingVertical: 7,
  },
  label: {
    color: colors.muted,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1,
  },
  users: { flexDirection: "row", gap: 4 },
  user: { borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5 },
  userSelected: { backgroundColor: colors.brand },
  userText: { color: colors.surface, fontSize: 11, fontWeight: "900" },
  userTextSelected: { color: colors.ink },
  live: {
    color: colors.brand,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
});
