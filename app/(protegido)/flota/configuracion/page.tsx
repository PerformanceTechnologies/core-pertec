import { IconSettings } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import CreadorEntidad from "@/components/inventario/CreadorEntidad";
import { crearMarcaAction, crearModeloAction, crearTipoDocumentoAction } from "@/app/(protegido)/flota/acciones";
import { ActivarTipoDocumento } from "@/components/flota/AccionesFila";
import { listarMarcas, listarModelos, listarTiposDocumento } from "@/lib/flota";
import { ETIQUETA_CATEGORIA, ETIQUETA_SECCION, type CategoriaModelo, type SeccionDocumento } from "@/lib/flota-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function ConfiguracionFlotaPage() {
  const [marcas, modelos, tipos] = await Promise.all([listarMarcas(), listarModelos(), listarTiposDocumento()]);
  const categorias = (Object.keys(ETIQUETA_CATEGORIA) as CategoriaModelo[]).map((c) => ({ valor: c, etiqueta: ETIQUETA_CATEGORIA[c] }));

  return (
    <div className="space-y-5">
      <IntroSeccion
        Icono={IconSettings}
        tono="bg-slate-500/10 text-slate-600"
        titulo="Configuración"
        bajada="Las marcas y modelos que se eligen al crear un vehículo, y la lista de documentos que se le pide a cada uno."
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <section className={`${TARJETA} p-5`}>
          <h2 className="mb-3 text-sm font-bold text-tinta">Marcas</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {marcas.map((m) => <span key={m.id} className="rounded-full bg-borde/60 px-3 py-1 text-sm text-tinta">{m.nombre}</span>)}
            {marcas.length === 0 && <span className="text-sm text-gris">Sin marcas.</span>}
          </div>
          <CreadorEntidad accion={crearMarcaAction} campos={[{ name: "nombre", etiqueta: "Nueva marca", requerido: true, placeholder: "Toyota" }]} />
        </section>

        <section className={`${TARJETA} p-5`}>
          <h2 className="mb-3 text-sm font-bold text-tinta">Modelos</h2>
          {modelos.length === 0 ? (
            <p className="mb-4 text-sm text-gris">Sin modelos. Agrega uno abajo (ej: Toyota Hilux, camioneta).</p>
          ) : (
            <div className="mb-4 space-y-3">
              {marcas.filter((ma) => modelos.some((mo) => mo.marcaId === ma.id)).map((ma) => (
                <div key={ma.id}>
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gris">{ma.nombre}</p>
                  <div className="flex flex-wrap gap-2">
                    {modelos.filter((mo) => mo.marcaId === ma.id).map((mo) => (
                      <span key={mo.id} className="rounded-full bg-borde/60 px-3 py-1 text-sm text-tinta">
                        {mo.nombre} <span className="text-gris">· {ETIQUETA_CATEGORIA[mo.categoria]}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
          <CreadorEntidad
            accion={crearModeloAction}
            textoBoton="Agregar modelo"
            campos={[
              { name: "marcaId", etiqueta: "Marca", tipo: "select", requerido: true, opciones: marcas.map((m) => ({ valor: m.id, etiqueta: m.nombre })) },
              { name: "nombre", etiqueta: "Modelo", requerido: true, placeholder: "Hilux" },
              { name: "categoria", etiqueta: "Categoría", tipo: "select", opciones: categorias },
            ]}
          />
        </section>
      </div>

      <section className={`${TARJETA} p-5`}>
        <h2 className="mb-1 text-sm font-bold text-tinta">Documentos que se piden a cada vehículo</h2>
        <p className="mb-4 text-xs text-gris">
          Aparecen en la ficha de todos los vehículos. Quitar uno no borra lo que ya se subió; en un vehículo puntual se puede marcar «no aplica».
        </p>
        <div className="mb-5 grid gap-5 lg:grid-cols-2">
          {(Object.keys(ETIQUETA_SECCION) as SeccionDocumento[]).map((sec) => (
            <div key={sec}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gris">{ETIQUETA_SECCION[sec]}</p>
              <ul className="divide-y divide-borde rounded-lg border border-borde">
                {tipos.filter((t) => t.seccion === sec).map((t) => (
                  <li key={t.id} className={`flex items-center gap-3 px-3 py-2 text-sm ${t.activo ? "" : "opacity-50"}`}>
                    <span className={`min-w-0 flex-1 ${t.activo ? "text-tinta" : "text-gris line-through"}`}>{t.nombre}</span>
                    <span className="shrink-0 text-[11px] text-gris">{t.vence ? "Vence" : "No vence"}</span>
                    <ActivarTipoDocumento id={t.id} activo={t.activo} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <CreadorEntidad
          accion={crearTipoDocumentoAction}
          textoBoton="Agregar documento"
          campos={[
            { name: "nombre", etiqueta: "Nuevo documento", requerido: true, placeholder: "Ej: Certificado de grúa" },
            { name: "seccion", etiqueta: "Sección", tipo: "select", opciones: [{ valor: "base", etiqueta: ETIQUETA_SECCION.base }, { valor: "acreditacion", etiqueta: ETIQUETA_SECCION.acreditacion }] },
            { name: "vence", etiqueta: "¿Vence?", tipo: "select", opciones: [{ valor: "si", etiqueta: "Sí, pide fecha" }, { valor: "no", etiqueta: "No vence" }] },
          ]}
        />
      </section>
    </div>
  );
}
