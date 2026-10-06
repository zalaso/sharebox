// Worker di esempio: risponde alle rotte che non corrispondono a un file in public/.
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/saluto") {
      const nome = decodeURIComponent(request.headers.get("x-sharebox-name") ?? "");
      return Response.json({
        messaggio: `Ciao ${nome || "sconosciuto"}, questo lo ha calcolato il worker`,
        ruolo: request.headers.get("x-sharebox-role"),
        ora: new Date().toISOString(),
      });
    }
    return new Response("Non trovato", { status: 404 });
  },
};
