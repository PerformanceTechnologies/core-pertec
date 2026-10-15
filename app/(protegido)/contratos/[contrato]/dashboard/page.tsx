import { AnclaDeContrato } from "@/components/contratos/Enlace";
import { Suspense } from "react";
import { IconFileTypePdf } from "@tabler/icons-react";
import AplicacionesRapidas from "@/components/contratos/dashboard/AplicacionesRapidas";
import { EsqueletoDeWidget } from "@/components/contratos/dashboard/CajaDeWidget";
import {
  AcreditacionConDatos,
  ActividadConDatos,
  ArranqueConDatos,
  DocumentosConDatos,
  SuperiorConDatos,
  VehiculosConDatos,
} from "@/components/contratos/dashboard/ConDatos";
import { aplicacionesVisibles, listarAplicaciones } from "@/lib/contratos/aplicaciones";
import { exigirSesion } from "@/lib/contratos/autorizacion";
import { hoyEnChile } from "@/lib/contratos/acreditacion-modelo";
import { MODULOS } from "@/lib/contratos/arranque-modelo";
import {
  cargarAcreditacion,
  cargarArranque,
  cargarContrato,
  cargarDocumentos,
  cargarPlazos,
  cargarResponsables,
  cargarVehiculos,
} from "@/lib/contratos/dashboard";
import { TARJETA } from "@/lib/contratos/estilos";

export const dynamic = "force-dynamic";

/** Una lectura que falla no puede tumbar el tablero: el widget que la espera dice que no pudo. */
function segura<T>(promesa: Promise<T>, que: string): Promise<T | null> {
  return promesa.catch((e) => {
    console.error(`[dashboard] ${que}: ${e instanceof Error ? e.message : e}`);
    return null;
  });
}

export default async function PanelPage() {
  const usuario = await exigirSesion();
  const todas = await listarAplicaciones();

  // Mismo filtro que la barra: un admin ve todo, el resto lo asignado. Que las dos lean lo mismo
  // es lo que evita ofrecer un módulo al que después el guardia de la página le niega la entrada.
  const apps = aplicacionesVisibles(usuario, todas);
  const tiene = new Set(apps.map((a) => a.slug));

  // El dashboard muestra SOLO los módulos que esta persona puede abrir: un resumen de lo que no
  // puede ver sería una forma de filtrar datos que el resto del core le niega.
  const acceso = {
    documentos: tiene.has("contratos"),
    acreditacion: tiene.has("acreditacion"),
    vehiculos: tiene.has("acreditacion-vehiculos"),
    logistica: tiene.has(MODULOS.logistica.appSlug),
    gastos: tiene.has(MODULOS.gastos.appSlug),
  };
  const hayModulos = Object.values(acceso).some(Boolean);
  const hoy = hoyEnChile();

  // TODAS las lecturas arrancan acá, a la vez. Cada widget espera solo la suya (ver ConDatos.tsx),
  // así que el tiempo hasta que todo está pintado es el de la más lenta, no la suma.
  const documentos = acceso.documentos
    ? segura(cargarDocumentos(usuario.correo), "documentos generales")
    : Promise.resolve(null);
  const acreditacion = acceso.acreditacion ? segura(cargarAcreditacion(), "acreditación") : Promise.resolve(null);
  const vehiculos = acceso.vehiculos
    ? segura(cargarVehiculos(), "acreditación de vehículos")
    : Promise.resolve(null);
  const logistica = acceso.logistica ? segura(cargarArranque("logistica"), "logística") : Promise.resolve(null);
  const gastos = acceso.gastos ? segura(cargarArranque("gastos"), "gastos de arranque") : Promise.resolve(null);
  const plazos = cargarPlazos(hoy).catch(() => ({}));
  const responsables = cargarResponsables().catch(() => ({}));
  const contrato = cargarContrato().catch(() => ({ nombre: "Contrato", fechaInicio: null, administrador: null }));

  return (
    <div className="animar-entrada space-y-5">
      <header>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="titular text-2xl text-azul sm:text-3xl">Dashboard</h1>

          <div className="flex flex-wrap items-center gap-2">
            {/* <a> y no <Link>: es una descarga, no una página (con Link el enrutador pide el archivo dos veces). */}
            {hayModulos && (
              <AnclaDeContrato
                href="/contratos/reporte/pdf"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-borde bg-superficie px-4 py-2 text-xs font-bold uppercase tracking-wide text-azul transition hover:border-cian hover:bg-cian-lavado"
              >
                <IconFileTypePdf size={16} className="text-cian" />
                Reporte PDF
              </AnclaDeContrato>
            )}
          </div>
        </div>
        <p className="mt-1 text-sm text-gris">
          {usuario.nombre ? `Hola, ${primerNombre(usuario.nombre)}. ` : ""}
          Así va el contrato en una mirada.
        </p>
      </header>

      {hayModulos ? (
        <>
          <Suspense
            fallback={
              <div className="space-y-4" aria-busy>
                <EsqueletoDeWidget alto="h-64" className="!rounded-2xl" />
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {Array.from({ length: 6 }, (_, i) => (
                    <EsqueletoDeWidget key={i} alto="h-28" />
                  ))}
                </div>
              </div>
            }
          >
            <SuperiorConDatos
              documentos={documentos}
              acreditacion={acreditacion}
              vehiculos={vehiculos}
              logistica={logistica}
              gastos={gastos}
              plazos={plazos}
              responsables={responsables}
              contrato={contrato}
              hoy={hoy}
            />
          </Suspense>

          {(acceso.documentos || acceso.acreditacion) && (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              {acceso.documentos && (
                <div className={acceso.acreditacion ? "" : "lg:col-span-2"}>
                  <Suspense fallback={<EsqueletoDeWidget alto="h-[28rem]" />}>
                    <DocumentosConDatos datos={documentos} plazos={plazos} />
                  </Suspense>
                </div>
              )}
              {acceso.acreditacion && (
                <div className={acceso.documentos ? "" : "lg:col-span-2"}>
                  <Suspense fallback={<EsqueletoDeWidget alto="h-[28rem]" />}>
                    <ActividadConDatos datos={acreditacion} />
                  </Suspense>
                </div>
              )}
            </div>
          )}

          {acceso.acreditacion && (
            <Suspense fallback={<EsqueletoDeWidget alto="h-80" />}>
              <AcreditacionConDatos datos={acreditacion} plazos={plazos} />
            </Suspense>
          )}

          {acceso.vehiculos && (
            <Suspense fallback={<EsqueletoDeWidget alto="h-80" />}>
              <VehiculosConDatos datos={vehiculos} plazos={plazos} />
            </Suspense>
          )}

          {(acceso.logistica || acceso.gastos) && (
            <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
              {acceso.logistica && (
                <div className={acceso.gastos ? "" : "lg:col-span-2"}>
                  <Suspense fallback={<EsqueletoDeWidget alto="h-96" />}>
                    <ArranqueConDatos datos={logistica} plazos={plazos} clave="logistica" />
                  </Suspense>
                </div>
              )}
              {acceso.gastos && (
                <div className={acceso.logistica ? "" : "lg:col-span-2"}>
                  <Suspense fallback={<EsqueletoDeWidget alto="h-96" />}>
                    <ArranqueConDatos datos={gastos} plazos={plazos} clave="gastos" />
                  </Suspense>
                </div>
              )}
            </div>
          )}

          <AplicacionesRapidas apps={apps} />
        </>
      ) : (
        <div className={`${TARJETA} p-8 text-center`}>
          <p className="text-sm font-semibold text-tinta">Todavía no tienes aplicaciones</p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-gris">
            Entraste con {usuario.correo}, pero no tienes ningún módulo asignado. Pídele a un
            administrador que te dé acceso.
          </p>
        </div>
      )}
    </div>
  );
}

function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0];
}

