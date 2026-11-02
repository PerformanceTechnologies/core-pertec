import { IconSettings } from "@tabler/icons-react";
import IntroSeccion from "@/components/inventario/IntroSeccion";
import CreadorEntidad from "@/components/inventario/CreadorEntidad";
import { crearMarcaAction, crearModeloAction } from "@/app/(protegido)/flota/acciones";
import { listarMarcas, listarModelos } from "@/lib/flota";
import { ETIQUETA_CATEGORIA, type CategoriaModelo } from "@/lib/flota-modelo";
import { TARJETA } from "@/lib/estilos";

export const dynamic = "force-dynamic";

export default async function ConfiguracionFlotaPage() {
  const [marcas, modelos] = await Promise.all([listarMarcas(), listarModelos()]);
  const categorias = (Object.keys(ETIQUETA_CATEGORIA) as CategoriaModelo[]).map((c) => ({ valor: c, etiqueta: ETIQUETA_CATEGORIA[c] }));

  return (
    <div className="space-y-5">
      <IntroSeccion
        Icono={IconSettings}
        tono="bg-slate-500/10 text-slate-600"
        titulo="Configuración"
        bajada="Las marcas y modelos que se eligen al crear un vehículo. La categoría del modelo define su ícono (camioneta, camión, maquinaria…)."
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
    </div>
  );
}
