import { createConnection } from "node:net";
import { ApiError } from "../../middleware/api-error";

/** ClamAV INSTREAM : aucune commande shell ni nom fourni par le client. */
export async function scanFile(buffer: Buffer): Promise<void> {
  const host = process.env.CLAMAV_HOST;
  if (!host && process.env.NODE_ENV === "test") return;
  if (!host) throw new ApiError(503, "Antivirus indisponible", "ANTIVIRUS_UNAVAILABLE");
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host, port: Number(process.env.CLAMAV_PORT || 3310) });
    let response = "", settled = false;
    const end = (error?: Error) => {
      if (settled) return;
      settled = true; socket.destroy();
      if (error) reject(error); else resolve();
    };
    socket.setTimeout(15000, () => end(new ApiError(503, "Antivirus indisponible", "ANTIVIRUS_UNAVAILABLE")));
    socket.on("error", () => end(new ApiError(503, "Antivirus indisponible", "ANTIVIRUS_UNAVAILABLE")));
    socket.on("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      for (let offset = 0; offset < buffer.length; offset += 64 * 1024) {
        const chunk = buffer.subarray(offset, offset + 64 * 1024);
        const size = Buffer.alloc(4); size.writeUInt32BE(chunk.length);
        socket.write(size); socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
    socket.on("data", (chunk) => {
      response += chunk.toString("utf8");
      if (response.length > 4096) return end(new ApiError(503, "Réponse antivirus invalide", "ANTIVIRUS_UNAVAILABLE"));
      if (!response.includes("\0") && !response.includes("\n")) return;
      if (/^stream: OK[\0\r\n]*$/.test(response)) return end();
      return end(/ FOUND[\0\r\n]*$/.test(response)
        ? new ApiError(400, "Fichier refusé par l'antivirus", "MALWARE_DETECTED")
        : new ApiError(503, "Analyse antivirus impossible", "ANTIVIRUS_UNAVAILABLE"));
    });
    socket.on("close", () => { if (!settled) end(new ApiError(503, "Analyse antivirus incomplète", "ANTIVIRUS_UNAVAILABLE")); });
  });
}
