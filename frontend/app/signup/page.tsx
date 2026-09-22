"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Link from "next/link";
import { espaceDAccueilLocal } from '@/lib/espace-utilisateur';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);

    try {
      const result = await api.signup(email, password, name);

      if (result.error) {
        setError(result.error || result.message || "Erreur d'inscription");
        return;
      }

      // Save tokens and user role
      localStorage.setItem("accessToken", result.accessToken);
      localStorage.setItem("refreshToken", result.refreshToken);
      localStorage.setItem("isSuperOwner", result.user?.isSuperOwner ? "true" : "false");

      // Show success message briefly
      setError("");

      // Redirect based on role
      if (result.user?.isSuperOwner) {
        router.push("/superowner");
      } else {
        router.push(espaceDAccueilLocal());
      }
    } catch (err) {
      setError("Erreur d'inscription");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6 py-12">
      <div className="bg-white border border-slate-200 p-8 rounded-3xl shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-slate-900 mb-6 text-center">
          Inscription
        </h1>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-900 p-4 rounded-lg mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-4">
          <div>
            <label className="block text-slate-700 font-medium mb-2">Nom</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Votre nom"
              required
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="your@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-2">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
              required
            />
          </div>

          <div>
            <label className="block text-slate-700 font-medium mb-2">Confirmer le mot de passe</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 text-slate-900 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="••••••••"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-hover text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 transition"
          >
            {loading ? "Inscription..." : "S'inscrire"}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-slate-600">
            Déjà inscrit?{" "}
            <Link href="/login" className="text-primary hover:text-primary-hover font-medium transition">
              Se connecter
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}