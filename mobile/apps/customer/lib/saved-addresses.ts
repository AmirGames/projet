import type { DeliveryAddress } from "./session";

export interface SavedAddress extends DeliveryAddress {
  id: string;
  kind: "HOME" | "WORK" | "OTHER";
  name: string;
}
export const addressName = (a: Pick<SavedAddress, "kind" | "name">) =>
  a.kind === "HOME" ? "Domicile" : a.kind === "WORK" ? "Travail" : a.name;
export const addressIcon = (kind: SavedAddress["kind"]) =>
  kind === "HOME" ? "🏠" : kind === "WORK" ? "💼" : "☆";
