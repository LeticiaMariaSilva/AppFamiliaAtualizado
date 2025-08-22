import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import styles from "../componentes/styleCompras";
import { InicioApi } from "../servicos/api";

const API_BASE = (InicioApi?.defaults?.baseURL || "https://api-gerenciador-familiar.vercel.app").replace(/\/+$/,"");

// mapa de categoria
const categoriasConfig = {
  Mercado:  { cor: ["#24b766ff", "#24b766ff"], icon: "cart-outline",        tipoApi: "MERCADO"  },
  Farmácia: { cor: ["#0c97eeff", "#0c97eeff"], icon: "medical-bag",         tipoApi: "FARMACIA" },
  Padaria:  { cor: ["#f58b12ff", "#f58b12ff"], icon: "bread-slice-outline", tipoApi: "PADARIA"  },
  Açougue:  { cor: ["#ee3528ff", "#ee3528ff"], icon: "food-steak",          tipoApi: "ACOUGUE"  },
  Outros:   { cor: ["#3ba4e6",   "#3ba4e6"],   icon: "shape-outline",       tipoApi: "OUTROS"   },
};

const normalizarTipoParaNome = (tipo) => {
  const t = String(tipo || "").toUpperCase();
  if (t === "MERCADO") return "Mercado";
  if (t === "FARMACIA") return "Farmácia";
  if (t === "PADARIA") return "Padaria";
  if (t === "ACOUGUE" || t === "AÇOUGUE" || t === "ACOUQUE") return "Açougue";
  return "Outros";
};

// verifica se a lista é do usuário logado tentando ler seus itens
async function verifyListOwnership(listId, token) {
  try {
    const res = await fetch(`${API_BASE}/list-items/${listId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    // Se 200 => pertence ao usuário; 401/403/404 => ignoramos
    return res.ok;
  } catch {
    return false;
  }
}

export default function Compras({ navigation }) {
  const [listas, setListas] = useState([]);
  const [rawListasValidas, setRawListasValidas] = useState([]); // listas válidas do usuário (todas)
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchListas();
  }, []);

  const fetchListas = async () => {
    setLoading(true);
    try {
      const provider = (await AsyncStorage.getItem("provider")) || "db";
      if (provider !== "db") {
        setListas([]);
        setRawListasValidas([]);
        return;
      }

      const token = await AsyncStorage.getItem("token");
      const userId = await AsyncStorage.getItem("userId");
      if (!token || !userId) {
        await AsyncStorage.multiRemove(["token", "userId"]);
        Alert.alert("Sessão expirada", "Faça login novamente.");
        navigation.replace("Login");
        return;
      }

      // 1) pega tudo que o backend devolver
      const resp = await fetch(`${API_BASE}/lists`, {
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
      });
      const text = await resp.text();
      if (!resp.ok) throw new Error(`HTTP ${resp.status} - ${text}`);

      let data;
      try { data = JSON.parse(text); } catch { data = []; }
      const listasArray = Array.isArray(data) ? data : Array.isArray(data?.listas) ? data.listas : [];

      // 2) filtra **de fato** por usuário validando posse com /list-items/:id
      const validas = [];
      for (const l of listasArray) {
        const id = String(l?.id || "").trim();
        if (!id) continue;
        const ok = await verifyListOwnership(id, token);
        if (ok) validas.push(l);
      }

      // 3) dedupe por tipo (uma por categoria)
      const seen = new Set();
      const categorias = [];
      for (const item of validas) {
        const id = String(item?.id || "").trim();
        const tipo = String(item?.tipo || "").toUpperCase();
        if (!id || !tipo) continue;
        if (seen.has(tipo)) continue;
        seen.add(tipo);

        const nome = normalizarTipoParaNome(tipo);
        const cfg = categoriasConfig[nome] || { cor: ["#3ba4e6", "#3ba4e6"], icon: "cart-outline" };
        categorias.push({
          id,
          tipo,
          nome,
          cor: cfg.cor,
          icon: cfg.icon,
          progresso: 0,
          totalItens: 0,
          itensComprados: 0,
        });
      }

      setRawListasValidas(validas);
      setListas(categorias);
    } catch (e) {
      console.log("Erro /lists:", e?.message || e);
      Alert.alert("Erro", "Não foi possível carregar suas listas.");
      setRawListasValidas([]);
      setListas([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenList = (item) => {
    navigation.navigate("ItensLista", {
      tipo: item.nome,               // nome bonito (Mercado, etc.)
      listasFromApi: rawListasValidas, // somente listas previamente validadas do usuário
    });
  };

  if (loading) {
    return (
      <View style={[styles.bg, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color="#3ba4e6" />
      </View>
    );
  }

  return (
    <View style={styles.bg}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: 24, marginBottom: 7 }}>
        <Text style={styles.title}>Lista de Compras</Text>
      </View>

      <FlatList
        data={listas}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ padding: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.categoriaBtn} onPress={() => handleOpenList(item)}>
            <LinearGradient colors={item.cor} style={styles.categoriaGradient}>
              <View style={styles.iconArea}>
                <Icon name={item.icon} size={32} color="#fff" />
              </View>
              <View style={{ flex: 1, marginLeft: 18 }}>
                <Text style={styles.categoriaText}>{item.nome}</Text>
                <View style={styles.progressBarContainer}>
                  <View style={[styles.progressBar, { width: "0%" }]} />
                </View>
                <Text style={styles.progressText}>0% | 0/0 comprados</Text>
              </View>
              <Icon name="chevron-right" size={32} color="#fff" />
            </LinearGradient>
          </TouchableOpacity>
        )}
      />

      <View className={styles?.tabBar ? "" : undefined} style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Inicio")}>
          <Icon name="home-outline" size={24} color="#3ba4e6" />
          <Text style={styles.tabText}>Início</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem]}>
          <Icon name="cart" size={24} color="#3ba4e6" />
          <Text style={[styles.tabText, { color: "#3ba4e6" }]}>Compras</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Veiculo")}>
          <Icon name="car-outline" size={24} color="#3ba4e6" />
          <Text style={styles.tabText}>Veículos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Tarefas")}>
          <Icon name="check-circle-outline" size={24} color="#3ba4e6" />
          <Text style={styles.tabText}>Tarefas</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Perfil")}>
          <Icon name="account-circle-outline" size={24} color="#3ba4e6" />
          <Text style={styles.tabText}>Perfil</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
