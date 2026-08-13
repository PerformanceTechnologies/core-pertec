import CargaPertec from "@/components/CargaPertec";

// Lo que Next muestra mientras se resuelve page.tsx (guard + consultas). Sin un
// loading.tsx, el navegador se queda en la pagina anterior sin ninguna senal de
// que algo esta pasando, y el modulo se siente colgado.
export default function CargandoFinanzas() {
  return <CargaPertec modulo="Panel Finanzas" />;
}
