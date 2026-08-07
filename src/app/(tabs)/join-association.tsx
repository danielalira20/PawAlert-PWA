import { View, StyleSheet } from 'react-native';
import JoinAssociationScreen from '../../screens/JoinAssociationScreen';
import LandingScreen from '../../screens/LandingScreen';

export default function JoinAssociationRoute() {
  return (
    <View style={{ flex: 1 }}>
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <LandingScreen />
      </View>
      <JoinAssociationScreen />
    </View>
  );
}