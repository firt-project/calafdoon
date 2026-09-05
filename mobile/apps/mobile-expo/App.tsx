import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { auth } from "@hel/api-client";
import { initAuthTokenStore } from "./src/auth-token-store";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MatchesScreen } from "./src/screens/MatchesScreen";
import type { RootStackParamList } from "./src/navigation/types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [booting, setBooting] = useState(true);
  const [initialRoute, setInitialRoute] = useState<keyof RootStackParamList>("Login");

  useEffect(() => {
    (async () => {
      await initAuthTokenStore();
      try {
        const boot = await auth.bootstrapMe();
        if (boot.user) setInitialRoute("Matches");
      } catch {
        // No session yet / API unreachable — start at Login.
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  if (booting) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#a61b2b" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{ headerTitleAlign: "center" }}
      >
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Matches" component={MatchesScreen} options={{ title: "Matches" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
});
