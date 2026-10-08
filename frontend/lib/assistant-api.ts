import { jetonAcces } from '@/lib/jeton-session';
import { renouveler } from "./jeton-session";

export type Service = "ONE" | "EAT" | "DRIVE";
export type Category =
  | "orientation"
  | "customer"
  | "restaurant"
  | "courier"
  | "passenger"
  | "driver"
  | "partner"
  | "commercial";
export interface AssistantConfig {
  name: string;
  service: Service;
  surface: string;
  mode: string;
  provider: "ollama" | "openai";
  welcome: string;
  authenticated: boolean;
  suggestedCategory: Category | null;
  authorizedCategories: Category[];
  privacyUrl: string;
  retentionDays: number;
  guideQuestions: {
    id: string;
    service: Service;
    category: Category;
    title: string;
    question: string;
  }[];
  categories: {
    id: Category;
    service: Service;
    agentId: string;
    label: string;
  }[];
}
export interface Conversation {
  id: string;
  service: Service;
  category: Category | null;
  specialty: string;
  storeId: string | null;
  storeName: string | null;
  segment: number;
  state: string;
  expiresAt: string;
  messages: {
    id: string;
    author: string;
    content: string;
    service: Service;
    segment: number;
    mode: string;
    state: string;
  }[];
  actions: { id: string; summary: string; state: string; expiresAt: string }[];
  handoffs: {
    id: string;
    state: string;
    reply: string | null;
    ticketId: string | null;
    service: Service;
    specialty: string;
    segment: number;
  }[];
}
export async function assistantRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const run = async () => {
    const token = jetonAcces();
    return fetch(`/api/assistant/${path}`, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  let response = await run();
  if (response.status === 401 && jetonAcces()) {
    const renewed = await renouveler();
    if (renewed.ok) response = await run();
  }
  if (!response.ok) {
    let message = "Assistant indisponible. Vérifiez votre connexion.";
    try {
      const data = await response.json();
      if (typeof data.error === "string") message = data.error;
    } catch {
      /* message public */
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const serviceLabels: Record<Service, string> = {
  ONE: "ZupOne",
  EAT: "ZupEat",
  DRIVE: "ZupDrive",
};
// Le libellé de chaque catégorie : `assistant.categories.<id>` des traductions.
