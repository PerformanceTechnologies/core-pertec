"use server";

import { revalidatePath } from "next/cache";
import { exigirAdmin } from "@/lib/autorizacion";
import { contextoDeEmpresa } from "@/lib/empresas";
import { normalizarRut, rutEsValido } from "@/lib/contratos/rut";
import { borrarCredencialesDte, estadoCuentaDte, guardarCuentaDte } from "@/lib/fin/dte/cuenta";
import { probarConexion } from "@/lib/fin/dte/servicio";

// Administración › Integraciones: solo el administrador del Core. Las credenciales entran por aquí y no vuelven a salir.

type Res = { ok: true; mensaje?: string } | { ok: false; error: string };

async function empresaActiva() {
  const usuario = await exigirAdmin();
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  if (!activa) throw new Error("Elige una empresa en el selector de arriba.");
  return { usuario, empresa: activa };
}

const txt = (fd: FormData, k: string, max = 300) => {
  const v = fd.get(k);
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
};

function fallo(e: unknown): Res {
  return { ok: false, error: e instanceof Error ? e.message : "Ocurrió un error inesperado." };
}

function refrescar() {
  revalidatePath("/integraciones");
  revalidatePath("/finanzas/facturacion");
}

export async function guardarCuentaAction(fd: FormData): Promise<Res> {
  try {
    const { usuario, empresa } = await empresaActiva();
    const metodo = fd.get("metodo") === "token" ? "token" : "usuario";
    const email = txt(fd, "email", 120);
    const password = txt(fd, "password", 200);
    const token = txt(fd, "token", 4000);
    const ambiente = fd.get("ambiente") === "produccion" ? "produccion" : "certificacion";
    const rutPrueba = txt(fd, "rutPrueba", 12);
    if (rutPrueba && !rutEsValido(rutPrueba)) return { ok: false, error: "El RUT emisor de prueba no es válido." };
    const actual = await estadoCuentaDte(empresa.id);
    const traeCred = metodo === "token" ? Boolean(token) : Boolean(email || password);
    if (metodo === "usuario" && traeCred && !(email && password)) return { ok: false, error: "Escribe el usuario y la clave de SimpleFactura (los dos)." };
    if (!traeCred && !actual.cargada) return { ok: false, error: metodo === "token" ? "Pega el token de integración." : "Escribe el usuario y la clave de SimpleFactura." };
    await guardarCuentaDte(
      empresa.id,
      {
        ...(traeCred ? (metodo === "token" ? { token } : { email, password }) : {}),
        ambiente,
        rutEmisorPrueba: ambiente === "certificacion" && rutPrueba ? normalizarRut(rutPrueba) : null,
      },
      usuario.correo,
    );
    // Se prueba de inmediato: así se sabe al tiro si la clave sirve (no emite nada).
    const r = await probarConexion(empresa.id);
    refrescar();
    return r.ok ? { ok: true, mensaje: `Guardada y probada. ${r.detalle}` } : { ok: true, mensaje: `Guardada, pero la prueba falló: ${r.detalle}` };
  } catch (e) {
    return fallo(e);
  }
}

export async function probarCuentaAction(): Promise<Res> {
  try {
    const { empresa } = await empresaActiva();
    const r = await probarConexion(empresa.id);
    refrescar();
    return r.ok ? { ok: true, mensaje: r.detalle } : { ok: false, error: r.detalle };
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarEmisionAction(habilitar: boolean): Promise<Res> {
  try {
    const { usuario, empresa } = await empresaActiva();
    const c = await estadoCuentaDte(empresa.id);
    if (habilitar) {
      if (!c.cargada) return { ok: false, error: "Primero carga la cuenta de SimpleFactura." };
      if (!c.probadoOk) return { ok: false, error: "Primero prueba la conexión: tiene que salir bien antes de habilitar la emisión." };
    }
    await guardarCuentaDte(empresa.id, { emisionHabilitada: habilitar }, usuario.correo);
    refrescar();
    return { ok: true, mensaje: habilitar ? "Emisión habilitada." : "Emisión deshabilitada: el Core ya no puede emitir ni ceder." };
  } catch (e) {
    return fallo(e);
  }
}

export async function quitarCuentaAction(): Promise<Res> {
  try {
    const { usuario, empresa } = await empresaActiva();
    await borrarCredencialesDte(empresa.id, usuario.correo);
    refrescar();
    return { ok: true, mensaje: "Cuenta quitada. La emisión quedó deshabilitada." };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarCarpetaAction(fd: FormData): Promise<Res> {
  try {
    const { usuario, empresa } = await empresaActiva();
    const carpeta = txt(fd, "carpeta", 400)?.replace(/^\/+|\/+$/g, "") ?? null;
    if (carpeta && /\.\.|[<>:"|?*]/.test(carpeta)) return { ok: false, error: "La ruta de la carpeta tiene caracteres no permitidos." };
    await guardarCuentaDte(empresa.id, { carpetaSp: carpeta }, usuario.correo);
    refrescar();
    return { ok: true, mensaje: "Carpeta guardada." };
  } catch (e) {
    return fallo(e);
  }
}
