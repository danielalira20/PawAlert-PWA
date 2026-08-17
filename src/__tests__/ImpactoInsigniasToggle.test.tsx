import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ImpactoInsigniasToggle } from '../components/profile/ImpactoInsigniasToggle';

// `@expo/vector-icons` está declarado como dependencia de `expo` pero no
// existe físicamente en node_modules en este entorno (gap de instalación
// preexistente, no relacionado con este componente) -- se mockea al
// límite del módulo para no depender de que se resuelva de verdad.
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }), { virtual: true });

// Se mockea el hijo para probar solo la lógica de switcheo del toggle,
// sin depender de su fetch/estados internos (ya cubiertos en
// ReportanteInsigniasCard.test.tsx).
jest.mock('../components/profile/ReportanteInsigniasCard', () => ({
  ReportanteInsigniasCard: () => {
    const { Text: RNText } = require('react-native');
    return <RNText>MOCK_REPORTANTE_INSIGNIAS_CARD</RNText>;
  },
}));

describe('ImpactoInsigniasToggle', () => {
  it('arranca mostrando impactoElement (tab "Impacto" activo por defecto), no las insignias', async () => {
    const view = await render(
      <ImpactoInsigniasToggle impactoElement={<Text>CONTENIDO_DE_IMPACTO</Text>} />,
    );

    expect(view.getByText('CONTENIDO_DE_IMPACTO')).toBeTruthy();
    expect(view.queryByText('MOCK_REPORTANTE_INSIGNIAS_CARD')).toBeNull();
  });

  it('al presionar "Insignias", cambia y muestra ReportanteInsigniasCard', async () => {
    const view = await render(
      <ImpactoInsigniasToggle impactoElement={<Text>CONTENIDO_DE_IMPACTO</Text>} />,
    );

    await fireEvent.press(view.getByText('Insignias'));

    expect(view.getByText('MOCK_REPORTANTE_INSIGNIAS_CARD')).toBeTruthy();
    expect(view.queryByText('CONTENIDO_DE_IMPACTO')).toBeNull();
  });
});
