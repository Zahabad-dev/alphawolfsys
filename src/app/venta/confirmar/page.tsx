import { Suspense } from "react";
import ConfirmarCliente from "./confirmar-cliente";

export default function ConfirmarVentaPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmarCliente />
    </Suspense>
  );
}
