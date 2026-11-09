import { auth } from "@/auth";
import { obtenerUsuarioActivo } from "@/lib/usuarios";
import { listarAplicaciones } from "@/lib/aplicaciones";
import { filtrarAppsDelUsuario, subpanelesFinanzasDelMenu } from "@/lib/menu-usuario";
import { armarMenu } from "@/lib/menu-modelo";
import GrillaDeModulos from "@/components/modulos/GrillaDeModulos";
import WidgetCalendario from "@/components/WidgetCalendario";
import AvanceDelDia, { puedeVerResumenDelDia } from "@/components/mi-dia/AvanceDelDia";
import { contextoDeEmpresa } from "@/lib/empresas";
import { tieneDatosCargados } from "@/lib/empresas-modelo";

const ZONA_HORARIA = "America/Santiago";

function fechaDeHoy(): string {
  const formateada = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_HORARIA,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  return formateada.charAt(0).toUpperCase() + formateada.slice(1);
}

export default async function DashboardPage() {
  const session = await auth();
  const usuario = await obtenerUsuarioActivo(session?.user?.email);
  if (!usuario) return null; // el layout ya redirige antes de llegar aquí

  const apps = filtrarAppsDelUsuario(await listarAplicaciones(), usuario);
  // El Inicio muestra los MÓDULOS principales (Finanzas, CRM, Contratos…), no cada aplicación
  // que cuelga de ellos: esas se ven al entrar al módulo. Es el mismo armado que el menú de la
  // izquierda (armarMenu), así que cada persona ve acá exactamente los módulos que ve allá.
  // «Administración» no va: es configuración del Core y siempre se llegó a ella por el menú.
  // Mi Día tampoco: su resumen está destacado arriba con su propio botón (armarMenu ya lo deja fuera).
  // Proyectos tampoco: está en pausa (lib/apps-pausadas.ts) y filtrarAppsDelUsuario ya lo sacó.
  const modulos = armarMenu(apps, await subpanelesFinanzasDelMenu(usuario, apps));
  const primerNombre = usuario.nombre?.split(" ")[0];
  // El resumen del día sale de los datos de PERTEC: en otra empresa no va.
  const { activa } = await contextoDeEmpresa(usuario.id, usuario.rol);
  const veResumen = tieneDatosCargados(activa) && (await puedeVerResumenDelDia(usuario));

  return (
    // En el celular el orden es: saludo, resumen, módulos y al final el calendario (max-lg:contents
    // deja que el resumen y el calendario se ordenen sueltos dentro de esta columna).
    <div className="flex flex-col">
      <span className="etiqueta-seccion">{fechaDeHoy()}</span>
      <h1 className="mt-2 font-condensed text-4xl font-bold uppercase leading-none text-tinta sm:text-5xl">
        Hola{primerNombre ? `, ${primerNombre}` : ""}
      </h1>
      {/* En vez del párrafo que explicaba qué es el Dashboard y a qué hora
          entraste —que nadie necesita después de la primera vez— acá va el
          adelanto del resumen del día: lo único que a esta altura de la mañana
          hace falta saber antes de elegir a dónde entrar.

          Solo lee la caché; si no hay resumen de hoy, invita a abrir Mi Día. */}
      {/* El resumen y el calendario comparten fila: son las dos cosas que
          hablan de HOY, y una arriba de la otra dejaba el calendario a media
          página de distancia de su contexto. Las aplicaciones bajan a su propia
          franja, y de paso ganan el ancho completo para la grilla.

          items-start para que el calendario no se estire a la altura del
          resumen: es una tarjeta de alto fijo, estirada quedaba con un vacío
          abajo. */}
      <div className="mt-6 max-lg:contents lg:flex lg:items-start lg:gap-6">
        {veResumen && (
          <div className="min-w-0 max-lg:mt-5 lg:flex-1">
            <AvanceDelDia usuario={usuario} />
          </div>
        )}

        {/* El rótulo "Hoy / Tu calendario" se fue: ocupaba unos 60px arriba del
            widget y dejaba al calendario arrancando bastante más abajo que la
            tarjeta del resumen, con la que ahora comparte fila. El widget ya
            trae su propio encabezado con el mes y el ícono, así que el rótulo
            era un segundo título para lo mismo.

            Queda como sr-only para que la estructura de encabezados de la
            página siga completa para un lector de pantalla.

            Sin resumen al lado (rol sin acceso a Mi Día) el calendario se queda
            en su ancho y a la izquierda. Las clases se eligen enteras y no se
            apilan dos anchos lg: cuál gana depende del orden en el CSS
            generado, no del orden en que se escriben acá. */}
        <div className={`${veResumen ? "mt-8 lg:mt-0 lg:w-[264px] lg:shrink-0" : "mt-8 lg:mt-0 lg:w-[264px]"} max-lg:order-last`}>
          <h2 className="sr-only">Tu calendario</h2>
          <WidgetCalendario />
        </div>
      </div>

      <div className="mt-8 lg:mt-10">
        <span className="etiqueta-seccion">Accesos</span>
        <h2 className="mt-2 font-condensed text-lg font-bold uppercase text-tinta">Tus módulos</h2>

        {modulos.length === 0 ? (
          <p className="mt-4 text-sm text-tinta/60">
            Todavía no tienes aplicaciones asignadas. Pídele a un administrador que te dé acceso.
          </p>
        ) : (
          <GrillaDeModulos grupos={modulos} />
        )}
      </div>
    </div>
  );
}
