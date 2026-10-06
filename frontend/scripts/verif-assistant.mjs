// Vérification locale uniquement : crée des demandes réelles dans la base de développement.
import { pathToFileURL, fileURLToPath } from "node:url";
import path from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE_PATH
    ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href
    : "playwright"
);
const site = process.env.VERIF_SITE_URL || "http://127.0.0.1:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(site).hostname))
  throw new Error("Ce script crée des demandes : URL locale obligatoire");
const outputDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../docs/assistant-verification",
);
import fs from "node:fs";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const results = [];
fs.mkdirSync(outputDir, { recursive: true });
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(site + "/zupone", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Ouvrir Assistant ZupOne" }).click();
  await page
    .getByText(
      "Bonjour 👋 Je suis l’assistant IA ZupOne. Votre demande concerne quel service ?",
    )
    .waitFor({ timeout: 60000 });
  const dialog = page.getByRole("dialog", { name: "Assistant ZupOne" });
  await dialog.getByRole("button", { name: "ZupEat", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Support clients", exact: true })
    .waitFor();
  await dialog
    .getByRole("button", { name: "Support clients", exact: true })
    .click();
  const guides = dialog.getByRole("region", { name: "Aide guidée" });
  await guides
    .getByRole("button", { name: "Commande en retard", exact: true })
    .click();
  await dialog
    .getByText("Mode aide guidée — IA indisponible.", { exact: false })
    .waitFor();
  await dialog.getByText("Connectez-vous", { exact: true }).first().waitFor();
  if (
    await guides
      .getByRole("button", { name: "Horaires de l’établissement" })
      .count()
  )
    throw Error("guide d’une autre spécialité affiché");
  const beforeFollowup = await dialog
    .getByRole("log")
    .locator("article")
    .count();
  await dialog
    .getByRole("textbox", { name: "Votre message à Assistant ZupOne" })
    .fill("et ensuite ?");
  await dialog.getByRole("button", { name: "Envoyer le message" }).click();
  await page.waitForFunction(
    (previous) =>
      document.querySelectorAll('[role="log"] article').length >= previous + 2,
    beforeFollowup,
  );
  const followup = await dialog
    .getByRole("log")
    .locator("article")
    .last()
    .innerText();
  if (!followup.includes("Actualiser le suivi"))
    throw Error("relance sans aide adaptée");
  await dialog
    .getByRole("textbox", { name: "Votre message à Assistant ZupOne" })
    .fill(
      'Allergènes <img src=x onerror="window.assistantXss=true"> [lien](javascript:alert(1))',
    );
  await dialog.getByRole("button", { name: "Envoyer le message" }).click();
  await dialog
    .getByText(
      "Je ne dispose pas de données d’allergènes validées pour cet article.",
      { exact: false },
    )
    .waitFor();
  if (await page.evaluate(() => window.assistantXss))
    throw Error("HTML executed");
  if (await dialog.locator('a[href^="javascript:"]').count())
    throw Error("unsafe link");
  await dialog.getByRole("button", { name: "Parler à un conseiller" }).click();
  await dialog
    .getByRole("textbox", { name: "Motif à transmettre au conseiller" })
    .fill("Question allergènes : besoin de conseiller");
  await dialog.getByRole("button", { name: "Transmettre ma demande" }).click();
  await dialog
    .getByText("Demande de conseiller enregistrée", { exact: true })
    .waitFor();
  await page.screenshot({
    path: path.join(
      outputDir,
      `${viewport.width > 1000 ? "desktop" : "mobile"}.png`,
    ),
  });
  const box = await dialog.boundingBox();
  if (box.width > viewport.width || box.height > viewport.height)
    throw Error("widget overflow");
  if (viewport.width < 1000) {
    // Simule la réduction de la zone visible par un clavier virtuel.
    await page.setViewportSize({ width: viewport.width, height: 420 });
    await dialog
      .getByRole("textbox", { name: "Votre message à Assistant ZupOne" })
      .focus();
    const reduced = await dialog.boundingBox();
    if (
      reduced.height > 420 ||
      reduced.y < 0 ||
      reduced.y + reduced.height > 420
    )
      throw Error("widget overflow with keyboard viewport");
    await page.setViewportSize(viewport);
  }
  await dialog.getByRole("button", { name: "Fermer Assistant ZupOne" }).focus();
  await page.keyboard.press("Shift+Tab");
  if (!(await dialog.evaluate((el) => el.contains(document.activeElement))))
    throw Error("focus escaped");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Ouvrir Assistant ZupOne" }).waitFor();
  results.push({
    viewport,
    widget: box,
    errors,
    htmlSafe: true,
    handoff: true,
    guidedFaq: true,
    guidedFollowup: true,
    keyboard: true,
    reducedViewport: viewport.width < 1000,
  });
  await page.close();
}
await browser.close();
fs.writeFileSync(
  path.join(outputDir, "ui-results.json"),
  JSON.stringify(results, null, 2),
);
console.log(JSON.stringify(results));
