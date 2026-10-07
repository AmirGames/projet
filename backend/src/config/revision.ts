/**
 * Le commit construit dans l'image (GIT_SHA, posé au build par deploy/zup.sh),
 * en 12 caractères ; « inconnue » hors déploiement ou si la valeur est
 * étrangère. Exposé par /health : il dit quel correctif tourne.
 */
export function revisionDuBuild(env: NodeJS.ProcessEnv = process.env): string {
  const sha = (env.GIT_SHA || "").trim();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 12) : "inconnue";
}
