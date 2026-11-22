/**
 * Etiquetas para la impresora térmica Zendio (TSPL, 203 dpi = 8 puntos por mm), rollo 1×1" con 2 columnas.
 * Solo navegador. La etiqueta se DIBUJA aquí (canvas en blanco y negro, alineado a los puntos de la impresora)
 * y se manda igual por cualquiera de las vías:
 *  - Bluetooth (Chrome en Android o PC) o USB-OTG (Chrome en Android): comandos TSPL directos, sin driver.
 *  - PC con Windows: página del tamaño EXACTO de una fila del rollo, para imprimir al 100 % con el driver.
 */
import QRCode from "qrcode";

export const PUNTOS_POR_MM = 8;

export interface AjustesZendio {
  /** Medidas de una etiqueta (mm). */
  anchoMm: number;
  altoMm: number;
  /** Etiquetas por fila. */
  columnas: number;
  /** Separación entre columnas y entre filas (mm). */
  gapColMm: number;
  gapFilaMm: number;
  /** Margen del papel antes de la primera columna (mm). */
  margenIzqMm: number;
  /** Ajuste fino de posición (mm), por si la impresora imprime corrido. */
  ajusteXMm: number;
  ajusteYMm: number;
  /** Por si la impresora interpreta al revés el blanco y negro del bitmap. */
  invertir: boolean;
  /**
   * Bluetooth/USB: el QR lo dibuja la impresora (comando QRCODE) y solo el texto va como imagen.
   * Manda ~4 veces menos datos, así que imprime más rápido. No aplica a «Imprimir desde PC».
   */
  qrImpresora: boolean;
}

export const AJUSTES_INICIALES: AjustesZendio = {
  anchoMm: 25.4,
  altoMm: 25.4,
  columnas: 2,
  gapColMm: 2,
  gapFilaMm: 3,
  margenIzqMm: 1,
  ajusteXMm: 0,
  ajusteYMm: 0,
  invertir: false,
  qrImpresora: false,
};

const CLAVE_AJUSTES = "wolf.zendio.ajustes";

const limitar = (v: unknown, min: number, max: number, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Deja los ajustes en valores que no puedan romper el dibujo (columnas enteras ≥1, medidas positivas). */
export function normalizar(a: Partial<AjustesZendio>): AjustesZendio {
  const d = AJUSTES_INICIALES;
  return {
    anchoMm: limitar(a.anchoMm, 5, 110, d.anchoMm),
    altoMm: limitar(a.altoMm, 5, 110, d.altoMm),
    columnas: Math.round(limitar(a.columnas, 1, 4, d.columnas)),
    gapColMm: limitar(a.gapColMm, 0, 20, d.gapColMm),
    gapFilaMm: limitar(a.gapFilaMm, 0, 20, d.gapFilaMm),
    margenIzqMm: limitar(a.margenIzqMm, 0, 20, d.margenIzqMm),
    ajusteXMm: limitar(a.ajusteXMm, -10, 10, d.ajusteXMm),
    ajusteYMm: limitar(a.ajusteYMm, -10, 10, d.ajusteYMm),
    invertir: a.invertir === true,
    qrImpresora: a.qrImpresora === true,
  };
}

/** Los ajustes son de ESTE aparato (cada impresora/tableta se calibra una vez). */
export function leerAjustes(): AjustesZendio {
  try {
    const crudo = localStorage.getItem(CLAVE_AJUSTES);
    if (crudo) return normalizar(JSON.parse(crudo) as Partial<AjustesZendio>);
  } catch {
    // sin almacenamiento: se usan los iniciales
  }
  return { ...AJUSTES_INICIALES };
}

export function guardarAjustes(a: AjustesZendio) {
  try {
    localStorage.setItem(CLAVE_AJUSTES, JSON.stringify(a));
  } catch {
    // se ignora: la impresión funciona igual con los valores de la pantalla
  }
}

export interface DatosEtiqueta {
  token: string;
  texto: string;
  /** "$115.00 · ALM" o null. */
  precio: string | null;
}

const mm = (v: number) => Math.round(v * PUNTOS_POR_MM);

/** Ancho total del papel de una fila (mm). */
export function anchoFilaMm(aCrudo: AjustesZendio) {
  const a = normalizar(aCrudo);
  return a.margenIzqMm * 2 + a.columnas * a.anchoMm + (a.columnas - 1) * a.gapColMm;
}

const FILAS_POR_LOTE = 20;
const ceder = () => new Promise((r) => setTimeout(r, 0));

/**
 * Prepara un trabajo grande sin trabar la pantalla ni llenar la memoria: dibuja de 20 en 20 filas y entrega
 * cada lote ya convertido (`convertir`) antes de dibujar el siguiente.
 */
export async function porLotes<T>(
  etiquetas: DatosEtiqueta[],
  aCrudo: AjustesZendio,
  familia: string,
  convertir: (filas: HTMLCanvasElement[]) => T,
  progreso?: (hechas: number, total: number) => void,
  qrNativo = false
): Promise<T[]> {
  const a = normalizar(aCrudo);
  const paso = FILAS_POR_LOTE * a.columnas;
  const salida: T[] = [];
  for (let i = 0; i < etiquetas.length; i += paso) {
    salida.push(convertir(await dibujarFilas(etiquetas.slice(i, i + paso), a, familia, qrNativo)));
    progreso?.(Math.min(etiquetas.length, i + paso), etiquetas.length);
    await ceder();
  }
  return salida;
}

/** Parte el texto en renglones que caben en `ancho` (corta palabras larguísimas por letras). */
function renglones(ctx: CanvasRenderingContext2D, texto: string, ancho: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(" ")) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width <= ancho) {
      actual = prueba;
      continue;
    }
    if (actual) lineas.push(actual);
    let resto = palabra;
    while (ctx.measureText(resto).width > ancho && resto.length > 1) {
      let n = resto.length - 1;
      while (n > 1 && ctx.measureText(resto.slice(0, n)).width > ancho) n--;
      lineas.push(resto.slice(0, n));
      resto = resto.slice(n);
    }
    actual = resto;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

/** QR que dibuja la propia impresora (comando TSPL QRCODE), en puntos de impresora. */
interface QrNativo {
  x: number;
  y: number;
  modulo: number;
  token: string;
}
/** QRs de cada fila cuando la impresora los dibuja (la fila de canvas lleva solo el texto). */
const qrsDeFila = new WeakMap<HTMLCanvasElement, QrNativo[]>();
/** Solo tokens sencillos van como comando (sin comillas ni nada raro); lo demás se dibuja como imagen. */
const tokenSeguro = (t: string) => /^[A-Za-z0-9-]{1,64}$/.test(t);

/** Dibuja UNA etiqueta en (x0, y0) del canvas, en puntos de impresora. Si se pasa `qrs`, el QR no se dibuja: se anota ahí. */
function dibujarEtiqueta(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  d: DatosEtiqueta,
  a: AjustesZendio,
  familia: string,
  qrs?: QrNativo[]
) {
  const ancho = mm(a.anchoMm);
  const alto = mm(a.altoMm);
  const margen = mm(1);
  const tamPrecio = d.precio ? mm(1.8) : 0;

  // Texto: hasta 2 renglones, letra de 2.2 mm que baja hasta 1.6 mm si no cabe.
  let tam = mm(2.2);
  const minimo = mm(1.6);
  let lineas: string[] = [];
  for (;;) {
    ctx.font = `700 ${tam}px ${familia}`;
    lineas = renglones(ctx, d.texto, ancho - margen * 2);
    if (lineas.length <= 2 || tam <= minimo) break;
    tam -= 1;
  }
  lineas = lineas.slice(0, 2);
  const altoTexto = Math.ceil(tam * 1.05 * lineas.length);

  // QR: lo más grande que quepa arriba, con cuadritos de puntos enteros (bordes nítidos al imprimir).
  const qr = QRCode.create(d.token, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const espacioQr = alto - margen * 2 - altoTexto - tamPrecio - mm(0.6);
  const modulo = Math.max(1, Math.floor(Math.min(espacioQr, ancho - margen * 2) / n));
  const ladoQr = modulo * n;
  const qx = x0 + Math.round((ancho - ladoQr) / 2);
  const qy = y0 + margen;
  ctx.fillStyle = "#000";
  if (qrs && tokenSeguro(d.token)) qrs.push({ x: qx, y: qy, modulo, token: d.token });
  else for (let fy = 0; fy < n; fy++) {
    for (let fx = 0; fx < n; fx++) {
      if (qr.modules.get(fx, fy)) ctx.fillRect(qx + fx * modulo, qy + fy * modulo, modulo, modulo);
    }
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `700 ${tam}px ${familia}`;
  let y = qy + ladoQr + mm(0.4);
  for (const l of lineas) {
    ctx.fillText(l, x0 + ancho / 2, y);
    y += tam * 1.05;
  }
  if (d.precio) {
    ctx.font = `400 ${tamPrecio}px Arial, sans-serif`;
    ctx.fillText(d.precio, x0 + ancho / 2, y + mm(0.1));
  }
}

/**
 * Dibuja las filas del rollo (cada una con hasta `columnas` etiquetas). Devuelve un canvas por fila, del ancho
 * exacto del papel, en blanco y negro puro (sin grises: la térmica solo imprime puntos).
 */
export async function dibujarFilas(
  etiquetas: DatosEtiqueta[],
  aCrudo: AjustesZendio,
  familia: string,
  qrNativo = false
): Promise<HTMLCanvasElement[]> {
  const a = normalizar(aCrudo);
  try {
    await document.fonts?.load(`700 ${mm(2.2)}px ${familia}`);
  } catch {
    // se sigue con la letra disponible
  }
  const filas: HTMLCanvasElement[] = [];
  const W = mm(anchoFilaMm(a));
  const H = mm(a.altoMm);
  for (let i = 0; i < etiquetas.length; i += a.columnas) {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    const qrs: QrNativo[] | undefined = qrNativo ? [] : undefined;
    etiquetas.slice(i, i + a.columnas).forEach((d, k) => {
      const x = mm(a.margenIzqMm + a.ajusteXMm) + k * mm(a.anchoMm + a.gapColMm);
      const y = mm(a.ajusteYMm);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, mm(a.anchoMm), mm(a.altoMm));
      ctx.clip();
      dibujarEtiqueta(ctx, x, y, d, a, familia, qrs);
      ctx.restore();
    });
    // Umbral: todo punto queda negro o blanco.
    const img = ctx.getImageData(0, 0, W, H);
    for (let p = 0; p < img.data.length; p += 4) {
      const v = img.data[p] * 0.3 + img.data[p + 1] * 0.59 + img.data[p + 2] * 0.11 < 150 ? 0 : 255;
      img.data[p] = img.data[p + 1] = img.data[p + 2] = v;
      img.data[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    if (qrs) qrsDeFila.set(c, qrs);
    filas.push(c);
  }
  return filas;
}

/** Comandos TSPL para imprimir las filas (un BITMAP por fila). */
export function cabeceraTspl(aCrudo: AjustesZendio): Uint8Array {
  const a = normalizar(aCrudo);
  return new TextEncoder().encode(
    `SIZE ${anchoFilaMm(a).toFixed(1)} mm,${a.altoMm.toFixed(1)} mm\r\nGAP ${a.gapFilaMm.toFixed(1)} mm,0 mm\r\n` +
      "DIRECTION 1\r\nREFERENCE 0,0\r\nSPEED 4\r\nDENSITY 8\r\n"
  );
}

/** Une varios trozos de bytes en uno. */
export function unir(partes: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(partes.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of partes) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Comandos TSPL de las filas (sin cabecera), un BITMAP + PRINT por fila. Si la fila trae QRs para la impresora,
 * el BITMAP se recorta a la franja que tiene tinta (el texto) y los QR van como comando QRCODE.
 */
export function filasATspl(filas: HTMLCanvasElement[], aCrudo: AjustesZendio): Uint8Array {
  const a = normalizar(aCrudo);
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  for (const c of filas) {
    const ctx = c.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
    const bytesFila = Math.ceil(width / 8);
    const qrs = qrsDeFila.get(c);
    // Con QR de la impresora solo se manda la franja con tinta; sin él, la fila completa (como siempre).
    let y0 = 0;
    let y1 = height;
    if (qrs) {
      const conTinta = (y: number) => {
        for (let x = 0; x < width; x++) if (data[(y * width + x) * 4] < 128) return true;
        return false;
      };
      while (y0 < height && !conTinta(y0)) y0++;
      while (y1 > y0 && !conTinta(y1 - 1)) y1--;
    }
    const alto = y1 - y0;
    const bits = new Uint8Array(bytesFila * alto);
    for (let y = 0; y < alto; y++) {
      for (let x = 0; x < width; x++) {
        const negro = data[((y + y0) * width + x) * 4] < 128;
        // En TSPL, un bit en 0 imprime el punto; `invertir` lo voltea si la impresora lo entiende al revés.
        const blanco = a.invertir ? negro : !negro;
        if (blanco) bits[y * bytesFila + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    partes.push(enc.encode("CLS\r\n"));
    if (alto > 0) partes.push(enc.encode(`BITMAP 0,${y0},${bytesFila},${alto},0,`), bits, enc.encode("\r\n"));
    for (const q of qrs ?? []) partes.push(enc.encode(`QRCODE ${q.x},${q.y},M,${q.modulo},A,0,"${q.token}"\r\n`));
    partes.push(enc.encode("PRINT 1,1\r\n"));
  }
  return unir(partes);
}

// ---------- Envío directo (Bluetooth / USB) ----------

/* Tipos mínimos de Web Bluetooth y WebUSB (no vienen en lib.dom de TypeScript). */
interface CaracteristicaBle {
  properties: { write: boolean; writeWithoutResponse: boolean };
  writeValue(d: BufferSource): Promise<void>;
  writeValueWithoutResponse?(d: BufferSource): Promise<void>;
}
interface ServicioBle {
  getCharacteristics(): Promise<CaracteristicaBle[]>;
}
interface DispositivoBle {
  name?: string;
  gatt?: { connected: boolean; connect(): Promise<{ getPrimaryServices(): Promise<ServicioBle[]> }>; disconnect(): void };
}
interface NavegadorConBle {
  bluetooth?: { requestDevice(o: { acceptAllDevices: boolean; optionalServices: string[] }): Promise<DispositivoBle> };
  usb?: {
    requestDevice(o: { filters: object[] }): Promise<DispositivoUsb>;
  };
}
interface DispositivoUsb {
  productName?: string;
  configuration: { interfaces: { interfaceNumber: number; alternate: { interfaceClass: number; endpoints: { direction: string; type: string; endpointNumber: number }[] } }[] } | null;
  open(): Promise<void>;
  selectConfiguration(n: number): Promise<void>;
  claimInterface(n: number): Promise<void>;
  transferOut(ep: number, d: BufferSource): Promise<unknown>;
  close(): Promise<void>;
}

const nav = () => (typeof navigator === "undefined" ? {} : (navigator as unknown as NavegadorConBle));
export const hayBluetooth = () => !!nav().bluetooth;
/** Por cable solo en Android: en Windows el driver de la impresora la tiene apartada y Chrome no puede abrirla. */
export const hayUsb = () => !!nav().usb && typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);

/** Traduce los errores del navegador a algo que se entienda en la tienda. */
export function mensajeDeError(e: unknown): string {
  const m = e instanceof Error ? e.message : "";
  if (/Access denied|SecurityError|claimInterface/i.test(m))
    return "No se pudo abrir la impresora por cable. En una PC con Windows usa Bluetooth o «Imprimir desde PC»; el cable es para tabletas Android.";
  if (/GATT|disconnected|NetworkError|Bluetooth/i.test(m))
    return "Se perdió la conexión Bluetooth con la impresora. Revisa que esté encendida y cerca, y vuelve a intentar.";
  return m || "No se pudo imprimir.";
}

/** Servicios de impresión BLE comunes en impresoras térmicas chinas (Beeprt, Xprinter, etc.). */
const SERVICIOS_BLE = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
];

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Manda los bytes a una impresora por Bluetooth (BLE). El navegador muestra la lista para elegirla. */
/** Si la persona cierra la lista de aparatos sin elegir, no es un error. */
async function elegir<T>(f: () => Promise<T>): Promise<T | null> {
  try {
    return await f();
  } catch (e) {
    if (e instanceof Error && e.name === "NotFoundError") return null;
    throw e;
  }
}

/** Manda los bytes a una impresora por Bluetooth (BLE). Devuelve null si se canceló la elección. */
export async function enviarBluetooth(datos: Uint8Array, progreso?: (enviado: number, total: number) => void): Promise<string | null> {
  const ble = nav().bluetooth;
  if (!ble) throw new Error("Este navegador no tiene Bluetooth (usa Chrome).");
  const disp = await elegir(() => ble.requestDevice({ acceptAllDevices: true, optionalServices: SERVICIOS_BLE }));
  if (!disp) return null;
  if (!disp.gatt) throw new Error("La impresora no aceptó la conexión Bluetooth.");
  const servidor = await disp.gatt.connect();
  try {
    let destino: CaracteristicaBle | null = null;
    const servicios = await servidor.getPrimaryServices().catch(() => [] as ServicioBle[]);
    for (const s of servicios) {
      for (const c of await s.getCharacteristics().catch(() => [] as CaracteristicaBle[])) {
        if (c.properties.writeWithoutResponse || c.properties.write) {
          destino = c;
          break;
        }
      }
      if (destino) break;
    }
    if (!destino) throw new Error("No encontré por dónde mandarle datos a esa impresora por Bluetooth. Prueba por USB.");
    // Trozos chicos (caben en cualquier MTU) y, si se puede, con confirmación: la impresora marca el ritmo.
    const trozo = 100;
    const conRespuesta = destino.properties.write;
    for (let i = 0; i < datos.length; i += trozo) {
      const parte = datos.slice(i, i + trozo);
      if (conRespuesta || !destino.writeValueWithoutResponse) {
        await destino.writeValue(parte);
      } else {
        await destino.writeValueWithoutResponse(parte);
        await esperar(15);
      }
      if (i % (trozo * 50) === 0) progreso?.(i, datos.length);
    }
    progreso?.(datos.length, datos.length);
    return disp.name ?? "impresora";
  } finally {
    // Tiempo para que la impresora termine de recibir antes de cortar la conexión.
    await esperar(2000);
    disp.gatt.disconnect();
  }
}

/** Manda los bytes por USB (tableta Android con cable OTG). El navegador muestra la lista para elegirla. */
export async function enviarUsb(datos: Uint8Array): Promise<string | null> {
  const usb = nav().usb;
  if (!usb) throw new Error("Este navegador no tiene acceso a USB (usa Chrome).");
  const disp = await elegir(() => usb.requestDevice({ filters: [] }));
  if (!disp) return null;
  await disp.open();
  try {
    if (!disp.configuration) await disp.selectConfiguration(1);
    const ifaces = disp.configuration?.interfaces ?? [];
    const iface =
      ifaces.find((i) => i.alternate.interfaceClass === 7) ??
      ifaces.find((i) => i.alternate.endpoints.some((e) => e.direction === "out" && e.type === "bulk"));
    const ep = iface?.alternate.endpoints.find((e) => e.direction === "out" && e.type === "bulk");
    if (!iface || !ep) throw new Error("No encontré la salida de impresión en ese aparato USB.");
    await disp.claimInterface(iface.interfaceNumber);
    for (let i = 0; i < datos.length; i += 16384) await disp.transferOut(ep.endpointNumber, datos.slice(i, i + 16384));
    return disp.productName ?? "impresora";
  } finally {
    await disp.close().catch(() => undefined);
  }
}

/**
 * PC con Windows: abre la impresión del navegador con una página del tamaño EXACTO de una fila del rollo
 * (cada fila es una página). Hay que imprimir al 100 % («Tamaño real», sin «Ajustar») y con el tamaño de papel
 * del driver igual al de la fila.
 */
export function imprimirPorPagina(imagenesFila: string[], aCrudo: AjustesZendio) {
  const a = normalizar(aCrudo);
  const w = anchoFilaMm(a);
  const h = a.altoMm;
  const marco = document.createElement("iframe");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(marco);
  const doc = marco.contentDocument!;
  const imagenes = imagenesFila
    .map((src) => `<img src="${src}" style="width:${w}mm;height:${h}mm;display:block;image-rendering:pixelated">`)
    .join("");
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title><style>` +
      `@page{size:${w}mm ${h}mm;margin:0}html,body{margin:0;padding:0}img{page-break-after:always;break-after:page}img:last-child{page-break-after:auto;break-after:auto}` +
      `</style></head><body>${imagenes}</body></html>`
  );
  doc.close();
  const quitar = () => marco.remove();
  const imprimir = () => {
    const w2 = marco.contentWindow;
    if (!w2) return;
    w2.addEventListener("afterprint", () => setTimeout(quitar, 1000), { once: true });
    setTimeout(quitar, 10 * 60_000); // respaldo
    w2.focus();
    w2.print();
  };
  const imgs = [...doc.images];
  Promise.all(
    imgs.map((i) => (i.complete ? Promise.resolve() : new Promise((r) => {
      i.onload = r;
      i.onerror = r;
    })))
  ).then(imprimir);
}
