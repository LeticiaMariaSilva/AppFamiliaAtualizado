import { useEffect, useState } from "react";
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
import styles from "../componentes/styleLembrete";
import { VeiculosApi } from "../servicos/api";

const LS_MAINT_PREFIX = "google_vehicle_maint:"; // + <vehicleId>

export default function LembreteDeManutencao({ route, navigation }) {
  const isFocused = useIsFocused();

  const veiculoSelecionado = route.params?.veiculoSelecionado || null;
  const selectedVehicleId = veiculoSelecionado?.id || null;

  const [provider, setProvider] = useState("db"); // "db" | "google"
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");
  const [valor, setValor] = useState("");
  const [editingId, setEditingId] = useState(null);

  const [lembretes, setLembretes] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // ------------------------
  // Utils: Local storage
  // ------------------------
  const keyForVehicle = (vehicleId) => `${LS_MAINT_PREFIX}${vehicleId}`;

  async function lsGetVehicleMaint(vehicleId) {
    const raw = await AsyncStorage.getItem(keyForVehicle(vehicleId));
    try {
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  async function lsSetVehicleMaint(vehicleId, arr) {
    await AsyncStorage.setItem(keyForVehicle(vehicleId), JSON.stringify(arr));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  // "DD/MM/AAAA" -> ISO (meia-noite local)
  function brDateToISO(d) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((d || "").trim());
    if (!m) return d; // devolve original se usuário já passou ISO
    const [_, dd, mm, yyyy] = m;
    const js = new Date(Number(yyyy), Number(mm) - 1, Number(dd), 0, 0, 0);
    if (isNaN(js.getTime())) return d;
    return js.toISOString();
  }

  // ------------------------
  // Carregar (DB ou LOCAL)
  // ------------------------
  useEffect(() => {
    if (!isFocused) return;
    (async () => {
      // força DB se houver sessão válida do backend
      const [token, userId, savedProvider] = await Promise.all([
        AsyncStorage.getItem("token"),
        AsyncStorage.getItem("userId"),
        AsyncStorage.getItem("provider"),
      ]);
      const finalProvider =
        token && userId ? "db" : (savedProvider === "google" ? "google" : "db");

      setProvider(finalProvider);
      await carregar(finalProvider);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, selectedVehicleId]);

  async function carregar(mode = provider) {
    setIsLoading(true);
    try {
      if (mode === "google") {
        if (selectedVehicleId) {
          const items = await lsGetVehicleMaint(selectedVehicleId);
          items.sort(
            (a, b) =>
              new Date(b.updatedAt || b.createdAt || 0) -
              new Date(a.updatedAt || a.createdAt || 0)
          );
          setLembretes(items);
        } else {
          // sem veículo escolhido no modo local, não há um "por usuário" local
          setLembretes([]);
        }
        return;
      }

      // ------- DB (API) -------
      const token = await AsyncStorage.getItem("token");
      const userId = await AsyncStorage.getItem("userId");

      if (!token || !userId) {
        Alert.alert("Erro", "Faça login novamente");
        navigation.replace("Login");
        return;
      }

      if (!selectedVehicleId) {
        // sua API não tem endpoint “por usuário” confiável aqui
        Alert.alert("Aviso", "Selecione um veículo para ver as manutenções.");
        setLembretes([]);
        return;
      }

      const response = await VeiculosApi.get(
        `/vehicle/${selectedVehicleId}/maintenance`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const dataArr = Array.isArray(response.data) ? response.data : [];
      setLembretes(dataArr);
    } catch (error) {
      console.error("Erro ao carregar manutenções:", error?.response?.data || error?.message);
      // NÃO cai para local no modo DB — mostra erro e zera a lista
      Alert.alert("Erro", "Não foi possível carregar as manutenções do servidor.");
      setLembretes([]);
    } finally {
      setIsLoading(false);
    }
  }

  // ------------------------
  // Salvar (create/update)
  // ------------------------
  const salvarLembrete = async () => {
    if (!descricao.trim() || !data.trim() || !valor.trim()) {
      Alert.alert("Erro", "Preencha todos os campos");
      return;
    }

    const effectiveVehicleId =
      selectedVehicleId ||
      (editingId
        ? lembretes.find((l) => l.id === editingId)?.vehicleId ||
          lembretes.find((l) => l.id === editingId)?.veiculoId
        : null);

    if (!effectiveVehicleId) {
      Alert.alert("Erro", "Selecione um veículo para criar o lembrete");
      return;
    }

    const payload = {
      descricao: descricao.trim(),
      data: brDateToISO(data), // converte DD/MM/AAAA -> ISO
      valor: parseFloat(valor) || 0,
    };

    try {
      if (provider === "google") {
        const current = await lsGetVehicleMaint(effectiveVehicleId);
        if (editingId) {
          const updated = current.map((l) =>
            l.id === editingId
              ? { ...l, ...payload, updatedAt: nowIso() }
              : l
          );
          await lsSetVehicleMaint(effectiveVehicleId, updated);
          Alert.alert("Sucesso", "Lembrete atualizado (local)!");
        } else {
          const novo = {
            id: `m_${Date.now()}`,
            ...payload,
            vehicleId: effectiveVehicleId,
            createdAt: nowIso(),
            updatedAt: nowIso(),
          };
          await lsSetVehicleMaint(effectiveVehicleId, [novo, ...current]);
          Alert.alert("Sucesso", "Lembrete criado (local)!");
        }
        limparForm();
        await carregar("google");
        return;
      }

      // ------- DB (API) -------
      const token = await AsyncStorage.getItem("token");
      if (!token) {
        Alert.alert("Erro", "Faça login novamente");
        navigation.replace("Login");
        return;
      }

      if (editingId) {
        // sua docs: PUT /maintenance/:id
        await VeiculosApi.put(`/maintenance/${editingId}`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        Alert.alert("Sucesso", "Lembrete atualizado com sucesso!");
      } else {
        // sua docs: POST /vehicle/:id/maintenance
        await VeiculosApi.post(`/vehicle/${effectiveVehicleId}/maintenance`, payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        Alert.alert("Sucesso", "Lembrete criado com sucesso!");
      }

      limparForm();
      await carregar("db");
    } catch (error) {
      console.error("Erro ao salvar via API:", error?.response?.data || error?.message);
      // NÃO migra para local no modo DB — mostra erro
      Alert.alert("Erro", "Não foi possível salvar o lembrete no servidor.");
    }
  };

  // ------------------------
  // Excluir
  // ------------------------
  const deletarLembrete = (lembreteId, vehicleIdParam) => {
    Alert.alert("Confirmar exclusão", "Deseja realmente excluir este lembrete?", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: async () => {
          const effectiveVehicleId =
            vehicleIdParam ||
            selectedVehicleId ||
            lembretes.find((l) => l.id === lembreteId)?.vehicleId ||
            lembretes.find((l) => l.id === lembreteId)?.veiculoId;

          if (!effectiveVehicleId && provider === "google") {
            Alert.alert("Erro", "Veículo do lembrete não encontrado.");
            return;
          }

          try {
            if (provider === "google") {
              const current = await lsGetVehicleMaint(effectiveVehicleId);
              const updated = current.filter((l) => l.id !== lembreteId);
              await lsSetVehicleMaint(effectiveVehicleId, updated);
              Alert.alert("Sucesso", "Lembrete excluído (local)!");
              await carregar("google");
              return;
            }

            const token = await AsyncStorage.getItem("token");
            if (!token) {
              Alert.alert("Erro", "Faça login novamente");
              navigation.replace("Login");
              return;
            }

            // docs: DELETE /maintenance/:id
            await VeiculosApi.delete(`/maintenance/${lembreteId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            Alert.alert("Sucesso", "Lembrete excluído com sucesso!");
            await carregar("db");
          } catch (error) {
            console.error("Erro ao excluir via API:", error?.response?.data || error?.message);
            // NÃO migra para local no modo DB
            Alert.alert("Erro", "Não foi possível excluir o lembrete no servidor.");
          }
        },
      },
    ]);
  };

  // ------------------------
  // Editar (preenche form)
  // ------------------------
  const editarLembrete = (item) => {
    setDescricao(item.descricao || "");
    // se vier ISO, mostre como veio (ou adapte para BR se desejar)
    setData(item.data || "");
    setValor(item.valor != null ? String(item.valor) : "");
    setEditingId(item.id);
  };

  function limparForm() {
    setDescricao("");
    setData("");
    setValor("");
    setEditingId(null);
  }

  // ------------------------
  // UI
  // ------------------------
  const headerTitle = veiculoSelecionado
    ? `${veiculoSelecionado.marca} ${veiculoSelecionado.modelo}`
    : "Lembretes de Manutenção";

  return (
    <View style={styles.bg}>
      <LinearGradient colors={["#3E6A85", "#3E6A85"]} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={24} color="#FFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {headerTitle} {provider === "google" ? "(Local)" : ""}
        </Text>
        <View style={styles.headerSpacer} />
      </LinearGradient>

      <View style={styles.inputCard}>
        {veiculoSelecionado && (
          <View style={styles.veiculoInfo}>
            <Icon name="car" size={20} color="#3E6A85" />
            <Text style={styles.veiculoInfoText}>
              {veiculoSelecionado.marca} {veiculoSelecionado.modelo} - {veiculoSelecionado.ano}
            </Text>
            {!!veiculoSelecionado.placa && (
              <Text style={styles.placaText}>{veiculoSelecionado.placa}</Text>
            )}
          </View>
        )}

        <TextInput
          style={styles.input}
          placeholder="Descrição (ex: Troca de óleo)"
          placeholderTextColor="#3ba4e6"
          value={descricao}
          onChangeText={setDescricao}
        />
        <TextInput
          style={styles.input}
          placeholder="Data (DD/MM/AAAA)"
          placeholderTextColor="#3ba4e6"
          value={data}
          onChangeText={setData}
        />
        <TextInput
          style={styles.input}
          placeholder="Valor estimado"
          placeholderTextColor="#3ba4e6"
          keyboardType="numeric"
          value={valor}
          onChangeText={setValor}
        />
        <TouchableOpacity
          style={styles.saveButton}
          onPress={salvarLembrete}
          disabled={isLoading}
          accessibilityLabel={editingId ? "Atualizar lembrete" : "Adicionar lembrete"}
        >
          <Text style={styles.saveButtonText}>
            <Icon name={editingId ? "update" : "plus"} size={24} color="#fff" />
          </Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3E6A85" />
          <Text style={styles.loadingText}>Carregando lembretes...</Text>
        </View>
      ) : lembretes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {veiculoSelecionado
              ? "Nenhum lembrete cadastrado para este veículo"
              : (provider === "db"
                  ? "Selecione um veículo para listar as manutenções"
                  : "Nenhum lembrete cadastrado")}
          </Text>
          <Text style={styles.emptySubText}>
            {veiculoSelecionado
              ? "Crie lembretes de manutenção para não esquecer dos cuidados importantes"
              : (provider === "db"
                  ? "Use a tela de Veículos para escolher um veículo"
                  : "Crie lembretes de manutenção para seus veículos")}
          </Text>
        </View>
      ) : (
        <FlatList
          data={lembretes}
          keyExtractor={(item) => String(item.id)}
          style={styles.list}
          renderItem={({ item }) => (
            <LinearGradient colors={["#6EBBEB", "#3E6A85"]} style={styles.itemCard}>
              <View style={styles.itemRow}>
                <Icon name="wrench" size={28} color="#3E6A85" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.descricao}</Text>
                  {!!item.data && <Text style={styles.itemInfo}>📅 Data: {item.data}</Text>}
                  {item.valor != null && (
                    <Text style={styles.itemInfo}>
                      💰 Valor: R$ {Number(item.valor).toFixed(2)}
                    </Text>
                  )}
                </View>

                <TouchableOpacity style={{ marginRight: 10 }} onPress={() => editarLembrete(item)}>
                  <Icon name="pencil-outline" size={24} color="#4CAF50" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => deletarLembrete(item.id, item.vehicleId || item.veiculoId)}
                >
                  <Icon name="delete-outline" size={24} color="#f44336" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          )}
        />
      )}
    </View>
  );
}
