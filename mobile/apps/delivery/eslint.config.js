const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  { ignores: ['dist/**', '.expo/**', 'android/**', 'ios/**'] },
  expoConfig,
  {
    rules: {
      // Les écrans synchronisent aussi leur cache hors réseau dans des effets.
      // Garder ces diagnostics visibles comme améliorations de rendu, sans
      // les confondre avec les erreurs de hooks ou de typage.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]);
