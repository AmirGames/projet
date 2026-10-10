// Les plugins otplib 13 utilisent des dépendances ESM ; Jest exécute les suites en CJS.
const { transformSync } = require('esbuild');
module.exports = { process(source, filename) { return { code: transformSync(source, { sourcefile: filename, format: 'cjs', target: 'node22' }).code }; } };
