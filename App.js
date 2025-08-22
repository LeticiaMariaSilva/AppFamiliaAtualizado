import React from "react";
import { View, Text } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ClerkProvider } from "@clerk/clerk-expo";
import { tokenCache } from "./src/storage/tokenCache";

import Home from "./src/(public)/home";
import Login from "./src/(public)/login";
import Cadastro from "./src/(public)/cadastro";
import Inicio from "./src/(auth)/inicio";
import Compras from "./src/(auth)/compras";
import Veiculo from "./src/(auth)/veiculo";
import Tarefas from "./src/(auth)/tarefas";
import Perfil from "./src/(auth)/perfil";
import LembreteDeManutencao from "./src/(auth)/LembreteManuntencao";
import ItensLista from "./src/(auth)/ItensLista";

import ProtectedRoute from "./src/componentes/ProtectedRoute";

// =======================
// DEV: captura erros globais p/ ver a stack real
// =======================
if (__DEV__) {
  const prev = global.ErrorUtils?.getGlobalHandler?.();
  global.ErrorUtils?.setGlobalHandler?.((err, isFatal) => {
    console.log("🟥 UNCAUGHT ERROR:", err);  // <- olhe esse log no console
    prev && prev(err, isFatal);
  });
  try {
    const tracking = require("promise/setimmediate/rejection-tracking");
    tracking.enable({ allRejections: true });
  } catch {}
}

// =======================
// ErrorBoundary simples
// =======================
class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.log("🟥 ErrorBoundary", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontSize: 16, textAlign: "center" }}>
            Ocorreu um erro inesperado. Veja o console para detalhes.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const Stack = createNativeStackNavigator();

// Em apps Expo, variáveis públicas devem começar com EXPO_PUBLIC_
// Certifique-se de ter EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY no app.config/app.json (.env não é lido em dev puro)
const PUBLIC_CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (__DEV__ && !PUBLIC_CLERK_PUBLISHABLE_KEY) {
  console.warn("⚠️ EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY não encontrado. Defina no app.json/app.config para o Clerk funcionar.");
}

export default function App() {
  return (
    <ClerkProvider publishableKey={PUBLIC_CLERK_PUBLISHABLE_KEY || ""} tokenCache={tokenCache}>
      <ErrorBoundary>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: false }}>
            {/* públicas */}
            <Stack.Screen name="Home" component={Home} />
            <Stack.Screen name="Login" component={Login} />
            <Stack.Screen name="Cadastro" component={Cadastro} />

            {/* privadas */}
            <Stack.Screen name="Inicio">
              {props => <ProtectedRoute component={Inicio} {...props} />}
            </Stack.Screen>
            <Stack.Screen name="Compras">
              {props => <ProtectedRoute component={Compras} {...props} />}
            </Stack.Screen>
            <Stack.Screen name="ItensLista">
              {props => <ProtectedRoute component={ItensLista} {...props} />}
            </Stack.Screen>
            <Stack.Screen name="Veiculo">
              {props => <ProtectedRoute component={Veiculo} {...props} />}
            </Stack.Screen>
            <Stack.Screen name="Tarefas">
              {props => <ProtectedRoute component={Tarefas} {...props} />}
            </Stack.Screen>
            <Stack.Screen name="Perfil">
              {props => <ProtectedRoute component={Perfil} {...props} />}
            </Stack.Screen>
            <Stack.Screen name="LembreteDeManutencao">
              {props => <ProtectedRoute component={LembreteDeManutencao} {...props} />}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </ErrorBoundary>
    </ClerkProvider>
  );
}
