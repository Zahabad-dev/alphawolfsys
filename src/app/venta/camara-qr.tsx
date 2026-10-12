"use client";

import type { RefObject } from "react";

/**
 * Vista de la cámara del escáner (4:3, máx. 16rem).
 *
 * El <video> va dentro de un contenedor `relative` a propósito: qr-scanner dibuja
 * su guía (recuadro amarillo y contorno del código) como hijo del contenedor del
 * video y calcula su posición solo al arrancar, al cargar el video o al cambiar el
 * tamaño de la ventana — NO cuando cambia el contenido de la página. Con un
 * contenedor propio y posicionado, la guía se mueve junto con el video aunque la
 * pantalla se reacomode (por ejemplo, al aparecer el resumen de la venta).
 */
export default function CamaraQr({ videoRef }: { videoRef: RefObject<HTMLVideoElement | null> }) {
  return (
    <div className="relative aspect-[4/3] w-full max-w-[16rem] self-center overflow-hidden rounded-2xl border border-white/10 bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" />
    </div>
  );
}
