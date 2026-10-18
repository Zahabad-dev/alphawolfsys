/**
 * Interruptores de funciones. Para reactivar una función: cambiar a `true` y desplegar.
 */

/**
 * "Escanear salida" (regalo/muestra, saldo, merma…): el vendedor da de baja piezas que no
 * son venta. Deshabilitada por el momento. Con `false`:
 *  - el botón y la lista "Salidas de hoy" no aparecen en el inicio del vendedor,
 *  - /venta/salida redirige al inicio,
 *  - registrarSalidaAction rechaza cualquier intento (server),
 *  - las salidas que hubieran quedado en la cola offline se conservan, sin enviarse.
 * La base de datos y los reportes de admin (Historial, CSV, Dashboard) no cambian.
 */
export const SALIDAS_HABILITADAS = false;

/**
 * Dinero en el Inventario (valor de las existencias a precio de lista).
 * Con `true`, el valor lo ve ÚNICAMENTE el administrador (gerente y demás roles nunca: el panel
 * puede estar abierto en una tablet o equipo compartido). Con `false`, el Inventario muestra
 * solo piezas para todos, incluido el administrador.
 */
export const INVENTARIO_MUESTRA_DINERO = true;
