import fs from "node:fs/promises";
import { resolve, sep } from "node:path";
import { decrypt, encrypt } from "../privacy/crypto";

export const privateRoot = () => resolve(process.env.PRIVATE_DOCUMENTS_DIR || "private-documents");
export function privatePath(relative: string): string {
  if (!/^(drivers|merchants|deliveries|chauffeurs)\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(relative) || relative.includes("..")) throw new Error("Chemin privé invalide");
  const path = resolve(privateRoot(), relative);
  if (!path.startsWith(privateRoot() + sep)) throw new Error("Chemin privé invalide");
  return path;
}
export async function writePrivate(relative: string, buffer: Buffer) {
  const path = privatePath(relative);
  await fs.mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
  await fs.writeFile(path, encrypt(buffer, `file:${relative}`), { mode: 0o600, flag: "wx" });
}
export async function readPrivate(relative: string): Promise<Buffer> {
  const path = privatePath(relative);
  const real = await fs.realpath(path);
  if (real !== path || !(await fs.lstat(path)).isFile()) throw new Error("Fichier privé invalide");
  return decrypt(await fs.readFile(path, "utf8"), `file:${relative}`);
}
export async function removePrivate(relative: string) {
  try { await fs.unlink(privatePath(relative)); }
  catch (error: any) { if (error.code !== "ENOENT") throw error; }
}
