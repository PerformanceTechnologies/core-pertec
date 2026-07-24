// Script exploratorio: verifica login contra Odoo via JSON-RPC.
// No imprime la clave de API en ningun momento.
const url = process.env.ODOO_URL;
const db = process.env.ODOO_DB;
const login = process.env.ODOO_LOGIN;
const apiKey = process.env.ODOO_API_KEY;

if (!url || !db || !login || !apiKey) {
  console.error("Faltan ODOO_URL / ODOO_DB / ODOO_LOGIN / ODOO_API_KEY en el entorno.");
  process.exit(1);
}

async function llamarJsonRpc(service, method, args) {
  const res = await fetch(`${url}/jsonrpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "call",
      params: { service, method, args },
      id: Math.floor(Math.random() * 1e6),
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(JSON.stringify(json.error));
  return json.result;
}

async function main() {
  const uid = await llamarJsonRpc("common", "authenticate", [db, login, apiKey, {}]);
  if (!uid) {
    console.error("Login fallido: uid=false (revisa db/login/api key).");
    process.exit(1);
  }
  console.log("Login OK. uid =", uid);

  const version = await llamarJsonRpc("common", "version", []);
  console.log("Version Odoo:", version.server_version);

  // Prueba minima de lectura: contar arriendos/ventas via sale.order
  const count = await llamarJsonRpc("object", "execute_kw", [
    db, uid, apiKey,
    "sale.order", "search_count",
    [[]],
  ]);
  console.log("Total sale.order visibles:", count);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
