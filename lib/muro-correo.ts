// El correo de «Notificar a todos» del Muro: quién publicó, el texto y un botón al Muro.
// Estilos en línea y tablas, como lib/tareas-correo.ts.

const URL_CORE = "https://core.pertec.cl";

function esc(texto: string): string {
  return texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function asuntoCorreoMuro(autor: string, texto: string): string {
  const linea = texto.replace(/\s+/g, " ").trim();
  return `${autor} en el Muro: ${linea.length > 80 ? `${linea.slice(0, 80)}…` : linea}`.slice(0, 180);
}

export function armarCorreoMuro(autor: string, empresa: string, texto: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#faf8f5;padding:32px 0">
  <tr><td align="center">
    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:100%;background:#ffffff;border:1px solid #e7e1d8;border-radius:14px;overflow:hidden">
      <tr><td style="background:#171411;padding:22px 28px">
        <div style="font:700 12px/1.4 Arial,sans-serif;letter-spacing:1.6px;text-transform:uppercase;color:#c85217">Aviso para todos · Muro de ${esc(empresa)}</div>
        <div style="font:700 20px/1.35 Arial,sans-serif;color:#faf8f5;margin-top:4px">${esc(autor)} publicó en el Muro</div>
      </td></tr>
      <tr><td style="padding:22px 28px 8px 28px">
        <div style="background:#faf8f5;border:1px solid #efe9e1;border-radius:10px;padding:14px 16px;font:15px/1.6 Arial,sans-serif;color:#171411;white-space:pre-wrap">${esc(texto)}</div>
      </td></tr>
      <tr><td style="padding:16px 28px 26px 28px">
        <a href="${URL_CORE}/muro" style="display:inline-block;background:#c85217;color:#ffffff;text-decoration:none;font:700 14px/1 Arial,sans-serif;padding:12px 20px;border-radius:10px">Ver en el Muro</a>
      </td></tr>
    </table>
    <div style="font:12px/1.5 Arial,sans-serif;color:#8a8178;margin-top:14px">Te llegó porque alguien marcó «Notificar a todos» en el Muro del Core.</div>
  </td></tr>
</table>`;
}
