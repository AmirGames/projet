import { createServer, type Server } from "node:net";
import { scanFile } from "../antivirus";

let server: Server;
afterEach(async () => { delete process.env.CLAMAV_HOST; delete process.env.CLAMAV_PORT; if (server) await new Promise<void>((resolve) => server.close(() => resolve())); });
async function scanner(answer: string) {
  server = createServer((socket) => {
    socket.once("data", () => { socket.end(answer); });
    socket.on("error", () => {});
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  process.env.CLAMAV_HOST = "127.0.0.1"; process.env.CLAMAV_PORT = String((server.address() as any).port);
}
test("accepte uniquement une confirmation ClamAV OK", async () => { await scanner("stream: OK\0"); await expect(scanFile(Buffer.from("document"))).resolves.toBeUndefined(); });
test("refuse une détection de malware", async () => { await scanner("stream: Eicar-Test-Signature FOUND\0"); await expect(scanFile(Buffer.from("document"))).rejects.toMatchObject({ code: "MALWARE_DETECTED" }); });
test("une erreur ClamAV ne devient jamais une acceptation", async () => { await scanner("stream: size limit exceeded ERROR\0"); await expect(scanFile(Buffer.from("document"))).rejects.toMatchObject({ code: "ANTIVIRUS_UNAVAILABLE" }); });
test("une déconnexion prématurée refuse le document", async () => { await scanner(""); await expect(scanFile(Buffer.from("document"))).rejects.toMatchObject({ code: "ANTIVIRUS_UNAVAILABLE" }); });
test("antivirus non configuré : refus hors tests", async () => {
  const previous = process.env.NODE_ENV; process.env.NODE_ENV = "development";
  try { await expect(scanFile(Buffer.from("document"))).rejects.toMatchObject({ code: "ANTIVIRUS_UNAVAILABLE" }); }
  finally { process.env.NODE_ENV = previous; }
});
