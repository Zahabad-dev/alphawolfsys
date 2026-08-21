import QRCode from "qrcode";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

// Proporción de logo/caja blanca relativa al tamaño del QR — con errorCorrectionLevel
// "H" el QR tolera hasta ~30% de área tapada, así que el logo + contorno nunca
// comprometen la lectura (el contorno se dibuja AFUERA del QR, nunca sobre los módulos).
const PROPORCION_LOGO = 0.22;
const PROPORCION_PADDING = 0.18;
const PROPORCION_BORDE = 0.03;
const BORDE_MIN_PX = 6;

export interface QrGenerado {
  buffer: Buffer;
  size: number;
}

// DPI usado para rasterizar el QR — el tamaño físico real al imprimir lo controla
// el CSS en cm, esto solo define qué tan nítido se ve el PNG a ese tamaño.
// 600 en vez de 300 para que los módulos salgan más definidos en impresoras
// normales (no térmicas), donde el sangrado de tinta ya de por sí es peor.
const DPI_IMPRESION = 600;

export function cmAPx(cm: number): number {
  return Math.round((cm / 2.54) * DPI_IMPRESION);
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
 * `sinLogo` omite el logo central (pero conserva el contorno) — en tamaños muy chicos (2cm),
 * el logo tapa módulos reales y, combinado con impresoras no térmicas, puede afectar la lectura.
 */
export async function generarQrConLogo(
  texto: string,
  size: number,
  opciones: { sinLogo?: boolean } = {}
): Promise<QrGenerado> {
  const borde = Math.max(BORDE_MIN_PX, Math.round(size * PROPORCION_BORDE));
  const outerSize = size + borde * 2;

  try {
    const qrBase = opciones.sinLogo
      ? await QRCode.toBuffer(texto, { width: size, margin: 2, errorCorrectionLevel: "H" })
      : await generarQrBaseConLogo(texto, size);
    const fondo = await generarContornoDegradado(outerSize, Math.round(borde * 0.7));
    const buffer = await sharp(fondo)
      .composite([{ input: qrBase, gravity: "center" }])
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

/** Conversión a JPG bajo demanda — PNG sigue siendo lo recomendado para imprimir
 * (JPG es con pérdida y difumina justo los bordes duros que un QR necesita nítidos),
 * pero se ofrece por si hace falta compatibilidad con otro programa. */
export async function aJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).jpeg({ quality: 95, chromaSubsampling: "4:4:4" }).toBuffer();
}

function escaparXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Agrega el precio+sucursal como texto horneado debajo del QR, en la MISMA
 * imagen. Necesario para los botones de descarga: si alguien guarda el PNG/JPG
 * y lo imprime desde otro programa (no desde esta página), ese texto en HTML
 * aparte nunca llega — así queda dentro del archivo pase lo que pase.
 */
export async function conEtiqueta(qrBuffer: Buffer, qrSize: number, etiqueta: string): Promise<Buffer> {
  const alturaTexto = Math.round(qrSize * 0.14);
  const fontSize = Math.round(alturaTexto * 0.5);

  const svgTexto = `
    <svg width="${qrSize}" height="${alturaTexto}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#ffffff" />
      <text x="50%" y="52%" font-family="Arial, sans-serif" font-size="${fontSize}"
            fill="#000000" text-anchor="middle" dominant-baseline="middle">${escaparXml(etiqueta)}</text>
    </svg>
  `;
  const textoBuffer = await sharp(Buffer.from(svgTexto)).png().toBuffer();

  return sharp({
    create: { width: qrSize, height: qrSize + alturaTexto, channels: 4, background: "#ffffff" },
  })
    .composite([
      { input: qrBuffer, top: 0, left: 0 },
      { input: textoBuffer, top: qrSize, left: 0 },
    ])
    .png()
    .toBuffer();
}
