import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-gray-800 text-white">
      {/* Navigation */}
      <nav className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-bold">SaaS Local Commerce</h1>
          <div className="flex gap-4">
            <Link
              href="/login"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Connexion
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg"
            >
              Inscription
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-6 py-20 text-center">
        <h2 className="text-5xl font-bold mb-6">
          Digitalisez votre commerce local
        </h2>
        <p className="text-xl text-gray-400 mb-12">
          Créez votre boutique en ligne, gérez vos commandes et développez votre
          activité avec notre plateforme SaaS
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Feature 1 */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-xl font-bold mb-2">🛒 Boutique en ligne</h3>
            <p className="text-gray-400">
              Créez votre boutique en quelques minutes sans connaissances techniques
            </p>
          </div>

          {/* Feature 2 */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-xl font-bold mb-2">📦 Gestion des commandes</h3>
            <p className="text-gray-400">
              Suivez et gérez vos commandes en temps réel
            </p>
          </div>

          {/* Feature 3 */}
          <div className="bg-gray-800 p-6 rounded-lg border border-gray-700">
            <h3 className="text-xl font-bold mb-2">💳 Paiements sécurisés</h3>
            <p className="text-gray-400">
              Acceptez les paiements par carte bancaire
            </p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-4 justify-center">
          <Link
            href="/signup"
            className="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-lg"
          >
            Commencer gratuitement
          </Link>
          <Link
            href="/store"
            className="px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg text-lg"
          >
            Voir un exemple
          </Link>
        </div>
      </div>

      {/* Demo Section */}
      <div className="bg-gray-800 py-12 mt-12">
        <div className="max-w-6xl mx-auto px-6">
          <h3 className="text-2xl font-bold mb-6 text-center">
            Découvrez notre plateforme
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Link
              href="/store"
              className="bg-gray-700 hover:bg-gray-600 p-6 rounded-lg transition"
            >
              <h4 className="text-xl font-bold mb-2">👥 Vue Client</h4>
              <p className="text-gray-400">Voir la boutique en ligne</p>
            </Link>
            <Link
              href="/dashboard"
              className="bg-gray-700 hover:bg-gray-600 p-6 rounded-lg transition"
            >
              <h4 className="text-xl font-bold mb-2">⚙️ Vue Commerçant</h4>
              <p className="text-gray-400">Gérer votre boutique</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}