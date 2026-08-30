/**
 * Filtra el GeoJSON del estado de Puebla para extraer solo las colonias
 * del municipio de Puebla (códigos postales 72000-72999).
 * También simplifica las coordenadas reduciendo decimales para menor tamaño.
 */
const fs = require('fs');
const path = require('path');

const INPUT = path.join(__dirname, '..', '21-Pue.geojson');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data');
const OUTPUT = path.join(OUTPUT_DIR, 'colonias-puebla.geojson');

// Puebla capital postal codes: 72000-72999
const MIN_CODE = 72000;
const MAX_CODE = 72999;

// Reduce coordinate precision to 5 decimals (~1.1m accuracy, more than enough)
function simplifyCoords(coords) {
  if (typeof coords[0] === 'number') {
    return [
      Math.round(coords[0] * 100000) / 100000,
      Math.round(coords[1] * 100000) / 100000,
    ];
  }
  return coords.map(simplifyCoords);
}

console.log('Reading input file...');
const raw = fs.readFileSync(INPUT, 'utf8');
const data = JSON.parse(raw);

console.log(`Total features in state: ${data.features.length}`);

const pueblaFeatures = data.features
  .filter(f => {
    const code = f.properties.d_codigo;
    return code >= MIN_CODE && code <= MAX_CODE;
  })
  .map(f => ({
    type: 'Feature',
    properties: {
      cp: f.properties.d_codigo,
      nombre: `CP ${f.properties.d_codigo}`,
    },
    geometry: {
      type: f.geometry.type,
      coordinates: simplifyCoords(f.geometry.coordinates),
    },
  }));

console.log(`Puebla municipality features: ${pueblaFeatures.length}`);

const output = {
  type: 'FeatureCollection',
  features: pueblaFeatures,
};

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const jsonStr = JSON.stringify(output);
fs.writeFileSync(OUTPUT, jsonStr);

const sizeKB = Math.round(jsonStr.length / 1024);
console.log(`Output written to: ${OUTPUT}`);
console.log(`Output size: ${sizeKB} KB`);
console.log('Done!');
