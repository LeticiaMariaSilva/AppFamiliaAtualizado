// src/(public)/login.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Alert,
  InteractionManager,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import Icon from "react-native-vector-icons/MaterialIcons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { useOAuth, useAuth, useUser } from "@clerk/clerk-expo";

import styles from "../componentes/styleLogin";
import { LoginApi } from "../servicos/api";

// Completa sessão OAuth se o app voltou do navegador (uma vez)
WebBrowser.maybeCompleteAuthSession();

const OVERRIDE_KEY = "google_profile_override";
const PROVIDER_KEY = "provider"; // "db" | "google"

// NOVOS: controle de escopo por usuário
const LAST_USER_ID_KEY = "lastUserId";
const CLERK_USER_ID_KEY = "clerkUserId";

// limpa caches de itens/listas escopadas por usuário (db) e locais (google)
async function purgeUserScopedCaches(prevUserId) {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const prefixes = [
      `list_items:db:${prevUserId || ""}`, // itens cacheados por usuário (DB)
      `google_list_items:`,                // itens locais do modo "google"
      `list_items:google:`,                // itens locais por escopo
    ];
    const toRemove = keys.filter((k) => prefixes.some((p) => k.startsWith(p)));
    if (toRemove.length) await AsyncStorage.multiRemove(toRemove);
  } catch (e) {
    console.log("purgeUserScopedCaches erro:", e?.message || e);
  }
}

// navegação segura após autenticar
function resetToHome(navigation) {
  navigation.reset({ index: 0, routes: [{ name: "Inicio" }] });
}

export default function Login({ navigation, route }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loadingPwd, setLoadingPwd] = useState(false);
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);

  const itensLogin = route?.params?.itensLogin;

  // Clerk
  const googleOAuth = useOAuth({ strategy: "oauth_google" });
  const { isSignedIn, signOut } = useAuth();
  const { user, isLoaded: clerkLoaded } = useUser();

  // Auto-redirect APENAS se o provider salvo pedir isso
  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const provider = await AsyncStorage.getItem(PROVIDER_KEY);

        if (provider === "db") {
          const [token, userId] = await Promise.all([
            AsyncStorage.getItem("token"),
            AsyncStorage.getItem("userId"),
          ]);
          if (token && userId) {
            InteractionManager.runAfterInteractions(() => {
              if (mounted) navigation.replace("Inicio");
            });
          } else {
            // sessão inválida → limpa
            await AsyncStorage.multiRemove(["token", "userId", PROVIDER_KEY]);
          }
          return;
        }

        if (provider === "google") {
          // Só redireciona se a sessão do Clerk estiver ativa
          if (clerkLoaded) {
            if (isSignedIn) {
              const localName =
                user?.fullName || user?.firstName || user?.username || "Usuário";
              const localEmail =
                user?.primaryEmailAddress?.emailAddress ||
                user?.emailAddresses?.[0]?.emailAddress ||
                "";
              await AsyncStorage.setItem(
                OVERRIDE_KEY,
                JSON.stringify({ name: localName, email: localEmail })
              );
              const clerkIdNow = (user?.id || "").toString();
              await AsyncStorage.setItem(CLERK_USER_ID_KEY, clerkIdNow);

              InteractionManager.runAfterInteractions(() => {
                if (mounted) navigation.replace("Inicio");
              });
            } else {
              await AsyncStorage.removeItem(PROVIDER_KEY);
            }
          }
          return;
        }
      } catch (e) {
        console.log("checkSession error:", e?.message || e);
      }
    };

    checkSession();
    return () => {
      mounted = false;
    };
  }, [clerkLoaded, isSignedIn, user, navigation]);

  // Preenche campos se veio pela rota
  useEffect(() => {
    if (itensLogin) {
      setEmail(itensLogin.email || "");
      setPassword(itensLogin.password || "");
    }
  }, [itensLogin]);

  // ------- Login via backend (DB) -------
  const LogarUsuario = async () => {
    if (!email || !password) {
      Alert.alert("Erro", "Preencha todos os campos");
      return;
    }

    setLoadingPwd(true);
    try {
      const response = await LoginApi.post("/login", { email, password });
      const token = response?.data?.accessToken;
      // ✅ correção aqui com parênteses
      const userId = String(
        (response?.data?.user?.id ?? response?.data?.id) || ""
      ).trim();

      if (!token || !userId) {
        Alert.alert("Erro", "Credenciais inválidas");
        return;
      }

      const lastUserId = await AsyncStorage.getItem(LAST_USER_ID_KEY);
      if (lastUserId && lastUserId !== userId) {
        await purgeUserScopedCaches(lastUserId);
      }

      await AsyncStorage.multiSet([
        ["token", token],
        ["userId", userId],
        [LAST_USER_ID_KEY, userId],
        [PROVIDER_KEY, "db"],
      ]);

      await AsyncStorage.removeItem(CLERK_USER_ID_KEY);

      resetToHome(navigation);
    } catch (error) {
      console.log("Login DB error:", error?.response?.data || error?.message || error);
      Alert.alert("Erro", "Ocorreu um erro ao fazer login");
    } finally {
      setLoadingPwd(false);
    }
  };

  // ------- Login com Google (Clerk) -------
  const onGoogleSignIn = async () => {
    try {
      setLoadingGoogle(true);

      if (isSignedIn) {
        await AsyncStorage.setItem(PROVIDER_KEY, "google");
        const clerkIdNow = (user?.id || "").toString();
        const lastClerkId = await AsyncStorage.getItem(CLERK_USER_ID_KEY);
        if (lastClerkId && lastClerkId !== clerkIdNow) {
          await purgeUserScopedCaches(lastClerkId);
        }
        const localName =
          user?.fullName || user?.firstName || user?.username || "Usuário";
        const localEmail =
          user?.primaryEmailAddress?.emailAddress ||
          user?.emailAddresses?.[0]?.emailAddress ||
          "";

        await AsyncStorage.multiSet([
          [OVERRIDE_KEY, JSON.stringify({ name: localName, email: localEmail })],
          [CLERK_USER_ID_KEY, clerkIdNow],
          ["token", ""],
          ["userId", ""],
          [LAST_USER_ID_KEY, ""],
        ]);

        resetToHome(navigation);
        return;
      }

      const redirectUri = makeRedirectUri({ scheme: "familia" });

      const { createdSessionId, setActive, authSessionResult } =
        await googleOAuth.startOAuthFlow({ redirectUrl: redirectUri });

      if (authSessionResult?.type === "success" && createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        await AsyncStorage.setItem(PROVIDER_KEY, "google");

        const clerkIdNow = (user?.id || "").toString();
        const lastUserId = await AsyncStorage.getItem(LAST_USER_ID_KEY);
        const lastClerkId = await AsyncStorage.getItem(CLERK_USER_ID_KEY);

        if (lastUserId) {
          await purgeUserScopedCaches(lastUserId);
          await AsyncStorage.removeItem(LAST_USER_ID_KEY);
        }
        if (lastClerkId && lastClerkId !== clerkIdNow) {
          await purgeUserScopedCaches(lastClerkId);
        }

        const snapName =
          user?.fullName || user?.firstName || user?.username || "Usuário";
        const snapEmail =
          user?.primaryEmailAddress?.emailAddress ||
          user?.emailAddresses?.[0]?.emailAddress ||
          "";

        await AsyncStorage.multiSet([
          [OVERRIDE_KEY, JSON.stringify({ name: snapName, email: snapEmail })],
          [CLERK_USER_ID_KEY, clerkIdNow],
          ["token", ""],
          ["userId", ""],
        ]);

        resetToHome(navigation);
      } else {
        setLoadingGoogle(false);
      }
    } catch (e) {
      const msg = String(e?.message || e);
      if (msg.includes("already signed in")) {
        await AsyncStorage.setItem(PROVIDER_KEY, "google");
        const clerkIdNow = (user?.id || "").toString();
        const lastClerkId = await AsyncStorage.getItem(CLERK_USER_ID_KEY);
        if (lastClerkId && lastClerkId !== clerkIdNow) {
          await purgeUserScopedCaches(lastClerkId);
        }
        resetToHome(navigation);
        return;
      }
      console.log("Erro Google OAuth:", e);
      Alert.alert("Erro", "Não foi possível completar o login com Google.");
      setLoadingGoogle(false);
    }
  };

  // (Opcional) Trocar de conta Google
  const onGoogleReSignIn = async () => {
    try {
      setLoadingGoogle(true);
      try { await signOut(); } catch {}
      const redirectUri = makeRedirectUri({ scheme: "familia" });
      const { createdSessionId, setActive, authSessionResult } =
        await googleOAuth.startOAuthFlow({ redirectUrl: redirectUri });

      if (authSessionResult?.type === "success" && createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        await AsyncStorage.setItem(PROVIDER_KEY, "google");

        const clerkIdNow = (user?.id || "").toString();
        const lastClerkId = await AsyncStorage.getItem(CLERK_USER_ID_KEY);
        if (lastClerkId && lastClerkId !== clerkIdNow) {
          await purgeUserScopedCaches(lastClerkId);
        }

        await AsyncStorage.multiSet([
          [CLERK_USER_ID_KEY, clerkIdNow],
          ["token", ""],
          ["userId", ""],
          [LAST_USER_ID_KEY, ""],
        ]);

        resetToHome(navigation);
      } else {
        setLoadingGoogle(false);
      }
    } catch (e) {
      console.log("Erro re-login Google:", e);
      Alert.alert("Erro", "Não foi possível trocar de conta.");
      setLoadingGoogle(false);
    }
  };

  useEffect(() => {
    WebBrowser.warmUpAsync();
    return () => { WebBrowser.coolDownAsync(); };
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBackground}>
        <Image source={require("../imagens/perfilLogin.png")} style={styles.avatar} />
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Login</Text>
        <Text style={styles.subtitle}>Preencha os dados abaixo</Text>

        <View style={styles.inputContainer}>
          <MaterialIcons name="email" size={22} color="#4a90e2" style={styles.icon} />
          <TextInput
            placeholder="Email"
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        <View style={styles.inputContainer}>
          <MaterialIcons name="lock" size={22} color="#4a90e2" style={styles.icon} />
          <TextInput
            placeholder="Senha"
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry={!mostrarSenha}
          />
          <TouchableOpacity onPress={() => setMostrarSenha((v) => !v)} style={styles.eyeIcon}>
            <Icon name={mostrarSenha ? "visibility" : "visibility-off"} size={22} color="#4a90e2" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.forgotButton}>
          <Text style={styles.forgotText}>Esqueceu senha?</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.loginButton} onPress={LogarUsuario} disabled={loadingPwd}>
          <Text style={styles.loginButtonText}>
            {loadingPwd ? "Carregando..." : "Entrar"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.orText}>Ou</Text>

        <View style={styles.socialContainer}>
          <TouchableOpacity
            style={styles.socialButton}
            onPress={onGoogleSignIn}
            disabled={loadingGoogle}
          >
            <Image source={require("../imagens/logoGoogle.png")} style={styles.socialIcon} />
          </TouchableOpacity>
        </View>

        <View style={{ alignItems: "center", marginTop: 10 }}>
          <TouchableOpacity onPress={onGoogleReSignIn} disabled={loadingGoogle}>
            <Text style={{ color: "#4a90e2", textDecorationLine: "underline" }}>
              Entrar com outra conta Google
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.registerContainer}>
          <Text style={styles.registerText}>Não tem conta? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Cadastro")}>
            <Text style={styles.registerLink}>Cadastra-se</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}
