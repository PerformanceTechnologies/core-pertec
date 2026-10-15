import CargaPertec from "@/components/CargaPertec";

// Lo que se muestra al entrar a Contrato DCH mientras se lee SharePoint, que es lo
// lento de esta pantalla. Next lo usa solo como respaldo mientras la página
// termina: no cambia lo que la página hace ni cuándo.
export default function CargandoContratos() {
  return <CargaPertec modulo="el contrato" />;
}
