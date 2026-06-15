import { useState } from 'react';
import { ActivityIndicator, SafeAreaView, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

type Role = 'reportante' | 'voluntario' | 'patrocinador';

export default function LoginScreen() {
  const [selectedRole, setSelectedRole] = useState<Role>('reportante');

  // Estados preparados para conectar con FastAPI
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [extraData, setExtraData] = useState('');
  const [orgType, setOrgType] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = () => {
    setIsLoading(true);
    console.log(`Payload preparado para rol: ${selectedRole}`);
    setTimeout(() => setIsLoading(false), 1000); 
  };

  return (
    <SafeAreaView className="flex-1 bg-brand-lightBg">
      <ScrollView contentContainerStyle={{ padding: 24, flexGrow: 1, justifyContent: 'center' }}>
        
        {/* Encabezado */}
        <View className="items-center mb-8">
          <Text className="text-primary-500 font-bold text-4xl mb-2">PawAlert</Text>
          <Text className="text-text-gray text-base text-center px-4">
            Plataforma Inteligente de Coordinación de Rescate Animal
          </Text>
        </View>

        {/* Selector de Rol */}
        <View className="flex-row bg-brand-white p-1 rounded-card mb-8 shadow-sm">
          {(['reportante', 'voluntario', 'patrocinador'] as Role[]).map((role) => (
            <TouchableOpacity
              key={role}
              onPress={() => setSelectedRole(role)}
              className={`flex-1 py-2.5 rounded-[8px] items-center ${
                selectedRole === role ? 'bg-primary-500' : 'bg-transparent'
              }`}
            >
              <Text 
                className={`font-semibold capitalize text-sm ${
                  selectedRole === role ? 'text-brand-white' : 'text-text-gray'
                }`}
              >
                {role}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Formularios */}
        <View className="bg-brand-white p-6 rounded-card shadow-sm border border-brand-lightBg">
          
          {selectedRole === 'reportante' && (
            <View>
              <Text className="text-text-dark font-bold text-xl mb-4">Acceso Rápido</Text>
              <Text className="text-text-gray text-sm mb-5">
                No necesitas contraseña. Solo ingresa tu dato de contacto para generar o dar seguimiento a tus reportes.
              </Text>
              
              <View className="w-full mb-4">
                <Text className="text-text-dark font-semibold text-sm mb-1.5">Teléfono o Correo <Text className="text-urgency-high">*</Text></Text>
                <TextInput 
                  placeholder="Ej. 222 123 4567 o email@..." 
                  placeholderTextColor="#7F8C8D"
                  value={contact}
                  onChangeText={setContact}
                  className="w-full bg-brand-white px-4 py-3 rounded-[8px] border border-brand-lightBg focus:border-primary-500 text-base text-text-dark min-h-[44px]"
                />
              </View>
            </View>
          )}

          {selectedRole === 'voluntario' && (
            <View>
              <Text className="text-text-dark font-bold text-xl mb-4">Acceso Voluntario</Text>
              
              <View className="w-full mb-4">
                <Text className="text-text-dark font-semibold text-sm mb-1.5">Correo electrónico <Text className="text-urgency-high">*</Text></Text>
                <TextInput 
                  placeholder="correo@ejemplo.com"
                  placeholderTextColor="#7F8C8D"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  className="w-full bg-brand-white px-4 py-3 rounded-[8px] border border-brand-lightBg focus:border-primary-500 text-base text-text-dark min-h-[44px]"
                />
              </View>

              <View className="w-full mb-4">
                <Text className="text-text-dark font-semibold text-sm mb-1.5">Contraseña <Text className="text-urgency-high">*</Text></Text>
                <TextInput 
                  placeholder="********" 
                  placeholderTextColor="#7F8C8D"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  className="w-full bg-brand-white px-4 py-3 rounded-[8px] border border-brand-lightBg focus:border-primary-500 text-base text-text-dark min-h-[44px]"
                />
              </View>

              <View className="w-full mb-4">
                <Text className="text-text-dark font-semibold text-sm mb-1.5">Datos adicionales (Vehículo/Experiencia)</Text>
                <TextInput 
                  placeholder="Auto, Moto, Bicicleta..." 
                  placeholderTextColor="#7F8C8D"
                  value={extraData}
                  onChangeText={setExtraData}
                  className="w-full bg-brand-white px-4 py-3 rounded-[8px] border border-brand-lightBg focus:border-primary-500 text-base text-text-dark min-h-[44px]"
                />
              </View>
            </View>
          )}

          {selectedRole === 'patrocinador' && (
            <View>
              <Text className="text-text-dark font-bold text-xl mb-4">Acceso Patrocinador</Text>
              
              <View className="w-full mb-4">
                <Text className="text-text-dark font-semibold text-sm mb-1.5">Correo electrónico <Text className="text-urgency-high">*</Text></Text>
                <TextInput 
                  placeholder="correo@empresa.com"
                  placeholderTextColor="#7F8C8D"
                  keyboardType="email-address"
                  value={email}
                  onChangeText={setEmail}
                  className="w-full bg-brand-white px-4 py-3 rounded-[8px] border border-brand-lightBg focus:border-primary-500 text-base text-text-dark min-h-[44px]"
                />
              </View>

              <View className="w-full mb-4">
                <Text className="text-text-dark font-semibold text-sm mb-1.5">Contraseña <Text className="text-urgency-high">*</Text></Text>
                <TextInput 
                  placeholder="********" 
                  placeholderTextColor="#7F8C8D"
                  secureTextEntry
                  value={password}
                  onChangeText={setPassword}
                  className="w-full bg-brand-white px-4 py-3 rounded-[8px] border border-brand-lightBg focus:border-primary-500 text-base text-text-dark min-h-[44px]"
                />
              </View>

              <View className="w-full mb-4">
                <Text className="text-text-dark font-semibold text-sm mb-1.5">Tipo de organización <Text className="text-urgency-high">*</Text></Text>
                <TextInput 
                  placeholder="Clínica, Refugio, Negocio..." 
                  placeholderTextColor="#7F8C8D"
                  value={orgType}
                  onChangeText={setOrgType}
                  className="w-full bg-brand-white px-4 py-3 rounded-[8px] border border-brand-lightBg focus:border-primary-500 text-base text-text-dark min-h-[44px]"
                />
              </View>
            </View>
          )}

          {/* Botón */}
          <View className="mt-6">
            <TouchableOpacity
              onPress={handleLogin}
              disabled={isLoading}
              className={`w-full py-3.5 px-4 rounded-[8px] flex-row justify-center items-center min-h-[44px] bg-primary-500 active:bg-primary-600 ${isLoading ? 'opacity-50' : ''}`}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-brand-white font-semibold text-base text-center">
                  {selectedRole === 'reportante' ? 'Continuar al Mapa' : 'Iniciar Sesión'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}