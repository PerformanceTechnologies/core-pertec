import Link from "next/link";
import { notFound } from "next/navigation";
import { IconArrowLeft, IconBuildingStore, IconCalendarStats, IconCategory, IconFileInvoice, IconMail, IconMapPin, IconPackages, IconUser } from "@tabler/icons-react";
import { exigirAccesoApp } from "@/lib/autorizacion";
import { cargarVista } from "@/lib/valorizacion-historica";
import { RUTA_VH, SLUG_APP_VH, anioDe, armarCatalogo, fechaCorta, monto, montoCorto, pct } from "@/lib/valorizacion-historica-modelo";
import { TARJETA } from "@/lib/estilos";
import { Barra, COLORES, ChipCategoria, ChipTipoDoc, Cifra, EnlacePdf, Seccion, SinRegistro } from "@/components/valorizacion-historica/Piezas";

export const dynamic = "force-dynamic";

export default async function ProveedorPage({ params }: { params: Promise<{ rut: string }> }) {
  const usuario = await exigirAccesoApp(SLUG_APP_VH);
  const rut = decodeURIComponent((await params).rut);
  const vista = await cargarVista();
  if (!vista.datos.importacion) return <SinRegistro esAdmin={usuario.rol === "admin"} />;
  const p = vista.proveedores.find((x) => x.rut === rut);
  if (!p) notFound();

  const lineas = vista.datos.lineas.filter((l) => l.rut === rut);
  const documentos = vista.documentos.filter((d) => d.rut === rut).sort((a, b) => b.fecha.localeCompare(a.fecha) || b.n - a.n);
  const items = armarCatalogo(lineas);
  const ranking = vista.proveedores.indexOf(p) + 1;

  const porAnio = new Map<number, number>();
  const porCategoria = new Map<string, number>();
  for (const l of lineas) {
    porAnio.set(anioDe(l.fecha), (porAnio.get(anioDe(l.fecha)) ?? 0) + l.valorAjustado);
    porCategoria.set(l.categoria, (porCategoria.get(l.categoria) ?? 0) + l.valorAjustado);
  }
  const maxAnio = Math.max(...porAnio.values(), 1);
  const categorias = [...porCategoria.entries()].sort((a, b) => b[1] - a[1]);
  const colorCat = new Map(vista.resumen.porCategoria.map((c, i) => [c.nombre, COLORES[i % COLORES.length]]));

  return (
    <div className="space-y-6">
      <Link href={`${RUTA_VH}/proveedores`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-gris hover:text-naranjo">
        <IconArrowLeft size={14} /> Proveedores
      </Link>

      <header className={`${TARJETA} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-naranjo/10 text-naranjo">
            <IconBuildingStore size={24} stroke={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold leading-snug tracking-tight text-tinta">{p.razonSocial}</h2>
            <p className="text-sm tabular-nums text-gris">RUT {p.rut}{p.giro && <span className="ml-1 normal-case"> · {p.giro}</span>}</p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-gris">
              {(p.direccion || p.comuna) && <span className="inline-flex items-center gap-1"><IconMapPin size={13} /> {[p.direccion, p.comuna].filter(Boolean).join(", ")}</span>}
              {p.email && <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 hover:text-naranjo"><IconMail size={13} /> {p.email}</a>}
              {p.contactoPertec && <span className="inline-flex items-center gap-1"><IconUser size={13} /> Recibe en PERTEC: {p.contactoPertec}</span>}
            </div>
          </div>
          {p.categoriaPrincipal && <ChipCategoria nombre={p.categoriaPrincipal} />}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Cifra etiqueta="Comprado en alcance" valor={monto(p.monto)} detalle={`${pct(p.participacion)} del total · #${ranking}`} tono="text-naranjo" />
        <Cifra etiqueta="Documentos" valor={String(p.documentos)} detalle={`${documentos.filter((d) => /cr[eé]dito/i.test(d.tipo)).length} notas de crédito`} />
        <Cifra etiqueta="Ítems distintos" valor={String(p.items)} detalle={`${p.lineas} líneas`} />
        <Cifra etiqueta="Primera compra" valor={fechaCorta(p.primeraCompra)} />
        <Cifra etiqueta="Última compra" valor={fechaCorta(p.ultimaCompra)} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Seccion titulo="Por año" icono={<IconCalendarStats size={15} />}>
          <div className={`${TARJETA} space-y-3 p-5`}>
            {[...porAnio.entries()].sort((a, b) => a[0] - b[0]).map(([a, m]) => (
              <Barra key={a} etiqueta={String(a)} valor={m} maximo={maxAnio} color="#c85217" derecha={<span className="tabular-nums text-tinta">{montoCorto(m)}</span>} />
            ))}
          </div>
        </Seccion>
        <Seccion titulo="Qué se le compra" icono={<IconCategory size={15} />}>
          <div className={`${TARJETA} space-y-3 p-5`}>
            {categorias.map(([c, m]) => (
              <Barra
                key={c}
                etiqueta={c}
                valor={m}
                maximo={categorias[0][1]}
                color={colorCat.get(c) ?? "#94a3b8"}
                href={`${RUTA_VH}/buscador?proveedor=${encodeURIComponent(p.rut)}&categoria=${encodeURIComponent(c)}`}
                derecha={
                  <>
                    <span className="tabular-nums text-tinta">{montoCorto(m)}</span>
                    <span className="w-12 text-right text-xs tabular-nums text-gris">{pct(p.monto ? m / p.monto : 0)}</span>
                  </>
                }
              />
            ))}
          </div>
        </Seccion>
      </div>

      <Seccion
        titulo="Ítems que más se le compraron"
        icono={<IconPackages size={15} />}
        accion={<Link href={`${RUTA_VH}/buscador?proveedor=${encodeURIComponent(p.rut)}&ver=items`} className="text-xs font-semibold text-naranjo hover:underline">Ver los {items.length}</Link>}
      >
        <div className={`${TARJETA} overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-sm">
              <thead>
                <tr className="border-b border-borde text-left text-[11px] font-semibold uppercase tracking-wide text-gris">
                  <th className="px-4 py-3">Ítem</th>
                  <th className="px-3 py-3 text-right">Compras</th>
                  <th className="px-3 py-3 text-right">Último costo</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {items.slice(0, 12).map((i) => (
                  <tr key={i.clave}>
                    <td className="max-w-[30rem] px-4 py-2.5">
                      <Link href={`${RUTA_VH}/item?c=${encodeURIComponent(i.clave)}`} className="font-semibold text-tinta hover:text-naranjo">{i.clave}</Link>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-gris">{i.compras}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-tinta">{i.ultimoCosto === null ? "—" : monto(i.ultimoCosto)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-bold tabular-nums text-tinta">{monto(i.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Seccion>

      <Seccion titulo={`Documentos (${documentos.length})`} icono={<IconFileInvoice size={15} />}>
        <ul className={`${TARJETA} divide-y divide-borde`}>
          {documentos.map((d) => (
            <li key={d.n} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <span className="w-24 text-xs tabular-nums text-gris">{fechaCorta(d.fecha)}</span>
              <Link href={`${RUTA_VH}/documentos/${d.n}`} className="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm font-semibold tabular-nums text-tinta hover:text-naranjo">
                <ChipTipoDoc tipo={d.tipo} /> {d.folio}
                {d.referencias && <span className="truncate text-[11px] font-normal text-gris">· {d.referencias}</span>}
              </Link>
              <span className="text-right">
                <span className="block text-sm font-bold tabular-nums text-tinta">{monto(d.montoAlcance)}</span>
                <span className="block text-[10px] text-gris">en alcance de {monto(d.total)}</span>
              </span>
              {d.pdf && <EnlacePdf doc={d.n} />}
            </li>
          ))}
        </ul>
      </Seccion>
    </div>
  );
}
