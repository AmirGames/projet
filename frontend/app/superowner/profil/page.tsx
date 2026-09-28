'use client';

import { Mail, UserCircle } from 'lucide-react';
import ChangerMotDePasse from '@/components/ChangerMotDePasse';
import { useAuth } from '@/lib/auth-context';

/**
 * Le compte du membre de l'équipe connecté : qui il est, et de quoi changer
 * son mot de passe sans passer par un lien envoyé par e-mail.
 */
export default function ProfilEquipe() {
  const { user } = useAuth();

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2">
        <UserCircle size={28} className="text-red-500" />
        Mon profil
      </h1>

      {user && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 space-y-2">
          {user.name && <p className="text-lg font-semibold text-white">{user.name}</p>}
          <p className="flex items-center gap-2 text-gray-400 break-all">
            <Mail size={16} /> {user.email}
          </p>
        </div>
      )}

      <ChangerMotDePasse />
    </div>
  );
}
