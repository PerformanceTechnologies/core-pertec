import { IconBrandOffice } from "@tabler/icons-react";
import BotonEnviar from "./BotonEnviar";
import { conectarSharePointAction } from "@/app/(protegido)/contratos/[contrato]/conectar";
import { BOTON_PRIMARIO, TARJETA } from "@/lib/contratos/estilos";

/**
 * Lo que ve quien entró al core pero todavía no le dio al core acceso a
 * SharePoint.
 *
 * No es un error: es un paso que falta, y por eso se ve como un paso y no como
 * una pantalla roja. El permiso se pide acá y no en el login porque en el login
 * bloqueaba a cualquiera de otra empresa — ver conectar.ts.
 */
export default function ConectarSharePoint({
  accion = conectarSharePointAction,
}: {
  /**
   * Qué hace el botón. Por omisión vuelve a Contratos; Acreditación pasa la suya
   * para volver a su propia pantalla y para que su guardia sea SU módulo: quien
   * tiene solo Acreditación no puede invocar la acción que exige "contratos".
   */
  accion?: () => Promise<void>;
}) {
  return (
    <div className={`${TARJETA} mt-8 p-8 text-center`}>
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-cian-lavado text-azul">
        <IconBrandOffice size={24} />
      </span>

      <p className="mt-4 text-sm font-bold text-tinta">Falta conectar tu cuenta con SharePoint</p>
      <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-gris">
        Los documentos viven en el sitio Core Pertec y el core los abre en tu nombre, no en el suyo:
        vas a ver exactamente lo que verías entrando a SharePoint con tu cuenta. Microsoft te va a
        pedir que lo autorices una vez.
      </p>

      <form action={accion} className="mt-6">
        <BotonEnviar cargando="Conectando..." className={BOTON_PRIMARIO}>
          Conectar con SharePoint
        </BotonEnviar>
      </form>

      <p className="mx-auto mt-5 max-w-md text-[11px] leading-relaxed text-gris-suave">
        Si Microsoft responde que hace falta la aprobación de un administrador, es porque tu cuenta
        es de otra empresa: esos permisos los tiene que aprobar un administrador de tu directorio, o
        bien pedir que te inviten al sitio CONTRATOS como usuario externo.
      </p>
    </div>
  );
}
