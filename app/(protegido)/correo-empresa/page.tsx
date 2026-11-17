import Link from "next/link";
import { redirect } from "next/navigation";
import { IconAlertTriangle, IconBuilding, IconCircleCheck, IconLock, IconMail, IconPlugConnected, IconRefresh, IconUnlink } from "@tabler/icons-react";
import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { contextoDeEmpresa } from "@/lib/empresas";
import { conexionDeCorreo, rutaParaConectar } from "@/lib/correo-empresa";
import type { CodigoErrorConexion } from "@/lib/correo-empresa-oauth";
import type { Empresa } from "@/lib/empresas-modelo";
import { BOTON_C, BOTON_SUAVE_C, HOJA, IconoTile } from "@/components/contactos/Visual";
import CerrarPestana from "@/components/correo/CerrarPestana";
import { desconectarCorreoAction } from "./acciones";

export const dynamic = "force-dynamic";

function mensajeDeError(codigo: string, empresa: Empresa | undefined): string {
  const nombre = empresa?.nombre ?? "la empresa";
  const textos: Record<CodigoErrorConexion, string> = {
    vencio: "La conexión tardó demasiado o se abrió dos veces. Vuelve a intentarlo.",
    sesion: "Tu sesión del Core cambió en medio de la conexión. Vuelve a intentarlo.",
    empresa: "Esa empresa no envía desde su propio correo, o no tienes acceso a ella.",
    aprobacion: `${nombre} exige que su administrador de Microsoft 365 apruebe la app del Core antes de conectarla. Pídele que la apruebe y vuelve a intentarlo.`,
    multitenant: "La app del Core todavía no acepta cuentas de otras empresas: hay que marcarla como multitenant en Entra.",
    cancelado: "Se canceló la conexión antes de terminar. No cambió nada.",
    dominio: `La cuenta que elegiste no es de @${empresa?.correoDominio ?? ""}. En la pantalla de Microsoft elige «Usar otra cuenta» y entra con la de ${nombre}.`,
    misma: `Elegiste tu cuenta del Core. En la pantalla de Microsoft elige «Usar otra cuenta» y entra con la de ${nombre}.`,
    guardar: "Microsoft aprobó la conexión, pero no se pudo guardar. Si esto recién se instaló, falta correr el SQL supabase/empresas/0003_correo_por_empresa.sql.",
    config: "Falta configurar la app de Microsoft del Core para conectar correos.",
    microsoft: "Microsoft no dejó conectar la cuenta. Vuelve a intentarlo; si se repite, avísale a soporte con la hora del intento.",
  };
  return textos[codigo as CodigoErrorConexion] ?? textos.microsoft;
}

function fecha(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "short", year: "numeric" });
}

export default async function CorreoEmpresaPage({ searchParams }: { searchParams: Promise<{ conectada?: string; error?: string; empresa?: string; pestana?: string }> }) {
  const usuario = await obtenerUsuarioActivo((await auth())?.user?.email);
  if (!usuario) redirect("/ingresar");
  const q = await searchParams;

  const { permitidas } = await contextoDeEmpresa(usuario.id, usuario.rol);
  const conCorreo = permitidas.filter((e) => e.correoPropio);
  const conexiones = await Promise.all(conCorreo.map((e) => conexionDeCorreo(usuario.id, e.id)));
  const recienConectada = conCorreo.find((e) => e.id === q.conectada);
  const empresaDelError = permitidas.find((e) => e.id === q.empresa);
  const restantes = permitidas.filter((e) => !e.correoPropio).map((e) => e.nombre);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-6 flex items-start gap-3">
        <IconoTile Icono={IconMail} tono="marca" />
        <div>
          <h1 className="text-xl font-bold tracking-tight text-tinta sm:text-2xl">Correo por empresa</h1>
          <p className="mt-1 text-sm text-gris">
            Los correos a clientes y proveedores de estas empresas salen desde tu cuenta de la empresa, no desde {usuario.correo}. La conectas una sola vez.
          </p>
        </div>
      </header>

      {recienConectada && (
        <div role="status" className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-emerald-500/10 px-4 py-3 text-sm text-ok">
          <IconCircleCheck size={18} className="shrink-0" />
          <span className="flex-1">
            Listo: el correo de {recienConectada.nombre} quedó conectado.{q.pestana === "1" ? " Ya puedes cerrar esta pestaña y volver a enviar." : ""}
          </span>
          {q.pestana === "1" && <CerrarPestana className={BOTON_SUAVE_C} />}
        </div>
      )}
      {q.error && (
        <p role="alert" className="mb-5 flex items-start gap-2 rounded-2xl bg-rose-500/[0.08] px-4 py-3 text-sm font-medium text-alerta">
          <IconAlertTriangle size={18} className="mt-px shrink-0" /> {mensajeDeError(q.error, empresaDelError)}
        </p>
      )}

      {conCorreo.length === 0 ? (
        <div className={`${HOJA} p-6 text-sm text-gris`}>
          Ninguna de tus empresas envía desde un correo propio. Tus correos salen desde {usuario.correo}.
        </div>
      ) : (
        <div className="space-y-4">
          {conCorreo.map((empresa, i) => {
            const c = conexiones[i];
            return (
              <section key={empresa.id} className={`${HOJA} p-5`}>
                <div className="flex items-start gap-3">
                  <IconoTile Icono={IconBuilding} tono={c && !c.error ? "verde" : "ambar"} />
                  <div className="min-w-0 flex-1">
                    <h2 className="font-semibold text-tinta">{empresa.nombre}</h2>
                    {!c ? (
                      <p className="mt-0.5 text-sm text-aviso">Sin conectar: no puedes enviar correos de {empresa.nombre} todavía.</p>
                    ) : c.error ? (
                      <p className="mt-0.5 text-sm text-alerta">
                        <span className="font-semibold">{c.cuenta}</span> dejó de funcionar (venció o la revocaron). Vuelve a conectarla.
                      </p>
                    ) : (
                      <p className="mt-0.5 text-sm text-gris">
                        Los correos salen desde <span className="font-semibold text-tinta">{c.cuenta}</span>
                        <span className="block text-xs">
                          Conectada el {fecha(c.conectadoEn)}
                          {c.usadoEn ? ` · último envío el ${fecha(c.usadoEn)}` : " · todavía sin envíos"}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {/* <a> y no <Link>: es una ruta de API que redirige a Microsoft, no una página. */}
                  <a href={rutaParaConectar(empresa.id)} className={c ? BOTON_SUAVE_C : BOTON_C}>
                    {c ? <IconRefresh size={16} /> : <IconPlugConnected size={16} />} {c ? (c.error ? "Volver a conectar" : "Cambiar cuenta") : `Conectar correo de ${empresa.nombre}`}
                  </a>
                  {c && (
                    <form action={desconectarCorreoAction}>
                      <input type="hidden" name="empresa" value={empresa.id} />
                      <button type="submit" className={BOTON_SUAVE_C}>
                        <IconUnlink size={16} /> Desconectar
                      </button>
                    </form>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-6 space-y-2 text-xs text-gris">
        <p className="flex items-start gap-2">
          <IconLock size={14} className="mt-px shrink-0" />
          El Core solo pide permiso para <b className="font-semibold">enviar</b> desde esa cuenta. No puede leer tu bandeja, tu calendario ni tus archivos. Lo enviado queda en los «Elementos enviados» de esa cuenta.
        </p>
        {restantes.length > 0 && <p className="pl-[22px]">En {restantes.join(", ")}, los correos siguen saliendo desde {usuario.correo}.</p>}
        <p className="pl-[22px]">
          <Link href="/" className="font-semibold text-naranjo hover:underline">Volver al inicio</Link>
        </p>
      </div>
    </div>
  );
}
