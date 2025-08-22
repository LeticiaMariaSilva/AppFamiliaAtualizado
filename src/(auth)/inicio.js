// src/(auth)/inicio.js
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  ActivityIndicator,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
import { useIsFocused } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import styles from "../componentes/styleInicio";
import { InicioApi } from "../servicos/api";

export default function Inicio({ navigation }) {
  const isFocused = useIsFocused();

  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [nomeUsuario, setNomeUsuario] = useState("");
  const [atividades, setAtividades] = useState([]);

  useEffect(() => {
    if (isFocused) carregarDados();
  }, [isFocused]);

  async function carregarDados() {
    setLoading(true);
    setErro(null);

    try {
      // força DB se existir sessão válida
      const [token, userId, savedProvider] = await Promise.all([
        AsyncStorage.getItem("token"),
        AsyncStorage.getItem("userId"),
        AsyncStorage.getItem("provider"),
      ]);

      const provider = token && userId ? "db" : (savedProvider || "db");

      if (provider !== "db") {
        // Modo Google/outro: aqui não montamos timeline; só não quebrar a tela
        setNomeUsuario((await AsyncStorage.getItem("nomeUsuario")) || "Usuário");
        setAtividades([]);
        setLoading(false);
        return;
      }

      if (!token || !userId) {
        await AsyncStorage.multiRemove(["token", "userId", "nomeUsuario", "provider"]);
        Alert.alert("Sessão expirada", "Faça login novamente.");
        navigation.replace("Login");
        return;
      }

      // ---------------------------
      // 1) Usuário
      // ---------------------------
      let nome = "Usuário";
      try {
        const respUser = await InicioApi.get(`/user/${userId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        nome = respUser?.data?.name || "Usuário";
        await AsyncStorage.setItem("nomeUsuario", nome);
      } catch (e) {
        console.log("Falha /user/:id =>", e?.response?.data || e?.message);
        setErro("Não foi possível carregar seu perfil.");
      }
      setNomeUsuario(nome);

      // ---------------------------
      // 2) Tarefas (filtra do usuário)
      // ---------------------------
      let tarefas = [];
      try {
        const respTasks = await InicioApi.get(`/tasks`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const arr = Array.isArray(respTasks?.data) ? respTasks.data : [];
        tarefas = arr.filter((t) => {
          const owner =
            t.usuarioId ?? t.userId ?? t.ownerId ?? t.user?.id;
          return String(owner) === String(userId);
        });
      } catch (e) {
        console.log("Falha /tasks =>", e?.response?.data || e?.message);
        // mantém erro informativo mas segue
        setErro((prev) => prev || "Não foi possível carregar tarefas.");
      }

      // mapa de tarefas por id
      const tarefasMap = new Map();
      for (const t of tarefas) if (t?.id) tarefasMap.set(t.id, t);

      // ---------------------------
      // 3) Veículos (filtra do usuário)
      // ---------------------------
      let veiculos = [];
      try {
        const respVeic = await InicioApi.get(`/veiculos`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const arr = Array.isArray(respVeic?.data) ? respVeic.data : [];
        veiculos = arr.filter((v) => {
          const owner =
            v.usuarioId ?? v.userId ?? v.ownerId ?? v.user?.id;
          return String(owner) === String(userId);
        });
      } catch (e) {
        console.log("Falha /veiculos =>", e?.response?.data || e?.message);
        setErro((prev) => prev || "Não foi possível carregar veículos.");
      }

      const veiculosMap = new Map();
      for (const v of veiculos) if (v?.id) veiculosMap.set(v.id, v);

      // ---------------------------
      // 4) Atividades (filtra por pertencer ao usuário)
      // ---------------------------
      let actsApi = [];
      try {
        const respActs = await InicioApi.get(`/activities`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const arr = Array.isArray(respActs?.data) ? respActs.data : [];

        // mantém só atividades ligadas a recursos do usuário
        actsApi = arr.filter((a) => {
          if (a?.tarefaId && tarefasMap.has(a.tarefaId)) return true;
          if (a?.veiculoId && veiculosMap.has(a.veiculoId)) return true;
          // Se no futuro vier lista do usuário, aplique lógica similar:
          // if (a?.listaDeCompraId && listasMap.has(a.listaDeCompraId)) return true;
          return false;
        });
      } catch (e) {
        console.log("Falha /activities =>", e?.response?.data || e?.message);
        setErro((prev) => prev || "Não foi possível carregar atividades.");
      }

      // ---------------------------
      // 5) Montar timeline legível
      // ---------------------------
      const atividadesFromApi = actsApi.map((a) => {
        const tipo = a?.tipo || "TAREFA";
        const acao = (a?.acao || "ATUALIZADA").toUpperCase();

        // texto base
        let texto = `${nome} realizou uma atividade`;

        if (tipo === "TAREFA") {
          const t = a?.tarefaId ? tarefasMap.get(a.tarefaId) : null;
          const nomeTarefa = t?.descricao || t?.titulo || "Tarefa";
          const verbo =
            acao === "CONCLUIDA"
              ? "completou"
              : acao === "CRIADA"
              ? "criou"
              : "atualizou";
          texto = `${nome} ${verbo} "${nomeTarefa}"`;
        } else if (tipo === "VEICULO") {
          const v = a?.veiculoId ? veiculosMap.get(a.veiculoId) : null;
          const rotulo = v
            ? `${v.marca ? v.marca + " - " : ""}${v.modelo || "Veículo"}`
            : "um veículo";
          const verbo = acao === "CRIADA" ? "adicionou" : "atualizou";
          texto = `${nome} ${verbo} ${rotulo}`;
        } else if (tipo === "LISTA") {
          const verbo = acao === "CRIADA" ? "criou" : "atualizou";
          texto = `${nome} ${verbo} uma lista de compras`;
        }

        return {
          id: `act_${a.id}`,
          tipo,
          nomeTarefa: texto,
          dataHora: a?.dataHora || new Date().toISOString(),
        };
      });

      // (Opcional) também gera um “evento de criação” para cada veículo do usuário
      const atividadesVeiculos = veiculos.map((v) => ({
        id: `vei_${v.id}`,
        tipo: "VEICULO",
        nomeTarefa: `${nome} adicionou o ${v.marca ? v.marca + " - " : ""}${v.modelo || "Veículo"}`,
        dataHora: v?.atividades?.[0]?.dataHora || new Date().toISOString(),
      }));

      const timeline = [...atividadesFromApi, ...atividadesVeiculos].sort(
        (a, b) => new Date(b.dataHora) - new Date(a.dataHora)
      );

      setAtividades(timeline);
    } catch (e) {
      console.error("Erro geral no Início:", e?.message || e);
      setErro("Não foi possível carregar as informações.");
      setAtividades([]);
    } finally {
      setLoading(false);
    }
  }

  const formatTime = (dateString) => {
    if (!dateString) return "Data não disponível";
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "Data inválida";
    const hrs = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60));
    return hrs > 0 ? `${hrs}h atrás` : "Menos de 1h atrás";
  };

  const dotStyleByType = (tipo) => {
    switch (tipo) {
      case "TAREFA":
        return styles.activityDotGreen;
      case "LISTA":
      case "LISTA_DE_COMPRA":
        return styles.activityDotBlue;
      case "VEICULO":
      default:
        return styles.activityDotRed;
    }
  };

  return (
    <View style={styles.bg}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <Text style={styles.welcome}>
          Bem-vindo, <Text style={styles.name}>{nomeUsuario || "Usuário"}</Text>
        </Text>

        <LinearGradient colors={["#6EBBEB", "#3E6A85"]} style={styles.familyCard}>
          <View>
            <Text style={styles.familyTitle}>Família Silva</Text>
            <Text style={styles.familySubtitle}>4 membros ativos</Text>
          </View>
          <Image source={require("../imagens/icon_home.png")} style={styles.familyImage} />
        </LinearGradient>

        <View style={styles.menuRow}>
          <TouchableOpacity style={[styles.menuBtn, styles.menuBtnLight]} onPress={() => navigation.navigate("Compras")}>
            <Icon name="cart-outline" size={24} color="#ffffff" />
            <Text style={styles.menuText}>Lista de Compras</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuBtn, styles.menuBtnRed]} onPress={() => navigation.navigate("Veiculo")}>
            <Icon name="car-outline" size={24} color="#fff" />
            <Text style={[styles.menuText, { color: "#fff" }]}>Veículos</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.menuRow}>
          <TouchableOpacity style={[styles.menuBtn, styles.menuBtnGreen]} onPress={() => navigation.navigate("Tarefas")}>
            <Icon name="check-circle-outline" size={24} color="#fff" />
            <Text style={[styles.menuText, { color: "#fff" }]}>Tarefas</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuBtn, styles.menuBtnBlue]} onPress={() => navigation.navigate("Perfil")}>
            <Icon name="cog-outline" size={24} color="#fff" />
            <Text style={[styles.menuText2, { color: "#fff" }]}>Configurações</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.activitiesCard}>
          <View style={{ position: "relative" }}>
            <View style={styles.titleAccent} />
            <Text style={styles.activitiesTitle}>Atividades Recentes</Text>
          </View>

          {loading ? (
            <View style={{ paddingVertical: 20 }}>
              <ActivityIndicator size="large" />
              <Text style={styles.activityText}>Carregando atividades...</Text>
            </View>
          ) : erro ? (
            <Text style={styles.activityText}>Erro: {erro}</Text>
          ) : atividades.length === 0 ? (
            <Text style={styles.activityText}>Nenhuma atividade recente</Text>
          ) : (
            atividades.map((activity) => (
              <View key={activity.id} style={styles.activityItem}>
                <View style={dotStyleByType(activity.tipo)} />
                <View style={styles.activityContent}>
                  <Text style={styles.activityText}>{activity.nomeTarefa}</Text>
                  {activity.dataHora && (
                    <Text style={styles.activityTime}>{formatTime(activity.dataHora)}</Text>
                  )}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tabItem}>
          <Icon name="home" size={24} color="#3ba4e6" />
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
