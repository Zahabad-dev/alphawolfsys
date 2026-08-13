import QRCode from "qrcode";
import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

// Proporción de logo/caja blanca relativa al tamaño del QR — probado visualmente,
// con errorCorrectionLevel "H" el QR tolera hasta ~30% de área tapada.
const PROPORCION_LOGO = 0.22;
const PROPORCION_PADDING = 0.18;

export async function generarQrConLogo(texto: string, size: number): Promise<Buffer> {
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

  // Caja blanca detrás del logo: mejora la lectura del QR al no tapar directamente
  // los módulos con un logo de fondo transparente/oscuro.
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
