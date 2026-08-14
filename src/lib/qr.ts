import QRCode from "qrcode";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

// Proporción de logo/caja blanca relativa al tamaño del QR — con errorCorrectionLevel
// "H" el QR tolera hasta ~30% de área tapada, así que el logo + contorno nunca
// comprometen la lectura (el contorno se dibuja AFUERA del QR, nunca sobre los módulos).
const PROPORCION_LOGO = 0.22;
const PROPORCION_PADDING = 0.18;
const PROPORCION_BORDE = 0.07;
const BORDE_MIN_PX = 14;

export interface QrGenerado {
  buffer: Buffer;
  size: number;
}

async function generarContornoDegradado(outerSize: number, radio: number): Promise<Buffer> {
  const svg = `
    <svg width="${outerSize}" height="${outerSize}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="borde" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#F5C518" />
          <stop offset="50%" stop-color="#7B2CBF" />
          <stop offset="100%" stop-color="#5C3317" />
        </linearGradient>
      </defs>
      <rect width="${outerSize}" height="${outerSize}" rx="${radio}" fill="url(#borde)" />
    </svg>
  `;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function generarQrBaseConLogo(texto: string, size: number): Promise<Buffer> {
  const qrBuffer = await QRCode.toBuffer(texto, {
    width: size,
    margin: 2,
    errorCorrectionLevel: "H",
  });

  const logoPath = path.join(process.cwd(), "public", "brand", "wolf-logo.png");
  const logoOriginal = await fs.readFile(logoPath);

  const logoSize = Math.round(size * PROPORCION_LOGO);
  const padding = Math.round(logoSize * PROPORCION_PADDING);
  const boxSize = logoSize + padding * 2;

  const logoResized = await sharp(logoOriginal)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 0 },
    })
    .toBuffer();

  // Caja blanca detrás del logo: evita tapar los módulos directamente con el logo
  // (que puede tener fondo transparente/oscuro), manteniendo el contraste que lee la cámara.
  const cajaBlanca = await sharp({
    create: { width: boxSize, height: boxSize, channels: 4, background: "#ffffff" },
  })
    .composite([{ input: logoResized, gravity: "center" }])
    .png()
    .toBuffer();

  return sharp(qrBuffer)
    .composite([{ input: cajaBlanca, gravity: "center" }])
    .png()
    .toBuffer();
}

/**
 * Genera el QR imprimible: logo al centro + contorno degradado (dorado→morado→caramelo oscuro).
 * Si algo falla (logo faltante, etc.) cae a un QR plano sin adornos — el QR nunca deja de generarse.
 */
export async function generarQrConLogo(texto: string, size: number): Promise<QrGenerado> {
  const borde = Math.max(BORDE_MIN_PX, Math.round(size * PROPORCION_BORDE));
  const outerSize = size + borde * 2;

  try {
    const qrConLogo = await generarQrBaseConLogo(texto, size);
    const fondo = await generarContornoDegradado(outerSize, Math.round(borde * 0.7));
    const buffer = await sharp(fondo)
      .composite([{ input: qrConLogo, gravity: "center" }])
      .png()
      .toBuffer();
    return { buffer, size: outerSize };
  } catch {
    // Fallback robusto: QR simple sin logo ni contorno, pero siempre escaneable.
    const buffer = await QRCode.toBuffer(texto, {
      width: size,
      margin: 2,
      errorCorrectionLevel: "H",
    });
    return { buffer, size };
  }
}
