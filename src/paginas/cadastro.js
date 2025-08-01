import { View, Text, TextInput, TouchableOpacity, Image, SafeAreaView } from "react-native";
import styles from '../componentes/styleCadastro';
import { MaterialIcons, FontAwesome, FontAwesome6 } from "@expo/vector-icons";

export default function Cadastro({ navigation}) {
 return (
     <SafeAreaView style={styles.container}>
       <View style={styles.topBackground}>
         <Image
           source={require("../imagens/User_CriarConta.png")}
           style={styles.avatar}
         />
       </View>
       <View style={styles.content}>
         <Text style={styles.title}>Criar conta</Text>
         <Text style={styles.subtitle}>Preencha os dados abaixo</Text>
         <View style={styles.inputContainer}>
           <FontAwesome6 name="user-large" size={18} color="#4a90e2"  style={styles.icon}/>
           <TextInput
             placeholder="Nome"
             style={styles.input}
             keyboardType="nome"
             autoCapitalize="none"
           />
         </View>
         <View style={styles.inputContainer}>
           <MaterialIcons name="email" size={22} color="#4a90e2" style={styles.icon} />
           <TextInput
             placeholder="Email"
             style={styles.input}
             keyboardType="email"
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
         <TouchableOpacity style={styles.loginButton}>
           <Text style={styles.loginButtonText}>Criar conta</Text>
         </TouchableOpacity>
         <View style={styles.registerContainer}>
           <Text style={styles.registerText}>Já tem uma conta? </Text>
           <TouchableOpacity>
             <Text style={styles.registerLink} onPress={() => navigation.navigate('Login')}>Entrar</Text>
           </TouchableOpacity>
         </View>
       </View>
     </SafeAreaView>
   );
}