import { redirect } from "next/navigation";

// Destino codificado físicamente en cada QR impreso. Solo reenvía a la
// pantalla de confirmación real — proxy.ts ya exige sesión antes de llegar aquí.
export default async function ScanRedirectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/venta/confirmar/${token}`);
}
