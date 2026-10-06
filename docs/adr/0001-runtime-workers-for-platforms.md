# 0001 — I tool girano su Cloudflare Workers for Platforms

Stato: sostituito da [0005](0005-server-netcup-container-gvisor.md) (2026-09-26)

## Contesto
I tool sono codice non fidato, scritto da agenti per conto di chiunque. Servono isolamento tra tool e dalla piattaforma, limiti di risorse per tool, un database separato per ciascuno e HTTPS su un sottodominio proprio.

## Decisione
Ogni tool è uno script in un dispatch namespace di Workers for Platforms. Un dispatch Worker (il gateway) è l'unico punto d'ingresso e applica login, ACL e limiti (`cpuMs`, `subRequests`) a ogni richiesta. Ogni tool ha un D1 dedicato collegato solo al proprio script.

## Alternative scartate
- **VPS con container + gVisor/Firecracker**: nessun vincolo di linguaggio, ma isolamento, TLS on-demand, quote e scheduling vanno costruiti e mantenuti in proprio.
- **Cloudflare Access davanti ai tool**: pensato per gli utenti di un'organizzazione, prezzo per utente, non adatto a un servizio multi-tenant.

## Conseguenze
- I tool sono JS/TS/WASM. Per i tool costruiti da agenti è quasi sempre sufficiente.
- Dipendenza da Cloudflare: la logica di piattaforma resta in pacchetti propri e i tool nel formato standard dei Worker. `workerd` self-hosted da solo non è una sandbox per codice non fidato: un'eventuale migrazione va progettata a parte.
- Costo base Workers Paid + WfP, poi a consumo.
