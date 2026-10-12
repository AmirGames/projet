import { createServer, type Server } from "node:net";
import { sonderClamav } from "../sondes.service";

let serveur: Server | undefined;
afterEach(async () => {
  if (serveur) await new Promise<void>((resolve) => serveur!.close(() => resolve()));
  serveur = undefined;
});

async function ecouter(reponse?: string) {
  serveur = createServer((socket) => {
    socket.once("data", (donnees) => {
      expect(donnees).toEqual(Buffer.from([0x7a, 0x50, 0x49, 0x4e, 0x47, 0x00]));
      if (reponse !== undefined) socket.end(reponse);
    });
  });
  await new Promise<void>((resolve) => serveur!.listen(0, "127.0.0.1", resolve));
  return (serveur.address() as { port: number }).port;
}

it("reconnaît uniquement le PONG du protocole ClamAV", async () => {
  const port = await ecouter("PONG\0");
  await expect(sonderClamav("127.0.0.1", port)).resolves.toBe(true);
});

it("borne le délai d'une sonde qui ne répond pas", async () => {
  const port = await ecouter();
  const depart = Date.now();
  await expect(sonderClamav("127.0.0.1", port, 40)).resolves.toBe(false);
  expect(Date.now() - depart).toBeLessThan(500);
});

it("traite une connexion refusée comme une panne", async () => {
  await expect(sonderClamav("127.0.0.1", 1, 100)).resolves.toBe(false);
});
