// Uscita verso internet dei tool (ADR 0009): ogni fetch del codice del tool verso l'esterno passa da qui.
// Senza token (il tool non ha dichiarato domini in network.allow) la richiesta viene rifiutata.
// Con il token, viene inoltrata al proxy della piattaforma, che controlla il dominio, inserisce i segreti
// e la esegue. Il token non è raggiungibile dal codice del tool: è un binding solo di questo worker.
export default {
  async fetch(request, env) {
    if (!env.EGRESS_URL || !env.EGRESS_TOKEN) {
      return new Response(
        "ShareBox tools have no internet access: declare the domain in network.allow in sharebox.json",
        { status: 502, headers: { "content-type": "text/plain" } },
      );
    }
    const headers = new Headers(request.headers);
    headers.set("x-sharebox-egress-token", env.EGRESS_TOKEN);
    headers.set("x-sharebox-egress-target", request.url);
    return fetch(`${env.EGRESS_URL}/fetch`, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
  },
};
