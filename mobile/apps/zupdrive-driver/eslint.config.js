const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  { ignores: ['dist/**', '.expo/**', 'android/**', 'ios/**'] },
  expoConfig,
  {
    rules: {
      // lib/useEffectChargement.ts : un effet dont on vérifie les dépendances.
      'react-hooks/exhaustive-deps': ['warn', { additionalHooks: '^useEffectChargement$' }],
      // Les écrans synchronisent aussi leur cache hors réseau dans des effets.
      'react-hooks/set-state-in-effect': 'warn',
      // Règles du compilateur React : ce code a été écrit avant elles. Elles
      // restent visibles en avertissements, à réduire sans bloquer la CI
      // (même démarche que l'app livreur).
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/use-memo': 'warn',
      // Dans <Text> de React Native, l'apostrophe n'a rien à échapper (pas de HTML).
      'react/no-unescaped-entities': 'off',
    },
  },
]);
