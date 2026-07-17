import { auth } from "@/auth";
import { query } from "@/lib/db";
import Header from "@/components/Header";
import ConfirmarVentaForm from "./confirmar-venta-form";

interface LoteConStockRow {
  id: number;
  nombre: string;
  precio_mxn: string;
  sucursal_id: number;
  activo: boolean;
  stock: number;
}

export default async function ConfirmarVentaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const session = await auth();
  const user = session!.user;

  if (user.rol !== "vendedor") {
    return (
      <MensajeSimple titulo="Solo vendedores pueden registrar ventas." />
    );
  }

  const { rows } = await query<LoteConStockRow>(
    `SELECT l.id, l.nombre, l.precio_mxn, l.sucursal_id, l.activo, COALESCE(sa.stock, 0) AS stock
     FROM lotes l
     LEFT JOIN stock_actual sa ON sa.lote_id = l.id
     WHERE l.qr_token = $1`,
    [token]
  );
  const lote = rows[0];

  if (!lote || !lote.activo) {
    return <MensajeSimple titulo="Lote no encontrado o inactivo." />;
  }

  if (lote.sucursal_id !== user.sucursalId) {
    return <MensajeSimple titulo="Este lote pertenece a otra sucursal." />;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Confirmar venta" />
      <main className="flex flex-1 flex-col items-center justify-center p-4">
        <ConfirmarVentaForm
          qrToken={token}
          idempotencyKey={crypto.randomUUID()}
          nombre={lote.nombre}
          precio={Number(lote.precio_mxn)}
          stock={lote.stock}
        />
      </main>
    </div>
  );
}

function MensajeSimple({ titulo }: { titulo: string }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header titulo="Confirmar venta" />
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4 text-center">
        <p className="text-brand-red">{titulo}</p>
        <a href="/venta" className="text-brand-gold underline">
          Volver
        </a>
      </main>
    </div>
  );
}
