import { createApp } from "../../src/app";
import express from "express";
import { resolve } from "node:path";

if (process.env.NODE_ENV !== "test" || !new URL(process.env.DATABASE_URL!).pathname.includes("mfa_test")) {
  throw new Error("Ce serveur exige NODE_ENV=test et une base dédiée mfa_test");
}
const app = createApp();
const api = app.listen(3001, "127.0.0.1");
const mobile = express(); mobile.use(express.static(resolve("../.tmp/a05-admin-web")));
const admin = mobile.listen(3302, "127.0.0.1");
console.log("Serveurs MFA de test : API 3001, export admin 3302 ; aucun worker financier.");
process.on("SIGTERM", () => { api.close(); admin.close(); });
