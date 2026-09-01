import { isNetworkUnavailable } from '../utils/networkError';

describe('isNetworkUnavailable', () => {
  it('reconoce errores de red de Axios', () => {
    expect(isNetworkUnavailable({ code: 'ERR_NETWORK', message: 'Network Error' })).toBe(true);
  });

  it('no confunde una respuesta 401 con falta de conexión', () => {
    expect(isNetworkUnavailable({ response: { status: 401 } })).toBe(false);
  });
});
