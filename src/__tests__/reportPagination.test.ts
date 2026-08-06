import { getPaginationWindow, getReportsPerPage } from '../utils/reportPagination';

describe('reportPagination', () => {
  it('muestra seis reportes por página en web', () => {
    expect(getReportsPerPage(1200)).toBe(6);
    expect(getPaginationWindow(15, 1, 6)).toEqual({
      page: 1,
      totalPages: 3,
      startIndex: 0,
      endIndex: 6,
    });
  });

  it('muestra cuatro reportes por página en móvil', () => {
    expect(getReportsPerPage(390)).toBe(4);
    expect(getPaginationWindow(15, 2, 4)).toEqual({
      page: 2,
      totalPages: 4,
      startIndex: 4,
      endIndex: 8,
    });
  });

  it('limita una página anterior o posterior al rango disponible', () => {
    expect(getPaginationWindow(5, 9, 4)).toEqual({
      page: 2,
      totalPages: 2,
      startIndex: 4,
      endIndex: 5,
    });
    expect(getPaginationWindow(5, 0, 4).page).toBe(1);
  });

  it('mantiene un estado válido cuando el filtro no tiene resultados', () => {
    expect(getPaginationWindow(0, 3, 6)).toEqual({
      page: 1,
      totalPages: 1,
      startIndex: 0,
      endIndex: 0,
    });
  });
});
