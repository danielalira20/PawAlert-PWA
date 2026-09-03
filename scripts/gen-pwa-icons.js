const { generateImageAsync } = require('@expo/image-utils');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'src/assets/logo/logo_pawAlert_favicon.png');
const outDir = path.join(root, 'public');

async function make(name, size, { padding = 0, background = 'transparent' } = {}) {
  const { source } = await generateImageAsync(
    { projectRoot: root, cacheType: 'pawalert-pwa-icons' },
    {
      src,
      name,
      width: size,
      height: size,
      resizeMode: 'contain',
      backgroundColor: background,
      padding,
      removeTransparency: false,
    }
  );
  fs.writeFileSync(path.join(outDir, name), source);
  console.log('wrote', name, size);
}

(async () => {
  await make('pawalert-icon-192.png', 192, { padding: 8 });
  await make('pawalert-icon-512.png', 512, { padding: 24 });
  await make('pawalert-icon-maskable-512.png', 512, { padding: 140, background: '#fffaf5' });
})();
