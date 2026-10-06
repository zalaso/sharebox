// Errori dell'API dati dei tool in italiano e inglese. La lingua viene dall'header Accept-Language,
// che il browser manda con le chiamate dell'SDK. Il codice resta nella risposta (`code`),
// così il codice di un tool può riconoscere l'errore senza confrontare il testo.
import { format, pickLang, type Lang } from "@sharebox/shared";
import { COLLECTION_LIMITS } from "./collections";

export type ErrorCode =
  | "record_not_found"
  | "not_yours"
  | "not_object"
  | "record_too_big"
  | "storage_full"
  | "invalid_collection"
  | "not_found"
  | "login_required"
  | "method_not_allowed"
  | "too_large"
  | "invalid_json"
  | "page_not_found";

const MESSAGES: Record<Lang, Record<ErrorCode, string>> = {
  it: {
    record_not_found: "Record non trovato",
    not_yours: "Puoi modificare solo i record che hai creato tu",
    not_object: "I dati di un record devono essere un oggetto JSON",
    record_too_big: "Record troppo grande (massimo {kb} KB)",
    storage_full: "Spazio dati del tool esaurito",
    invalid_collection: "Nome della collezione non valido (lettere, cifre, - e _, massimo 40)",
    not_found: "Non trovato",
    login_required: "Accesso richiesto",
    method_not_allowed: "Operazione non consentita",
    too_large: "Richiesta troppo grande",
    invalid_json: "JSON non valido",
    page_not_found: "Pagina non trovata",
  },
  en: {
    record_not_found: "Record not found",
    not_yours: "You can only change records you created",
    not_object: "The data of a record must be a JSON object",
    record_too_big: "Record too large (at most {kb} KB)",
    storage_full: "The tool's data storage is full",
    invalid_collection: "Invalid collection name (letters, digits, - and _, at most 40)",
    not_found: "Not found",
    login_required: "Sign-in required",
    method_not_allowed: "Operation not allowed",
    too_large: "Request too large",
    invalid_json: "Invalid JSON",
    page_not_found: "Page not found",
  },
};

export function message(request: Request, code: ErrorCode): string {
  return format(MESSAGES[pickLang(request.headers.get("accept-language"))][code], { kb: COLLECTION_LIMITS.maxRecordBytes / 1024 });
}
