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
import { useIsFocused } from "@react-navigation/native";
import styles from "../componentes/styleTarefas";
import { TarefasApi } from "../servicos/api";

const LS_TASKS_KEY = "google_tasks";

export default function Tarefas({ route, navigation }) {
  const [descricao, setDescricao] = useState("");
  const [tarefas, setTarefas] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [provider, setProvider] = useState("db"); // "db" | "google"
  const isFocused = useIsFocused();

  // --- helpers local (modo Google) ---
  async function lsGetTasks() {
    const raw = await AsyncStorage.getItem(LS_TASKS_KEY);
    try {
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }
  async function lsSetTasks(list) {
    await AsyncStorage.setItem(LS_TASKS_KEY, JSON.stringify(list));
  }
  const nowIso = () => new Date().toISOString();

  // Preenche campos se veio algo para edição pela rota
  useEffect(() => {
    if (route.params?.itensTarefas) {
      setDescricao(route.params.itensTarefas.descricao || "");
      setEditingTaskId(route.params.itensTarefas.id || null);
    } else {
      setDescricao("");
      setEditingTaskId(null);
    }
  }, [route.params?.itensTarefas]);

  // Determina provider corretamente e carrega
  useEffect(() => {
    if (!isFocused) return;
    (async () => {
      const [token, userId, savedProvider] = await Promise.all([
        AsyncStorage.getItem("token"),
        AsyncStorage.getItem("userId"),
        AsyncStorage.getItem("provider"),
      ]);

      // Se tem sessão do banco, força provider=db e corrige o storage
      const finalProvider =
        token && userId ? "db" : savedProvider === "google" ? "google" : "db";
      if (finalProvider === "db" && savedProvider !== "db") {
        await AsyncStorage.setItem("provider", "db");
      }

      setProvider(finalProvider);
      await carregarTarefas(finalProvider);
    })();
  }, [isFocused]);

  // -----------------------------
  // BUSCAR TAREFAS
  // -----------------------------
  const carregarTarefas = async (mode = provider) => {
    setIsLoading(true);
    try {
      // ---- modo Google (local) ----
      if (mode === "google") {
        const list = await lsGetTasks();
        list.sort(
          (a, b) =>
            new Date(b.updatedAt || b.createdAt || 0) -
            new Date(a.updatedAt || a.createdAt || 0)
        );
        setTarefas(list);
        return;
      }

      // ---- modo DB (API) ----
      const [token, userId] = await Promise.all([
        AsyncStorage.getItem("token"),
        AsyncStorage.getItem("userId"),
      ]);

      if (!token || !userId) {
        // Se não tem sessão DB mas o provider salvo é google, mostra local;
        // senão manda logar.
        const savedProvider = (await AsyncStorage.getItem("provider")) || "db";
        if (savedProvider === "google") {
          const list = await lsGetTasks();
          setTarefas(list);
          return;
        }
        Alert.alert("Erro", "Faça login novamente.");
        navigation.replace("Login");
        return;
      }

      const response = await TarefasApi.get(`/tasks/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setTarefas(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.warn("Erro ao carregar tarefas (DB):", error?.response?.data || error.message);
      // NÃO migra para local quando provider é DB
      setTarefas([]);
      Alert.alert("Erro", "Não foi possível carregar as tarefas do servidor.");
    } finally {
      setIsLoading(false);
    }
  };

  // -----------------------------
  // SALVAR (CRIAR/EDITAR)
  // -----------------------------
  const salvarTarefa = async () => {
    if (!descricao.trim()) {
      Alert.alert("Erro", "A descrição da tarefa não pode estar vazia.");
      return;
    }

    try {
      // ---- modo Google (local) ----
      if (provider === "google") {
        const current = await lsGetTasks();
        if (editingTaskId) {
          const updated = current.map((t) =>
            t.id === editingTaskId
              ? { ...t, descricao: descricao.trim(), updatedAt: nowIso() }
              : t
          );
          await lsSetTasks(updated);
          Alert.alert("Sucesso", "Tarefa atualizada (local).");
        } else {
          const nova = {
            id: `t_${Date.now()}`,
            descricao: descricao.trim(),
            status: false,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
          await lsSetTasks([nova, ...current]);
          Alert.alert("Sucesso", "Tarefa salva (local).");
        }
        setDescricao("");
        setEditingTaskId(null);
        await carregarTarefas("google");
        return;
      }

      // ---- modo DB (API) ----
      const token = await AsyncStorage.getItem("token");
      const userId = await AsyncStorage.getItem("userId");

      if (!token || !userId) {
        Alert.alert("Erro", "Faça login novamente.");
        navigation.replace("Login");
        return;
      }

      if (editingTaskId) {
        await TarefasApi.put(
          `/update-task/${editingTaskId}`,
          { descricao: descricao.trim(), status: false },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );
        Alert.alert("Sucesso", "Tarefa atualizada com sucesso");
      } else {
        await TarefasApi.post(
          "/create-task",
          { descricao: descricao.trim() },
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );
        Alert.alert("Sucesso", "Tarefa salva com sucesso");
      }

      setDescricao("");
      setEditingTaskId(null);
      await carregarTarefas("db");
    } catch (error) {
      console.warn("Erro ao salvar tarefa (DB):", error?.response?.data || error.message);
      // NÃO migra para local quando provider é DB
      Alert.alert("Erro", "Não foi possível salvar a tarefa no servidor.");
    }
  };

  // -----------------------------
  // MARCAR / DESMARCAR FEITO
  // -----------------------------
  const marcarFeito = async (id, statusAtual, descricaoAtual) => {
    try {
      if (provider === "google") {
        const current = await lsGetTasks();
        const updated = current.map((t) =>
          t.id === id ? { ...t, status: !t.status, updatedAt: nowIso() } : t
        );
        await lsSetTasks(updated);
        setTarefas(updated);
        return;
      }

      const token = await AsyncStorage.getItem("token");
      const userId = await AsyncStorage.getItem("userId");
      if (!token || !userId) {
        Alert.alert("Erro", "Faça login novamente.");
        navigation.replace("Login");
        return;
      }

      await TarefasApi.put(
        `/update-task/${id}`,
        { descricao: descricaoAtual, status: !statusAtual },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      carregarTarefas("db");
    } catch (error) {
      console.warn("Erro ao atualizar tarefa (DB):", error?.response?.data || error.message);
      Alert.alert("Erro", "Não foi possível atualizar a tarefa no servidor.");
    }
  };

  // -----------------------------
  // EXCLUIR
  // -----------------------------
  const excluirTarefa = async (id) => {
    try {
      if (provider === "google") {
        const current = await lsGetTasks();
        const updated = current.filter((t) => t.id !== id);
        await lsSetTasks(updated);
        setTarefas(updated);
        Alert.alert("Sucesso", "Tarefa excluída (local).");
        return;
      }

      const token = await AsyncStorage.getItem("token");
      const userId = await AsyncStorage.getItem("userId");
      if (!token || !userId) {
        Alert.alert("Erro", "Faça login novamente.");
        navigation.replace("Login");
        return;
      }

      await TarefasApi.delete(`/delete-task/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      carregarTarefas("db");
      Alert.alert("Sucesso", "Tarefa excluída com sucesso");
    } catch (error) {
      console.warn("Erro ao excluir tarefa (DB):", error?.response?.data || error.message);
      Alert.alert("Erro", "Não foi possível excluir a tarefa no servidor.");
    }
  };

  return (
    <View style={styles.bg}>
      <LinearGradient colors={["#66bb6a", "#66bb6a"]} style={styles.header}>
        <Text style={styles.title}>Tarefas</Text>
        <Icon name="check-circle-outline" size={32} color="#fff" />
      </LinearGradient>

      <View style={styles.inputArea}>
        <TextInput
          style={styles.input}
          placeholder="Nova tarefa..."
          placeholderTextColor="#3ba4e6"
          value={descricao}
          onChangeText={setDescricao}
          accessibilityLabel="Digite uma nova tarefa"
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={salvarTarefa}
          accessibilityLabel={editingTaskId ? "Atualizar tarefa" : "Adicionar tarefa"}
        >
          <Icon name={editingTaskId ? "update" : "plus"} size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#66bb6a" />
          <Text style={styles.loadingText}>Carregando tarefas...</Text>
        </View>
      ) : tarefas.length === 0 ? (
        <Text style={styles.emptyText}>Nenhuma tarefa disponível</Text>
      ) : (
        <FlatList
          data={tarefas}
          keyExtractor={(item) => String(item.id)}
          style={styles.list}
          renderItem={({ item }) => (
            <LinearGradient
              colors={item.status ? ["#90caf9", "#e3f2fd"] : ["#6EBBEB", "#3ba4e6"]}
              style={styles.itemCard}
            >
              <View style={styles.itemRow}>
                <TouchableOpacity
                  onPress={() => marcarFeito(item.id, item.status, item.descricao)}
                  accessibilityLabel={
                    item.status ? "Desmarcar tarefa" : "Marcar tarefa como concluída"
                  }
                >
                  <Icon
                    name={item.status ? "check-circle" : "checkbox-blank-circle-outline"}
                    size={26}
                    color={item.status ? "#4caf50" : "#3ba4e6"}
                  />
                </TouchableOpacity>

                <Text
                  style={[
                    styles.itemText,
                    item.status && { textDecorationLine: "line-through", color: "#888" },
                  ]}
                >
                  {item.descricao}
                </Text>

                <TouchableOpacity
                  onPress={() => {
                    setDescricao(item.descricao);
                    setEditingTaskId(item.id);
                  }}
                  accessibilityLabel="Editar tarefa"
                >
                  <Icon name="pencil-outline" size={22} color="#4caf50" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => excluirTarefa(item.id)}
                  accessibilityLabel="Excluir tarefa"
                >
                  <Icon name="delete-outline" size={22} color="#f44336" />
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
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Compras")}>
          <Icon name="cart-outline" size={24} color="#3ba4e6" />
          <Text style={styles.tabText}>Compras</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Veiculo")}>
          <Icon name="car-outline" size={24} color="#3ba4e6" />
          <Text style={styles.tabText}>Veículos</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tabItem} onPress={() => navigation.navigate("Tarefas")}>
          <Icon name="check-circle" size={24} color="#3ba4e6" />
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
