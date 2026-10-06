// SDK per le pagine dei tool, servito su /__sharebox/sdk.js. Uso:
//   <script src="/__sharebox/sdk.js"></script>
//   const io = await sharebox.me();                       // { email, name, role }
//   const ferie = sharebox.collection("ferie");
//   await ferie.add({ dal: "2026-08-01", al: "2026-08-15" });
//   const tutte = await ferie.list();                     // [{ id, data, owner, createdAt, updatedAt, canEdit }]
//   await ferie.update(id, { ... });  await ferie.remove(id);
export const SDK_SOURCE = `(() => {
  async function call(method, path, body) {
    const response = await fetch(path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // Sessione scaduta: ricaricando la pagina si passa di nuovo dal login.
    if (response.status === 401) { location.reload(); throw new Error("Accesso scaduto"); }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || "Errore " + response.status);
      error.status = response.status;
      throw error;
    }
    return result;
  }
  const base = "/__sharebox/api/collections/";
  window.sharebox = {
    me: () => call("GET", "/__sharebox/me"),
    collection(name) {
      const path = base + encodeURIComponent(name);
      return {
        list: async () => (await call("GET", path)).records,
        add: async (data) => (await call("POST", path, { data })).record,
        update: async (id, data) => (await call("PATCH", path + "/" + encodeURIComponent(id), { data })).record,
        remove: async (id) => { await call("DELETE", path + "/" + encodeURIComponent(id)); },
      };
    },
  };
})();
`;
