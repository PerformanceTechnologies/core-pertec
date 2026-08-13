import CargaPertec from "@/components/CargaPertec";

// Lo que Next muestra mientras se resuelve page.tsx. Se mantiene hasta que la
// pagina tiene TODOS sus datos: la pagina no usa limites de Suspense internos, y
// sin ellos React no puede mandar la mitad de arriba antes de que la de abajo
// este lista.
export default function CargandoAplicacion() {
  return <CargaPertec modulo="la aplicación" />;
}
