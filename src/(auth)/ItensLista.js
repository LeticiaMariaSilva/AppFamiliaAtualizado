import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import styles from "../componentes/styleCompras";
import { InicioApi } from "../servicos/api";

const API_BASE = (InicioApi?.defaults?.baseURL || "https://api-gerenciador-familiar.vercel.app").replace(/\/+$/,"");

// tema
const THEME = {
  Mercado:   { bg: ["#24b766", "#24b766"], accent: "#24b766", icon: "cart-outline" },
  "Farmácia":{ bg: ["#0c97ee", "#0c97ee"], accent: "#0c97ee", icon: "medical-bag" },
  Padaria:   { bg: ["#f58b12", "#f58b12"], accent: "#f58b12", icon: "bread-slice-outline" },
  "Açougue": { bg: ["#ee3528", "#ee3528"], accent: "#ee3528", icon: "food-steak" },
  Outros:    { bg: ["#3ba4e6", "#3ba4e6"], accent: "#3ba4e6", icon: "shape-outline" },
};

const normalize = (tipo) => {
  const t = String(tipo || "").toUpperCase();
  if (t === "MERCADO") return "Mercado";
  if (t === "FARMACIA") return "Farmácia";
  if (t === "PADARIA") return "Padaria";
  if (t === "ACOUGUE" || t === "AÇOUGUE" || t === "ACOUQUE") return "Açougue";
  return "Outros";
};

const nomeToEnum = (nome) => {
  switch (normalize(nome)) {
    case "Mercado": return "MERCADO";
    case "Farmácia": return "FARMACIA";
    case "Padaria": return "PADARIA";
    case "Açougue": return "ACOUGUE";
    default: return "OUTROS";
  }
};

// valida se a lista é do usuário tentando ler itens
async function verifyListOwnership(listId, token) {
  try {
    const res = await fetch(`${API_BASE}/list-items/${listId}`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

// cria lista e retorna id
async function createList(tipoEnum, token) {
  const res = await fetch(`${API_BASE}/create-list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ tipo: tipoEnum }),
  });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new Error("Sessão expirada.");
  if (!res.ok) throw new Error(text || "Falha ao criar lista.");
  let obj; try { obj = JSON.parse(text); } catch { obj = {}; }
  const id = obj?.id || obj?.lista?.id || obj?.data?.id || obj?.result?.id;
  if (!id) throw new Error("API não retornou id da nova lista.");
  return String(id);
}

export default function ItensLista({ route, navigation }) {
  // Nunca usamos listaId da rota — vamos garantir por usuário+tipo
  const { tipo, listasFromApi = [] } = route.params || {};
  const nomeCategoria = useMemo(() => normalize(tipo), [tipo]);
  const theme = THEME[nomeCategoria] || THEME.Outros;
  const tipoEnum = useMemo(() => nomeToEnum(tipo || "Outros"), [tipo]);

  const [itens, setItens] = useState([]);
  const [novoItem, setNovoItem] = useState("");
  const [quantidade, setQuantidade] = useState("1");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("");
  const [currentListId, setCurrentListId] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const tk = await AsyncStorage.getItem("token");
        const uid = await AsyncStorage.getItem("userId");
        if (!tk || !uid) {
          Alert.alert("Sessão expirada", "Faça login novamente.");
          navigation.replace("Login");
          return;
        }
        setToken(tk);
        setUserId(uid);

        const headers = { Accept: "application/json", Authorization: `Bearer ${tk}` };

        // 1) Escolhe/valida uma lista **do usuário** desse tipo:
        let validListId = "";
        // prioriza as listas validadas recebidas da tela
        const candidatas = listasFromApi.filter(
          (l) => String(l?.tipo || "").toUpperCase() === tipoEnum
        );

        if (candidatas.length) {
          for (const l of candidatas) {
            const id = String(l?.id || "").trim();
            if (!id) continue;
            const ok = await verifyListOwnership(id, tk);
            if (ok) { validListId = id; break; }
          }
        }

        // se não achou, tenta varrer /lists e validar
        if (!validListId) {
          try {
            const resp = await fetch(`${API_BASE}/lists`, { headers });
            const text = await resp.text();
            if (resp.ok) {
              let data; try { data = JSON.parse(text); } catch { data = []; }
              const all = Array.isArray(data) ? data : Array.isArray(data?.listas) ? data.listas : [];
              for (const l of all) {
                if (String(l?.tipo || "").toUpperCase() !== tipoEnum) continue;
                const id = String(l?.id || "").trim();
                if (!id) continue;
                const ok = await verifyListOwnership(id, tk);
                if (ok) { validListId = id; break; }
              }
            }
          } catch {}
        }

        // se ainda não existe pro usuário → cria
        if (!validListId) {
          validListId = await createList(tipoEnum, tk);
        }
        setCurrentListId(validListId);

        // 2) Carrega itens dessa lista
        const resItems = await fetch(`${API_BASE}/list-items/${validListId}`, { headers });
        const txtItems = await resItems.text();
        if (!resItems.ok) {
          setItens([]);
        } else {
          let data;
          try { data = JSON.parse(txtItems); } catch { data = []; }
          const arr = Array.isArray(data) ? data
            : Array.isArray(data?.items) ? data.items
            : Array.isArray(data?.data) ? data.data
            : (data && data.id) ? [data] : [];
          const mapped = arr.map((it) => ({
            id: it.id,
            descricao: it.descricao ?? "",
            quantidade: Number(it.quantidade ?? 1),
            comprado: Boolean(it.comprado),
            listaId: it.listaId ?? validListId,
          }));
          setItens(mapped);
        }
      } catch (e) {
        console.log("LOAD itens error:", e?.message || e);
        setItens([]);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  const adicionarItem = async () => {
    if (!novoItem.trim()) {
      Alert.alert("Aviso", "Digite o nome do item.");
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const qty = parseInt(quantidade, 10) || 1;

      // Garante que currentListId pertence ao usuário (validação extra)
      let listId = currentListId;
      if (!listId || !(await verifyListOwnership(listId, token))) {
        listId = await createList(tipoEnum, token);
        setCurrentListId(listId);
      }

      // tenta adicionar
      let res = await fetch(`${API_BASE}/add-item-to-list`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          listaId: listId,
          descricao: novoItem.trim(),
          quantidade: qty,
        }),
      });
      let text = await res.text();
      if (!res.ok) {
        // se a API disser 404 de lista não encontrada, criamos outra e tentamos 1x
        if (res.status === 404) {
          listId = await createList(tipoEnum, token);
          setCurrentListId(listId);
          res = await fetch(`${API_BASE}/add-item-to-list`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              listaId: listId,
              descricao: novoItem.trim(),
              quantidade: qty,
            }),
          });
          text = await res.text();
        }
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} - ${text}`);

      let created; try { created = JSON.parse(text); } catch { created = null; }
      const safe = created && created.id ? {
        id: created.id,
        descricao: created.descricao ?? novoItem.trim(),
        quantidade: Number(created.quantidade ?? qty),
        comprado: Boolean(created.comprado),
        listaId: created.listaId ?? listId,
      } : {
        id: Date.now().toString(),
        descricao: novoItem.trim(),
        quantidade: qty,
        comprado: false,
        listaId: listId,
      };

      setItens((prev) => [safe, ...prev]);
      setNovoItem("");
      setQuantidade("1");
    } catch (error) {
      console.error("Erro ao adicionar item:", error);
      Alert.alert("Erro", error?.message || "Não foi possível adicionar.");
    } finally {
      setSaving(false);
    }
  };

  const toggleComprado = async (item) => {
    try {
      const res = await fetch(`${API_BASE}/list-items/${item.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ comprado: !item.comprado }),
      });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(`HTTP ${res.status} - ${msg}`);
      }
      setItens((prev) => prev.map((it) => it.id === item.id ? { ...it, comprado: !it.comprado } : it));
    } catch (error) {
      console.error("Erro ao atualizar item:", error);
      Alert.alert("Erro", `Não foi possível atualizar. ${error.message || ""}`);
    }
  };

  if (loading) {
    return (
      <View style={[styles.bg, { justifyContent: "center", alignItems: "center" }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  return (
    <View style={styles.bg}>
      <LinearGradient
        colors={theme.bg}
        style={{
          marginHorizontal: 20,
          marginBottom: 10,
          borderRadius: 16,
          elevation: 3,
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 12,
        }}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ paddingHorizontal: 12 }}>
          <Icon name="arrow-left" size={28} color="#fff" />
        </TouchableOpacity>

        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={[styles.title, { textAlign: "center", color: "#fff" }]}>
            {nomeCategoria ? `Itens - ${nomeCategoria}` : "Itens da Lista"}
          </Text>
        </View>

        <View style={{ width: 40 }} />
      </LinearGradient>

      {/* Input */}
      <View style={{ flexDirection: "row", paddingHorizontal: 20, marginVertical: 15 }}>
        <TextInput
          style={{
            flex: 1, borderWidth: 1, borderColor: "#ccc", borderRadius: 10,
            paddingHorizontal: 10, marginRight: 10, backgroundColor: "#fff",
          }}
          placeholder="Novo item..."
          value={novoItem}
          onChangeText={setNovoItem}
        />
        <TextInput
          style={{
            width: 60, borderWidth: 1, borderColor: "#ccc", borderRadius: 10,
            textAlign: "center", marginRight: 10, backgroundColor: "#fff",
          }}
          keyboardType="numeric"
          value={quantidade}
          onChangeText={setQuantidade}
        />
        <TouchableOpacity
          style={{ backgroundColor: theme.accent, borderRadius: 10, padding: 10 }}
          onPress={adicionarItem}
          disabled={saving}
        >
          <Icon name="plus" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Lista */}
      {itens.length === 0 ? (
        <View style={{ paddingHorizontal: 20 }}>
          <Text style={{ color: "#555" }}>Nenhum item nesta lista ainda.</Text>
        </View>
      ) : (
        <FlatList
          data={itens}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 20 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: "#fff",
                padding: 12,
                borderRadius: 12,
                marginBottom: 10,
                elevation: 2,
              }}
              onPress={() => toggleComprado(item)}
            >
              <Icon
                name={item.comprado ? "checkbox-marked" : "checkbox-blank-outline"}
                size={28}
                color={item.comprado ? theme.accent : "#aaa"}
              />
              <View style={{ marginLeft: 15, flex: 1 }}>
                <Text
                  style={{
                    fontSize: 16,
                    textDecorationLine: item.comprado ? "line-through" : "none",
                    color: item.comprado ? "#888" : "#000",
                  }}
                >
                  {item.descricao}
                </Text>
                <Text style={{ fontSize: 14, color: "#555" }}>
                  Quantidade: {item.quantidade}
                </Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}
