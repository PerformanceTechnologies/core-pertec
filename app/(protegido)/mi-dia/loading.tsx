import CargaPertec from "@/components/CargaPertec";
import ResumenCargando from "@/components/mi-dia/ResumenCargando";

// Mi Día lleva la animación de la marca como todos los módulos, y además los
// pasos narrados debajo.
//
// La diferencia con el resto es cuánto dura: acá la primera visita del día lee
// el buzón completo y lo pasa por el modelo, y eso puede ser más de un minuto.
// La línea sola, dibujándose todo ese rato sin decir nada, se lee como una
// página colgada; los pasos son los que explican que el sistema está trabajando
// y por qué tarda.
//
// La página ya no tiene límites de Suspense internos, así que esto se ve hasta
// que el resumen está entero.
export default function CargandoMiDia() {
  return (
    <div className="max-w-[1500px]">
      <CargaPertec modulo="Mi Día" compacto />
      <ResumenCargando />
    </div>
  );
}
