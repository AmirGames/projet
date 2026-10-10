import { codeErreur } from "../../utils/code-erreur";
const sensitive = /password|secret|token|cipher|recovery|^code$|otp|authorization|cookie|iban|bic|accountHolder|email|phone|telephone|address|adresse|latitude|longitude|(?:^|_)lat$|(?:^|_)lng$|documentUrl|fileName|filename|body|search|savedAddresses|ownerFirstName|ownerLastName|ownerBirthDate|reason|motif|stack|changes/i;
export function redact(value: string, depth?: number): string;
export function redact(value: Record<string, unknown>, depth?: number): Record<string, unknown>;
export function redact(value: unknown, depth?: number): unknown;
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[masqué]";
  if (typeof value === "string") return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email masqué]").replace(/\b[A-Z]{2}\d{2}(?:[\s]?[A-Z0-9]){11,30}\b/g, "[IBAN masqué]").replace(/\bzupenc:v1:[^\s"]+/g, "[chiffré]").replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[jeton masqué]");
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, code: codeErreur(value) };
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sensitive.test(key) ? "[masqué]" : redact(child, depth + 1)]));
  return value;
}
