import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { auth, ApiClientError } from "@hel/api-client";
import type { RootStackScreenProps } from "../navigation/types";

/**
 * Ported from apps/client/src/features/auth/AuthScreens.tsx (LoginPage) —
 * same @hel/api-client calls, native inputs instead of DOM <input>/<form>.
 */
export function LoginScreen({ navigation }: RootStackScreenProps<"Login">) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function finishSignedIn() {
    try {
      await auth.bootstrapMe();
    } catch {
      // Fresh login already has a session; ignore and proceed.
    }
    navigation.replace("Matches");
  }

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      const result = await auth.login(email.trim(), password);
      if ("mfaRequired" in result && result.mfaRequired) {
        setMfaToken(result.mfaToken);
        setMfaCode("");
        return;
      }
      await finishSignedIn();
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.message : "Sign in failed. Try again."
      );
    } finally {
      setBusy(false);
    }
  }

  async function onVerifyMfa() {
    if (!mfaToken) return;
    setError(null);
    setBusy(true);
    try {
      await auth.verifyMfaLogin(mfaToken, mfaCode.trim());
      setMfaToken(null);
      setMfaCode("");
      await finishSignedIn();
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.message : "Verification failed."
      );
    } finally {
      setBusy(false);
    }
  }

  if (mfaToken) {
    return (
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <Text style={styles.title}>Authenticator code</Text>
            <Text style={styles.subtitle}>
              Enter the 6-digit code from your authenticator app, or a
              recovery code.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <TextInput
              style={styles.input}
              placeholder="Code"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              value={mfaCode}
              onChangeText={setMfaCode}
            />
            <Pressable
              style={[styles.button, (busy || mfaCode.trim().length < 6) && styles.buttonDisabled]}
              disabled={busy || mfaCode.trim().length < 6}
              onPress={onVerifyMfa}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Verify</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.linkButton}
              onPress={() => {
                setMfaToken(null);
                setMfaCode("");
                setError(null);
              }}
            >
              <Text style={styles.link}>Back to sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>
            Welcome back. Use the email you registered with.
          </Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <TextInput
            style={styles.input}
            placeholder="Email"
            autoComplete="email"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            autoComplete="current-password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={onSubmit}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#fff" },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  card: { gap: 12 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 14, color: "#666", marginBottom: 8 },
  error: {
    color: "#b91c1c",
    backgroundColor: "#fee2e2",
    padding: 10,
    borderRadius: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#a61b2b",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkButton: { alignItems: "center", marginTop: 8 },
  link: { color: "#a61b2b", fontSize: 14 },
});
