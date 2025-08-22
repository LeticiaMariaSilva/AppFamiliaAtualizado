import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
import styles from "../componentes/styleVeiculos";
import { VeiculosApi } from "../servicos/api";

const LS_VEHICLES_KEY = "google_vehicles";

export default function Veiculo({ route, navigation }) {
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ano, setAno] = useState("");
  const [placa, setPlaca] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [editingVeiculosId, setEditingVeiculoId] = useState(null);
  const [veiculos, setVeiculos] = useState([]);
  const [provider, setProvider] = useState("db"); // "db" | "google"

  useEffect(() => {
    (async () => {
      const p = (await AsyncStorage.getItem("provider")) || "db";
      setProvider(p);
      await carregarVeiculos(p);
    })();
  }, []);

  useEffect(() => {
    if (route.params?.itensVeiculos) {
      setMarca(route.params.itensVeiculos.marca || "");
      setModelo(route.params.itensVeiculos.modelo || "");
      setAno(String(route.params.itensVeiculos.ano || ""));
      setPlaca(route.params.itensVeiculos.placa || "");
      setEditingVeiculoId(route.params.itensVeiculos.id || null);
    } else {
      limparForm();
    }
  }, [route.params?.itensVeiculos]);

  // -------- Helpers (modo Google local) --------
  async function lsGetVehicles() {
    const raw = await AsyncStorage.getItem(LS_VEHICLES_KEY);
    try {
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  async function lsSetVehicles(list) {
    await AsyncStorage.setItem(LS_VEHICLES_KEY, JSON.stringify(list));
  }

  const nowIso = () => new Date().toISOString();

  // -------- Carregar veículos --------
  const carregarVeiculos = async (mode = provider) => {
    setIsLoading(true);
    try {
      if (mode === "google") {
        const local = await lsGetVehicles();
        local.sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0) -
            new Date(a.updatedAt || a.createdAt || 0)
        );
        setVeiculos(local);
        return;
      }

      // provider === "db" (sem fallback local)
      const [token, userId] = await Promise.all([
        AsyncStorage.getItem("token"),
        AsyncStorage.getItem("userId"),
      ]);

      if (!token || !userId) {
        Alert.alert("Erro", "Faça login novamente.");
        navigation.replace("Login");
        return;
      }

      const response = await VeiculosApi.get(`/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = Array.isArray(response.data) ? response.data : [];
      const veiculosUsuario = data.filter((v) => {
        const usuarioId = v.userId ?? v.usuarioId ?? v.ownerId ?? v.user?.id;
        return String(usuarioId) === String(userId);
      });

      setVeiculos(veiculosUsuario);
    } catch (error) {
      console.warn("Erro ao carregar via API:", error?.response?.data || error.message);
      // mantém modo DB e não migra para local
      setVeiculos([]);
      Alert.alert("Erro", "Não foi possível carregar os veículos do servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  // -------- Salvar (criar/editar) --------
  const salvarVeiculo = async () => {
    const anoNumero = parseInt(ano, 10);
    if (!marca.trim() || !modelo.trim() || !anoNumero || !placa.trim()) {
      Alert.alert("Erro", "Preencha todos os campos.");
      return;
    }

    try {
      if (provider === "google") {
        const current = await lsGetVehicles();
        if (editingVeiculosId) {
          const updated = current.map((v) =>
            v.id === editingVeiculosId
              ? { ...v, marca, modelo, ano: anoNumero, placa, updatedAt: nowIso() }
              : v
          );
          await lsSetVehicles(updated);
          Alert.alert("Sucesso", "Veículo atualizado (local).");
        } else {
          const novo = {
            id: `v_${Date.now()}`,
            marca,
            modelo,
            ano: anoNumero,
            placa,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
          await lsSetVehicles([novo, ...current]);
          Alert.alert("Sucesso", "Veículo salvo (local).");
        }
        limparForm();
        await carregarVeiculos("google");
        return;
      }

      // provider === "db" (sem fallback local)
      const [token, userId] = await Promise.all([
        AsyncStorage.getItem("token"),
        AsyncStorage.getItem("userId"),
      ]);
      if (!token || !userId) {
        Alert.alert("Erro", "Faça o login novamente.");
        navigation.replace("Login");
        return;
      }

      const payload = {
        marca,
        modelo,
        ano: anoNumero,
        placa,
        usuarioId: userId,
      };

      if (editingVeiculosId) {
        await VeiculosApi.put(`/update-vehicle/${editingVeiculosId}`, payload, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        Alert.alert("Sucesso", "Veículo atualizado com sucesso");
      } else {
        await VeiculosApi.post(`/create-vehicle`, payload, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        Alert.alert("Sucesso", "Veículo salvo com sucesso");
      }

      limparForm();
      await carregarVeiculos("db");
    } catch (error) {
      console.warn("Erro ao salvar via API:", error?.response?.data || error.message);
      Alert.alert("Erro", "Não foi possível salvar o veículo no servidor.");
      // não migra para local
    }
  };

  // -------- Excluir --------
  const excluirVeiculo = async (id) => {
    try {
      if (provider === "google") {
        const current = await lsGetVehicles();
        const updated = current.filter((v) => v.id !== id);
        await lsSetVehicles(updated);
        setVeiculos(updated);
        Alert.alert("Sucesso", "Veículo excluído (local).");
        return;
      }

      // provider === "db" (sem fallback local)
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        Alert.alert("Erro", "Faça o login novamente.");
        navigation.replace("Login");
        return;
      }

      await VeiculosApi.delete(`/delete-vehicle/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      await carregarVeiculos("db");
      Alert.alert("Sucesso", "Veículo excluído com sucesso");
    } catch (error) {
      console.warn("Erro ao excluir via API:", error?.response?.data || error.message);
      Alert.alert("Erro", "Não foi possível excluir o veículo no servidor.");
      // não migra para local
    }
  };

  // -------- Editar / limpar --------
  const editarVeiculo = (item) => {
    setMarca(item.marca);
    setModelo(item.modelo);
    setAno(String(item.ano));
    setPlaca(item.placa);
    setEditingVeiculoId(item.id);
  };

  function limparForm() {
    setMarca("");
    setModelo("");
    setAno("");
    setPlaca("");
    setEditingVeiculoId(null);
  }

  const navegarParaLembretes = (veiculo) => {
    navigation.navigate("LembreteDeManutencao", { veiculoSelecionado: veiculo });
  };

  // -------- UI --------
  return (
    <View style={styles.bg}>
      <LinearGradient colors={["#3E6A85", "#3E6A85"]} style={styles.header}>
        <Text style={styles.title}>
          Veículos {provider === "google" ? "(Local)" : ""}
        </Text>
        <Icon name="car-outline" size={32} color="#fff" />
      </LinearGradient>

      <View style={styles.inputCard}>
        <TextInput
          style={styles.input}
          placeholder="Marca do veículo"
          placeholderTextColor="#3ba4e6"
          value={marca}
          onChangeText={setMarca}
        />
        <TextInput
          style={styles.input}
          placeholder="Modelo do veículo"
          placeholderTextColor="#3ba4e6"
          value={modelo}
          onChangeText={setModelo}
        />
        <TextInput
          style={styles.input}
          placeholder="Ano"
          placeholderTextColor="#3ba4e6"
          value={String(ano)}
          onChangeText={setAno}
          keyboardType="numeric"
        />
        <TextInput
          style={styles.input}
          placeholder="Placa - ABC1D23"
          placeholderTextColor="#3ba4e6"
          value={placa}
          onChangeText={setPlaca}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={salvarVeiculo}
          accessibilityLabel={editingVeiculosId ? "Atualizar veículo" : "Adicionar veículo"}
        >
          <Icon name={editingVeiculosId ? "update" : "plus"} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3E6A85" />
          <Text style={styles.loadingText}>Carregando veículos...</Text>
        </View>
      ) : veiculos.length === 0 ? (
        <Text style={styles.emptyText}>Nenhum veículo cadastrado</Text>
      ) : (
        <FlatList
          data={veiculos}
          keyExtractor={(item) => String(item.id)}
          style={styles.list}
          renderItem={({ item }) => (
            <LinearGradient colors={["#6EBBEB", "#3E6A85"]} style={styles.itemCard}>
              <View style={styles.itemRow}>
                <TouchableOpacity onPress={() => navegarParaLembretes(item)} style={{ marginRight: 10 }}>
                  <Icon name="car" size={28} color="#3E6A85" />
                </TouchableOpacity>

                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.marca}</Text>
                  {!!item.modelo && <Text style={styles.itemInfo}>Modelo: {item.modelo}</Text>}
                  {!!item.ano && <Text style={styles.itemInfo}>Ano: {item.ano}</Text>}
                  {!!item.placa && <Text style={styles.itemLembrete}>{item.placa}</Text>}
                </View>

                <TouchableOpacity onPress={() => editarVeiculo(item)} style={{ marginRight: 10 }}>
                  <Icon name="pencil-outline" size={24} color="#4CAF50" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => excluirVeiculo(item.id)}>
                  <Icon name="delete-outline" size={24} color="#f44336" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          )}
        />
      )}

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Inicio")}>
          <Icon name="home-outline" size={24} color="#3ba4e6" />
          <Text style={styles.tabText}>Início</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabItem]} onPress={() => navigation.navigate("Compras")}>
          <Icon name="cart-outline" size={24} color="#3ba4e6" />
          <Text style={[styles.tabText, { color: "#3ba4e6" }]}>Compras</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Veiculo")}>
          <Icon name="car" size={24} color="#3ba4e6" />
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
