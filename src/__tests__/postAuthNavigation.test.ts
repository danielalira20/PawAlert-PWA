import {
  getPostAuthDestination,
  getPostAuthExplanation,
  isPostAuthFlow,
} from '../utils/postAuthNavigation';

describe('postAuthNavigation', () => {
  it('regresa a la selección de asociación después de autenticarse', () => {
    expect(getPostAuthDestination('join-association', '/')).toBe('/(tabs)/join-association');
  });

  it('regresa al inicio solicitando abrir el formulario de casa temporal', () => {
    expect(getPostAuthDestination('external-volunteer', '/')).toBe(
      '/?abrirPostulacionExterna=true',
    );
  });

  it('rechaza destinos no reconocidos y conserva el destino seguro', () => {
    expect(getPostAuthDestination('https://sitio-malicioso.test', '/profile')).toBe('/profile');
    expect(isPostAuthFlow('join-association')).toBe(true);
    expect(isPostAuthFlow('external-volunteer')).toBe(true);
    expect(isPostAuthFlow('otro')).toBe(false);
  });

  it('explica por qué se requiere una cuenta en cada flujo', () => {
    expect(getPostAuthExplanation('join-association')).toContain('asociación');
    expect(getPostAuthExplanation('external-volunteer')).toContain('casa temporal');
    expect(getPostAuthExplanation(undefined)).toBeNull();
  });
});
