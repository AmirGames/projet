import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import ChampAdresse from '../../components/ChampAdresse';
import { Card, COLORS } from '../../components/ui';
import { messageErreur, useToken } from '../../lib/auth';
import {
  cleAleatoire,
  commanderTrajet,
  demanderDevis,
  enregistrerAdresseFavorite,
  kilometres,
  mesAdressesFavorites,
  mesTrajets,
  minutes,
  prix,
  STATUTS_ACTIFS,
  type AdresseFavorite,
  type AdresseTrajet,
  type Devis,
  type ResumeTrajet,
  type TypeAdresseFavorite,
} from '../../lib/courses';

/**
 * Commander un trajet : départ, arrivée, prix fixé par le serveur, commande.
 * Le prix affiché est celui du devis signé, renvoyé tel quel à la commande.
 */
export default function Commander() {
  const router = useRouter();
  const token = useToken();
  const [depart, setDepart] = useState<AdresseTrajet | null>(null);
  const [arrivee, setArrivee] = useState<AdresseTrajet | null>(null);
  const [devis, setDevis] = useState<Devis | null>(null);
  // Une clé par devis, gardée tant que le devis ne change pas : un double
  // appui ou un réseau coupé rend la même course.
  const cle = useRef('');
  const [envoi, setEnvoi] = useState<'devis' | 'commande' | null>(null);
  const [erreur, setErreur] = useState('');
  const [info, setInfo] = useState('');
  const [favorites, setFavorites] = useState<AdresseFavorite[]>([]);
  const [enCours, setEnCours] = useState<ResumeTrajet | null>(null);
  // Remonte les champs d'adresse pour les vider après une commande.
  const [formulaire, setFormulaire] = useState(0);
  const commandeEnVol = useRef(false);

  // Un trajet déjà en cours se suit, il ne se double pas.
  useFocusEffect(
    useCallback(() => {
      let vivant = true;
      mesAdressesFavorites(token)
        .then((liste) => {
          if (vivant) setFavorites(liste);
        })
        .catch(() => {
          // Un raccourci en moins n'empêche pas de commander.
        });
      mesTrajets(token)
        .then((liste) => {
          if (vivant) setEnCours(liste.find((t) => STATUTS_ACTIFS.includes(t.statut)) ?? null);
        })
        .catch(() => {
          // La liste est un complément : son absence n'empêche pas de commander.
        });
      return () => {
        vivant = false;
      };
    }, [token])
  );

  // Seul le dernier devis demandé compte : une réponse tardive est ignorée.
  const dernierDevis = useRef(0);
  const chiffrer = useCallback(
    async (d: AdresseTrajet, a: AdresseTrajet): Promise<boolean> => {
      const numero = ++dernierDevis.current;
      setEnvoi('devis');
      setErreur('');
      try {
        const nouveau = await demanderDevis(token, d, a);
        if (numero !== dernierDevis.current) return false;
        cle.current = cleAleatoire();
        setDevis(nouveau);
        return true;
      } catch (e) {
        if (numero === dernierDevis.current) setErreur(messageErreur(e));
        return false;
      } finally {
        if (numero === dernierDevis.current) setEnvoi(null);
      }
    },
    [token]
  );

  // Le devis suit les adresses : on le demande quand les deux sont choisies.
  useEffect(() => {
    setDevis(null);
    setInfo('');
    setErreur('');
    if (depart && arrivee) void chiffrer(depart, arrivee);
    else setEnvoi(null);
    return () => {
      dernierDevis.current++;
    };
    // `chiffrer` change avec le jeton : un jeton renouvelé ne doit pas refaire le devis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depart, arrivee]);

  const enregistrerFavorite = async (type: TypeAdresseFavorite, adresse: AdresseTrajet) => {
    try {
      const enregistree = await enregistrerAdresseFavorite(token, type, adresse);
      setFavorites((liste) => [...liste.filter((f) => f.type !== type), enregistree]);
      setInfo(type === 'DOMICILE' ? 'Adresse enregistrée comme domicile.' : 'Adresse enregistrée comme travail.');
    } catch (e) {
      setErreur(messageErreur(e));
    }
  };

  const commander = async () => {
    if (!depart || !arrivee || !devis || commandeEnVol.current) return;
    commandeEnVol.current = true;
    setEnvoi('commande');
    setErreur('');
    setInfo('');
    try {
      const course = await commanderTrajet(token, devis, cle.current);
      setDepart(null);
      setArrivee(null);
      setDevis(null);
      setFormulaire((n) => n + 1);
      router.push({ pathname: '/trajet/[id]', params: { id: course.id } });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'QUOTE_EXPIRED') {
        // Le prix a pu changer : on le redemande et on le dit.
        const ok = await chiffrer(depart, arrivee);
        if (ok) setInfo('Ce devis a expiré : voici le prix à jour.');
      } else {
        // Réseau coupé ou erreur : le devis et sa clé restent, on peut réessayer sans doublon.
        setErreur(messageErreur(e));
      }
    } finally {
      commandeEnVol.current = false;
      setEnvoi((v) => (v === 'commande' ? null : v));
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
        {enCours ? (
          <TouchableOpacity
            style={styles.enCours}
            onPress={() => router.push({ pathname: '/trajet/[id]', params: { id: enCours.id } })}
          >
            <Text style={styles.enCoursTexte}>Trajet en cours vers {enCours.arriveeAdresse} — suivre</Text>
          </TouchableOpacity>
        ) : null}

        <Text style={styles.intro}>Indiquez votre départ et votre destination : le prix est fixé avant de commander.</Text>

        <ChampAdresse key={`d${formulaire}`} libelle="Départ" placeholder="Adresse de départ" choisie={depart} onChoisir={setDepart} desactive={envoi === 'commande'} favorites={favorites} onEnregistrer={enregistrerFavorite} />
        <ChampAdresse key={`a${formulaire}`} libelle="Destination" placeholder="Adresse d'arrivée" choisie={arrivee} onChoisir={setArrivee} desactive={envoi === 'commande'} favorites={favorites} onEnregistrer={enregistrerFavorite} />

        {envoi === 'devis' ? (
          <View style={styles.calcul}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={styles.calculTexte}>Calcul du prix…</Text>
          </View>
        ) : null}

        {info ? <Text style={styles.info}>{info}</Text> : null}
        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}

        {devis ? (
          <Card>
            <Text style={styles.prix}>{prix(devis.prixCentimes)}</Text>
            <Text style={styles.estimation}>
              Environ {kilometres(devis.distanceMetres)} · {minutes(devis.dureeSecondes)}
            </Text>
            <Text style={styles.fixe}>Prix fixe, connu avant de commander.</Text>
            <TouchableOpacity
              style={[styles.bouton, envoi === 'commande' && styles.boutonOff]}
              onPress={commander}
              disabled={envoi === 'commande'}
            >
              {envoi === 'commande' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.boutonTexte}>Commander</Text>
              )}
            </TouchableOpacity>
          </Card>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenu: { padding: 16, paddingBottom: 32 },
  intro: { color: '#4B5563', fontSize: 14, marginBottom: 16 },
  enCours: { backgroundColor: COLORS.primarySoft, borderRadius: 10, padding: 12, marginBottom: 16 },
  enCoursTexte: { color: COLORS.primary, fontWeight: '600' },
  calcul: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8 },
  calculTexte: { color: '#6B7280' },
  info: { color: COLORS.primary, marginVertical: 8 },
  erreur: { color: COLORS.danger, marginVertical: 8 },
  prix: { fontSize: 34, fontWeight: '800', color: '#111827' },
  estimation: { color: '#4B5563', marginTop: 4 },
  fixe: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  bouton: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  boutonOff: { opacity: 0.5 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
