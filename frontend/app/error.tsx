'use client';

import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="text-6xl font-bold mb-4">⚠️ Erreur</h1>
        <p className="text-xl text-gray-400 mb-6">
          Une erreur inattendue s'est produite
        </p>
        {error.message && (
          <p className="text-gray-500 mb-8 text-sm bg-gray-800 p-4 rounded">
            {error.message}
          </p>
        )}
        <div className="flex gap-4 justify-center">
          <button
            onClick={reset}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
          >
            Réessayer
          </button>
          <Link
            href="/"
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold"
          >
            Accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
