import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import style from "../componentes/styleHome";

export default function Home({ navigation }) {
  const onStart = async () => {
    // (Opcional, mas recomendado para evitar pular direto p/ app por sessão antiga)
    await AsyncStorage.multiRemove([
      "token",
      "userId",
      "provider",
      "google_profile_override",
      "userAvatar",
    ]);
    navigation.navigate("Login");
  };

  return (
    <View style={style.container}>
      <Image
        source={require("../imagens/imageTasks.png")}
        style={style.imageTasks}
      />

      <View style={style.header}>
        <View style={style.TextContainer}>
          <Text style={style.Title}>
            Ajude sua família a organizar as tarefas!
          </Text>
          <Text style={style.SubTitle}>
            Organizar tarefas familiares melhora a rotina e facilita a
            colaboração, tornando o dia a dia mais leve e produtivo!
          </Text>
        </View>

        <View style={style.startButtonContainer}>
          <TouchableOpacity style={style.startButton} onPress={onStart}>
            <Text style={style.startButtonText}>COMEÇAR</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
