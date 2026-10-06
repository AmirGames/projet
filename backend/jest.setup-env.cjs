// Charge .env.test avant les tests : sans lui, la validation d'environnement
// arrête Jest (process.exit) dès qu'un module lit la configuration. Les
// variables déjà définies (CI) restent prioritaires.
require("dotenv").config({ path: require("path").join(__dirname, ".env.test") });
