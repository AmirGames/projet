import { createConnection } from "node:net";

/** Sonde TCP ClamAV, indépendante de la readiness HTTP générale. */
export function sonderClamav(host: string, port: number, delaiMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port });
    let reponse = "";
    let termine = false;
    const finir = (ok: boolean) => {
      if (termine) return;
      termine = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(delaiMs, () => finir(false));
    socket.once("error", () => finir(false));
    socket.once("connect", () => socket.write(Buffer.from([0x7a, 0x50, 0x49, 0x4e, 0x47, 0x00])));
    socket.on("data", (chunk) => {
      reponse += chunk.toString("utf8");
      if (reponse.includes("PONG")) finir(true);
      else if (reponse.length > 64) finir(false);
    });
    socket.once("close", () => finir(false));
  });
}
