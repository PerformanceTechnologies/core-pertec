import Link from "next/link";
import { exigirAccesoOfertas } from "@/lib/ofertas/datos";
import { listarEmpresas } from "@/lib/cotizador/empresas-datos";
import { urlFirmadaLogo } from "@/lib/ofertas/logos-archivo";
import { EMPRESAS } from "@/lib/cotizador/empresas";
import SubirLogo from "@/components/ofertas/SubirLogo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

/**
 * Los logos de las empresas emisoras.
 *
 * Están acá y no en el maestro de formato porque son dos cosas distintas: el
 * maestro es la piel del documento —paleta, tipografías, medidas— y el logo es la
 * identidad de quien lo emite. Las tres empresas pueden compartir el mismo maestro
 * y ninguna quiere el logo de otra.
 *
 * Y se sube una vez, no por oferta: el logo de una empresa es el mismo en todos sus
 * documentos. Lo que sí cambia oferta por oferta es el logo del cliente, que se
 * sube en la oferta misma.
 */
export default async function LogosPage() {
  await exigirAccesoOfertas();
  const empresas = await listarEmpresas();

  // Se recorre la lista de empresas del sistema y no las filas cargadas: una
  // empresa sin identidad cargada tiene que aparecer diciendo qué falta, no
  // desaparecer de la pantalla.
  const filas = await Promise.all(
    EMPRESAS.map(async (nombre) => {
      const empresa = empresas.find((e) => e.nombre === nombre) ?? null;
      return { nombre, empresa, url: await urlFirmadaLogo(empresa?.logoRuta ?? null) };
    }),
  );

  return (
    <div className="animar-entrada max-w-[900px]">
      <Link
        href="/ofertas"
        className="text-xs font-medium text-tinta/50 transition-colors hover:text-naranjo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranjo"
      >
        ← Ofertas
      </Link>

      <div className="mt-3">
        <span className="etiqueta-seccion">Ofertas técnicas</span>
        <h1 className="mt-2 max-w-[24ch] font-condensed text-3xl font-bold uppercase leading-[0.95] tracking-tight text-tinta sm:text-4xl">
          Logos
          <span className="block text-tinta/40">La marca de cada empresa</span>
        </h1>
      </div>

      <div className={`mt-6 ${TARJETA} p-5`}>
        <p className="max-w-[70ch] text-sm text-pretty text-tinta/60">
          El logo va en la celda izquierda del encabezado, en todas las páginas, y grande en la portada. Sin
          logo sale el nombre de la empresa en texto, que es como salía hasta ahora.
        </p>
        <p className="mt-2 max-w-[70ch] text-xs text-pretty text-tinta/45">
          Esto es aparte del maestro de formato: el maestro aporta la paleta y las tipografías, el logo aporta
          la identidad. Sirve un PNG, JPG, WEBP o SVG de hasta 4 MB; el servidor lo deja en un PNG chico, así
          que no importa que el archivo original venga en grande.{" "}
          <strong className="font-semibold text-tinta/60">
            Conviene un PNG con fondo transparente y tinta oscura
          </strong>
          : el encabezado del documento es claro y un logo blanco no se vería. Y si el logo es un SVG con
          texto, mejor exportalo a PNG antes: el rasterizado corre en el servidor, que no tiene instaladas las
          tipografías del diseño y puede perder las letras.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filas.map(({ nombre, empresa, url }) => (
            <SubirLogo
              key={nombre}
              destino="empresa"
              clave={nombre}
              titulo={nombre}
              nota={
                empresa
                  ? (empresa.razonSocial || "Sin razón social cargada") +
                    (empresa.activo ? "" : " · desactivada")
                  : "Sin identidad cargada: cargala en el Cotizador → Empresas antes de subir el logo."
              }
              nombreActual={empresa?.logoNombre ?? null}
              urlActual={url}
              deshabilitado={!empresa}
            />
          ))}
        </div>
      </div>

      <p className="mt-4 text-xs text-pretty text-tinta/45">
        El logo del <strong className="font-semibold text-tinta/60">cliente</strong> no va acá: cambia en cada
        oferta, así que se sube en la oferta misma.
      </p>
    </div>
  );
}
