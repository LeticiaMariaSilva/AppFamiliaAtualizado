import { View, Text, TextInput, TouchableOpacity, Image, SafeAreaView } from "react-native";
import { MaterialIcons, FontAwesome } from "@expo/vector-icons";
import styles from "../componentes/styleLogin"; // Importando os estilos

export default function Login({ navigation }) {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.topBackground}>
        <Image
          source={require("../imagens/perfilLogin.png")}
          style={styles.avatar}
        />
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
          />
        </View>
        <View style={styles.inputContainer}>
          <MaterialIcons name="lock" size={22} color="#4a90e2" style={styles.icon} />
          <TextInput
            placeholder="Senha"
            style={styles.input}
            secureTextEntry
          />
        </View>
        <TouchableOpacity style={styles.forgotButton}>
          <Text style={styles.forgotText}>Esqueceu senha?</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.loginButton} onPress={() => navigation.navigate('Inicio')}>
          <Text style={styles.loginButtonText}>Entrar</Text>
        </TouchableOpacity>
        <Text style={styles.orText}>Ou</Text>
        <View style={styles.socialContainer}>
          <TouchableOpacity style={styles.socialButton}>
            <Image
              source={require("../imagens/logoGoogle.png")}
              style={styles.socialIcon}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.socialButton}>
            <Image
                source={require("../imagens/logos_facebook.png")}
                style={styles.socialIcon}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.registerContainer}>
          <Text style={styles.registerText}>Não tem conta? </Text>
          <TouchableOpacity>
            <Text style={styles.registerLink} onPress={() => navigation.navigate('Cadastro')}>Cadastra-se</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}