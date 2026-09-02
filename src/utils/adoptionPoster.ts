import { Platform } from 'react-native';

export type AdoptionPosterProfile = {
  id: string;
  nombre_publico?: string | null;
  edad_aproximada?: string | null;
  sexo?: string | null;
  zona_general?: string | null;
  descripcion?: string | null;
  personalidad?: string | null;
  salud_conocida?: string | null;
  tratamientos?: string | null;
  necesidades_especiales?: string | null;
  vacunacion_estado?: string | null;
  esterilizacion_estado?: string | null;
  fotos?: Array<{ foto_url: string }>;
  tipo_animal?: { descripcion?: string | null } | null;
  tamanio?: { descripcion?: string | null } | null;
  raza?: { descripcion?: string | null } | null;
  asociacion?: {
    nombre?: string | null;
    acerca_de?: string | null;
    logo_url?: string | null;
    telefono?: string | null;
    email?: string | null;
  } | null;
};

type PosterAssets = { logoUri: string; mascotUri: string };

const assetUri = (source: any): string => {
  if (typeof source === 'string') return source;
  if (typeof source?.uri === 'string') return source.uri;
  if (typeof source?.default === 'string') return source.default;
  if (typeof source?.default?.uri === 'string') return source.default.uri;
  return '';
};

export const getAdoptionPosterAssets = (): PosterAssets => ({
  logoUri: assetUri(require('../assets/logo/logo_pawAlert.png')),
  mascotUri: assetUri(require('../assets/images/paw_hi.png')),
});

const W = 1080;
const H = 1920;
const ORANGE = '#EC802B';
const CREAM = '#FFF8EF';
const DARK = '#3E3027';
const TEAL = '#66BCB4';

const safe = (value?: string | null, fallback = 'Por confirmar') =>
  value?.trim() || fallback;

export const adoptionPosterFileName = (name?: string | null) =>
  `ficha-adopcion-${safe(name, 'pawalert').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}.png`;

const roundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
};

const loadImage = (src?: string | null) => new Promise<HTMLImageElement | null>((resolve) => {
  if (!src) return resolve(null);
  const img = new window.Image();
  let settled = false;
  const finish = (value: HTMLImageElement | null) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timeout);
    resolve(value);
  };
  const timeout = window.setTimeout(() => finish(null), 5000);
  img.crossOrigin = 'anonymous';
  img.onload = () => finish(img);
  img.onerror = () => finish(null);
  img.src = src;
});

const coverImage = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, width: number, height: number) => {
  const scale = Math.max(width / img.width, height / img.height);
  const sw = width / scale;
  const sh = height / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, width, height);
};

const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) break;
    } else line = test;
  }
  if (lines.length < maxLines && line) lines.push(line);
  lines.slice(0, maxLines).forEach((item, index) => {
    const isLast = index === maxLines - 1 && words.join(' ').length > lines.join(' ').length;
    ctx.fillText(isLast ? `${item.replace(/[.,;:]?$/, '')}…` : item, x, y + index * lineHeight);
  });
};

const drawChip = (ctx: CanvasRenderingContext2D, label: string, x: number, y: number, width: number) => {
  ctx.fillStyle = '#F8E9D6';
  roundedRect(ctx, x, y, width, 76, 38);
  ctx.fill();
  ctx.fillStyle = DARK;
  ctx.font = '700 30px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(label, x + width / 2, y + 49);
  ctx.textAlign = 'left';
};

export async function createAdoptionPoster(profile: AdoptionPosterProfile, assets: PosterAssets): Promise<Blob> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    throw new Error('La exportación como imagen está disponible en la versión web.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Tu navegador no permite crear la ficha.');

  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = ORANGE;
  ctx.fillRect(0, 0, W, 430);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  ctx.beginPath(); ctx.arc(920, 80, 220, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(90, 410, 150, 0, Math.PI * 2); ctx.fill();

  const [logo, mascot, animal, associationLogo] = await Promise.all([
    loadImage(assets.logoUri), loadImage(assets.mascotUri), loadImage(profile.fotos?.[0]?.foto_url), loadImage(profile.asociacion?.logo_url),
  ]);
  if (logo) ctx.drawImage(logo, 70, 58, 122, 122);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 44px Arial';
  ctx.fillText('PawAlert', 210, 132);
  ctx.font = '800 30px Arial';
  ctx.fillText('ADOPCIÓN RESPONSABLE', 70, 235);
  ctx.font = '900 76px Arial';
  ctx.fillText('¡BUSCO UN HOGAR!', 70, 335);

  ctx.save();
  roundedRect(ctx, 70, 375, 940, 590, 52);
  ctx.clip();
  if (animal) coverImage(ctx, animal, 70, 375, 940, 590);
  else {
    ctx.fillStyle = '#F2DCC2'; ctx.fillRect(70, 375, 940, 590);
    ctx.fillStyle = ORANGE; ctx.font = '900 140px Arial'; ctx.textAlign = 'center';
    ctx.fillText('🐾', 540, 750); ctx.textAlign = 'left';
  }
  ctx.restore();

  ctx.fillStyle = DARK;
  ctx.font = '900 72px Arial';
  ctx.fillText(safe(profile.nombre_publico, 'Conóceme'), 70, 1065);
  const labels = [safe(profile.edad_aproximada), safe(profile.sexo), safe(profile.tamanio?.descripcion, 'Tamaño por confirmar')]
    .map(v => v.replace('_', ' '));
  drawChip(ctx, labels[0], 70, 1110, 285);
  drawChip(ctx, labels[1], 375, 1110, 285);
  drawChip(ctx, labels[2], 680, 1110, 330);

  ctx.fillStyle = TEAL;
  ctx.font = '900 31px Arial';
  ctx.fillText('ASÍ SOY', 70, 1245);
  ctx.fillStyle = DARK;
  ctx.font = '500 34px Arial';
  wrapText(ctx, safe(profile.personalidad, 'Tengo mucho amor para compartir.'), 70, 1292, 940, 42, 2);

  ctx.fillStyle = TEAL;
  ctx.font = '900 31px Arial';
  ctx.fillText('MI HISTORIA', 70, 1415);
  ctx.fillStyle = DARK;
  ctx.font = '500 30px Arial';
  wrapText(ctx, safe(profile.descripcion, 'Estoy esperando una familia que me quiera para siempre.'), 70, 1460, 940, 39, 3);

  ctx.fillStyle = TEAL;
  ctx.font = '900 29px Arial';
  ctx.fillText('MI CUIDADO', 70, 1600);
  ctx.fillStyle = DARK;
  ctx.font = '700 26px Arial';
  const vaccine = `Vacunas: ${safe(profile.vacunacion_estado, 'por confirmar').replace('_', ' ')}`;
  const sterilization = `Esterilización: ${safe(profile.esterilizacion_estado, 'por confirmar').replace('_', ' ')}`;
  ctx.fillText(`✓ ${vaccine}`, 70, 1645);
  ctx.fillText(`✓ ${sterilization}`, 500, 1645);
  const extraCare = profile.necesidades_especiales || profile.tratamientos || profile.salud_conocida;
  if (extraCare) {
    ctx.font = '500 24px Arial';
    wrapText(ctx, extraCare, 70, 1685, 900, 31, 1);
  }

  ctx.fillStyle = '#F8E9D6';
  roundedRect(ctx, 70, 1725, 940, 135, 34); ctx.fill();
  if (associationLogo) {
    ctx.save(); roundedRect(ctx, 95, 1745, 92, 92, 46); ctx.clip(); coverImage(ctx, associationLogo, 95, 1745, 92, 92); ctx.restore();
  }
  const contactX = associationLogo ? 210 : 105;
  ctx.fillStyle = ORANGE; ctx.font = '900 25px Arial'; ctx.fillText('CONTACTA A LA ASOCIACIÓN', contactX, 1768);
  ctx.fillStyle = DARK; ctx.font = '700 28px Arial';
  ctx.fillText(safe(profile.asociacion?.nombre, 'Disponible en PawAlert'), contactX, 1808);
  ctx.font = '500 21px Arial';
  const contact = profile.asociacion?.telefono || profile.asociacion?.email || safe(profile.zona_general, 'Consulta PawAlert');
  ctx.fillText(contact, contactX, 1838);
  if (mascot) ctx.drawImage(mascot, 825, 1695, 175, 175);

  ctx.fillStyle = DARK; ctx.font = '700 25px Arial'; ctx.textAlign = 'center';
  ctx.fillText('Comparte mi historia · Cada huella cuenta', W / 2, 1900);
  ctx.textAlign = 'left';

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('No se pudo exportar la ficha.')), 'image/png', 1),
  );
}

export async function downloadAdoptionPoster(profile: AdoptionPosterProfile, assets: PosterAssets) {
  const blob = await createAdoptionPoster(profile, assets);
  downloadAdoptionPosterBlob(blob, profile);
}

export function downloadAdoptionPosterBlob(blob: Blob, profile: AdoptionPosterProfile) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = adoptionPosterFileName(profile.nombre_publico);
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export async function shareAdoptionPoster(profile: AdoptionPosterProfile, assets: PosterAssets) {
  const blob = await createAdoptionPoster(profile, assets);
  return shareAdoptionPosterBlob(blob, profile);
}

export async function shareAdoptionPosterBlob(blob: Blob, profile: AdoptionPosterProfile) {
  const file = new File([blob], adoptionPosterFileName(profile.nombre_publico), { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  try {
    if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
      await nav.share({ title: `${safe(profile.nombre_publico)} busca hogar`, text: 'Ayúdame a compartir esta adopción responsable de PawAlert.', files: [file] });
      return 'shared' as const;
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
  }
  downloadAdoptionPosterBlob(blob, profile);
  return 'downloaded' as const;
}
