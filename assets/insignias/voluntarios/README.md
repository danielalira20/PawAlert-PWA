# Insignias de voluntariado

Los recursos de esta carpeta se comparten entre los perfiles de voluntariado
interno y externo cuando la insignia aplica a ambos roles.

## Especificaciones visuales

- Formato: PNG RGBA con fondo transparente.
- Lienzo de entrega: 480 × 720 px, orientación vertical y proporción 2:3.
- Peso recomendado: máximo 500 KB por archivo.
- Composición: medalla centrada, con un margen exterior de 8–10 %.
- Estética: escudo o medalla 3D, listón, laureles y acabados consistentes con
  `assets/insignias/reportantes/`.
- El nombre y la condición deben formar parte de la imagen y conservar buena
  lectura al mostrarse dentro de un contenedor de 180 × 180 px.

## Archivos compartidos

### Rescatista PawAlert

Insignia dinámica basada en rescates completados.

- `rescatista_pawalert_cobre.png`
  - Título: “Rescatista de Cobre”.
  - Condición: “1 rescate completado”.
- `rescatista_pawalert_plata.png`
  - Título: “Rescatista de Plata”.
  - Condición: “5 rescates completados”.
- `rescatista_pawalert_oro.png`
  - Título: “Rescatista de Oro”.
  - Condición: “15 rescates completados”.

### Compromiso cumplido

Insignia fija por concluir 10 asignaciones sin abandono confirmado.

- `compromiso_cumplido.png`
  - Título: “Compromiso Cumplido”.
  - Condición: “10 casos concluidos”.

## Archivo exclusivo del voluntariado interno

### Verificador de confianza

Insignia fija por completar correctamente cinco verificaciones de hogar.

- `verificador_de_confianza.png`
  - Título: “Verificador de Confianza”.
  - Condición: “5 hogares verificados”.

## Códigos del backend

- `rescatista_pawalert`
- `compromiso_cumplido`
- `verificador_de_confianza`

No cambiar estos nombres sin actualizar también el evaluador del backend, el
catálogo visual del frontend y sus pruebas.
