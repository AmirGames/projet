import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
      <div className="text-center max-w-md">
        <h1 className="text-8xl font-bold mb-4 text-blue-500">404</h1>
        <h2 className="text-3xl font-bold mb-4">Page non trouvée</h2>
        <p className="text-xl text-gray-400 mb-8">
          Désolé, la page que vous recherchez n'existe pas ou a été supprimée.
        </p>
        <div className="flex gap-4 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold"
          >
            Retour à l'accueil
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold"
          >
            Tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
