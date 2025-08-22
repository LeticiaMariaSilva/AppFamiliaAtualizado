// src/componentes/ProtectedRoute.js
import React, { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/clerk-expo";
import { InteractionManager } from "react-native";

export default function ProtectedRoute({ component: Component, navigation, ...rest }) {
  const { isSignedIn, isLoaded } = useAuth();         // Clerk
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const provider = await AsyncStorage.getItem("provider"); // "db" | "google" | null

        // Se for Google, liberamos quando Clerk estiver carregado e (idealmente) logado
        if (provider === "google") {
          if (isLoaded && isSignedIn) {
            if (!cancelled) { setAllowed(true); setReady(true); }
          } else if (isLoaded && !isSignedIn) {
            // sem sessão no Clerk -> mandar pro Login
            if (!cancelled) {
              setAllowed(false);
              setReady(true);
              InteractionManager.runAfterInteractions(() => navigation.replace("Login"));
            }
          } else {
            // aguardando Clerk carregar
            if (!cancelled) setReady(false);
          }
          return;
        }

        // provider === "db" (backend próprio)
        const token = await AsyncStorage.getItem("token");
        const userId = await AsyncStorage.getItem("userId");
        if (token && userId) {
          if (!cancelled) { setAllowed(true); setReady(true); }
        } else {
          if (!cancelled) {
            setAllowed(false);
            setReady(true);
            InteractionManager.runAfterInteractions(() => navigation.replace("Login"));
          }
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
          setReady(true);
          InteractionManager.runAfterInteractions(() => navigation.replace("Login"));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, navigation]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!allowed) {
    // enquanto navega para Login, mostra um loading curtinho
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return <Component navigation={navigation} {...rest} />;
}
