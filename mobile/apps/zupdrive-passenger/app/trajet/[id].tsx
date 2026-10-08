import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import LiveMap from '../../components/LiveMap';
import PaiementCarte from '../../components/PaiementCarte';
import { Card, COLORS, ErrorBox, Loading, Row } from '../../components/ui';
import { messageErreur, useToken } from '../../lib/auth';
import {
  annulerTrajet,
  kilometres,
  lireTrajet,
  minutes,
  noterChauffeur,
  prix,
  RELECTURE_MS,
  STATUTS_ACTIFS,
  STATUTS_ANNULABLES,
  type Trajet,
} from '../../lib/courses';
import { confirmer } from '../../lib/confirmer';
import { etatPaiementTrajet } from '../../lib/paiement';
import { statutDetail } from '../../lib/statuts';

const etoiles = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

/**
 * Le suivi d'un trajet. L'état fait foi côté serveur : l'écran le relit toutes
 * les 4 s tant que le trajet est en cours et que l'écran est affiché, de sorte
 * qu'une notification perdue ne le laisse jamais en retard.
 */
export default function SuiviTrajet() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useToken();
  const [trajet, setTrajet] = useState<Trajet | null>(null);
  const [erreurChargement, setErreurChargement] = useState('');
  const [erreurAction, setErreurAction] = useState('');
  const [reseau, setReseau] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  // Stripe a accepté la carte ; le serveur ne le sait qu'à l'arrivée du webhook (relu toutes les 4 s).
  const [paiementEnvoye, setPaiementEnvoye] = useState(false);
  const [noteChoisie, setNoteChoisie] = useState(0);
  const enVol = useRef(false);
  const vivant = useRef(true);

  useEffect(() => {
    vivant.current = true;
    return () => {
      vivant.current = false;
    };
  }, []);

  const charger = useCallback(async () => {
    if (enVol.current) return;
    enVol.current = true;
    try {
      const lu = await lireTrajet(token, id);
      if (!vivant.current) return;
      setTrajet(lu);
      setErreurChargement('');
      setReseau(false);
    } catch (e) {
      if (!vivant.current) return;
      // Un trajet déjà affiché reste à l'écran : on signale seulement la coupure.
      setTrajet((actuel) => {
        if (actuel) setReseau(true);
        else setErreurChargement(messageErreur(e));
        return actuel;
      });
    } finally {
      enVol.current = false;
    }
  }, [id, token]);

  const actif = !!trajet && STATUTS_ACTIFS.includes(trajet.statut);

  // Relecture tant que l'écran est affiché, l'application au premier plan et le trajet en cours.
  useFocusEffect(
    useCallback(() => {
      void charger();
      if (trajet && !actif) return;
      const minuteur = setInterval(() => {
        if (AppState.currentState === 'active') void charger();
      }, RELECTURE_MS);
      const abonnement = AppState.addEventListener('change', (etat) => {
        if (etat === 'active') void charger();
      });
      return () => {
        clearInterval(minuteur);
        abonnement.remove();
      };
      // `trajet` n'est lu que pour savoir s'il est terminé : `actif` suffit à relancer.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [charger, actif])
  );

  const annuler = () =>
    confirmer('Annuler le trajet', 'Voulez-vous vraiment annuler ce trajet ?', 'Oui, annuler', async () => {
      setEnvoi(true);
      setErreurAction('');
      try {
        const maj = await annulerTrajet(token, id);
        if (vivant.current) setTrajet(maj);
      } catch (e) {
        if (vivant.current) setErreurAction(messageErreur(e));
      } finally {
        if (vivant.current) setEnvoi(false);
      }
    });

  const noter = async () => {
    if (!noteChoisie || envoi) return;
    setEnvoi(true);
    setErreurAction('');
    try {
      await noterChauffeur(token, id, noteChoisie);
      await charger();
    } catch (e) {
      if (vivant.current) setErreurAction(messageErreur(e));
    } finally {
      if (vivant.current) setEnvoi(false);
    }
  };

  if (!trajet) {
    if (erreurChargement) return <ErrorBox message={erreurChargement} onRetry={() => { setErreurChargement(''); void charger(); }} />;
    return <Loading />;
  }

  const etatPaiement = etatPaiementTrajet(trajet.statut, trajet.paiement);
  const chauffeur = trajet.chauffeur;

  return (
    <ScrollView contentContainerStyle={ui.contenu}>
      {reseau ? <Text style={ui.reseau}>Connexion perdue, nouvelle tentative…</Text> : null}

      <Card>
        <View style={ui.statutLigne}>
          {actif ? <ActivityIndicator color={COLORS.primary} style={{ marginRight: 8 }} /> : null}
          <Text style={ui.statut}>{statutDetail(trajet.statut)}</Text>
        </View>
        {trajet.statut === 'ANNULEE' && trajet.annuleePar === 'CHAUFFEUR' ? (
          <Text style={ui.aide}>Le chauffeur a dû annuler. Vous pouvez commander un nouveau trajet.</Text>
        ) : null}
      </Card>

      {actif && Platform.OS !== 'web' ? (
        <LiveMap
          driver={chauffeur?.position ? { lat: chauffeur.position.latitude, lng: chauffeur.position.longitude } : null}
          pickup={{ lat: trajet.departLatitude, lng: trajet.departLongitude }}
          dropoff={{ lat: trajet.arriveeLatitude, lng: trajet.arriveeLongitude }}
          target={trajet.statut === 'EN_COURS' ? 'dropoff' : 'pickup'}
          follow="overview"
          height={220}
        />
      ) : null}
      {actif && chauffeur?.position && Platform.OS === 'web' ? (
        <Text style={ui.aide}>
          Position du chauffeur : {chauffeur.position.latitude.toFixed(4)}, {chauffeur.position.longitude.toFixed(4)}
        </Text>
      ) : null}

      {etatPaiement === 'a_payer' ? (
        <Card title="Payer votre trajet">
          <Text style={ui.aide}>
            Le paiement de {prix(trajet.prixCentimes)} se fait par carte ; la recherche d'un chauffeur commence dès qu'il est confirmé.
          </Text>
          {paiementEnvoye ? (
            <Text style={ui.texte}>Paiement envoyé, confirmation en cours…</Text>
          ) : (
            <PaiementCarte
              token={token}
              courseId={trajet.id}
              prixCentimes={trajet.prixCentimes}
              onEnvoye={() => {
                setPaiementEnvoye(true);
                void charger();
              }}
            />
          )}
        </Card>
      ) : null}
      {etatPaiement === 'paye' ? <Text style={ui.paye}>Trajet payé en ligne.</Text> : null}
      {etatPaiement === 'remboursement' ? (
        <Card>
          <Text style={ui.texte}>Ce trajet n'a pas eu lieu : votre paiement est en cours de remboursement.</Text>
        </Card>
      ) : null}
      {etatPaiement === 'rembourse' ? (
        <Card>
          <Text style={ui.texte}>Ce trajet n'a pas eu lieu : votre paiement vous a été remboursé.</Text>
        </Card>
      ) : null}

      {chauffeur ? (
        <Card title="Votre chauffeur">
          <Text style={ui.chauffeur}>{chauffeur.prenom}</Text>
          <Text style={ui.texte}>
            {[chauffeur.vehicule, chauffeur.plaque].filter(Boolean).join(' · ')}
          </Text>
          <Text style={ui.aide}>
            {chauffeur.note?.moyenne != null
              ? `★ ${chauffeur.note.moyenne.toLocaleString('fr-FR')} (${chauffeur.note.avis} avis)`
              : 'Nouveau chauffeur'}
          </Text>
        </Card>
      ) : null}

      <Card title="Trajet">
        <Row label="Départ" value={trajet.departAdresse} />
        <Row label="Destination" value={trajet.arriveeAdresse} />
        <Row label="Distance" value={`${kilometres(trajet.distanceMetres)} · ${minutes(trajet.dureeSecondes)}`} />
        <Row label="Prix" value={prix(trajet.prixCentimes)} last />
      </Card>

      {trajet.peutNoter ? (
        <Card title={`Comment s'est passé votre trajet avec ${chauffeur?.prenom ?? 'votre chauffeur'} ?`}>
          <View style={ui.etoiles}>
            {[1, 2, 3, 4, 5].map((n) => (
              <TouchableOpacity key={n} onPress={() => setNoteChoisie(n)} accessibilityLabel={`${n} sur 5`}>
                <Text style={[ui.etoile, n <= noteChoisie && ui.etoileOn]}>{n <= noteChoisie ? '★' : '☆'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={[ui.bouton, (!noteChoisie || envoi) && ui.boutonOff]} onPress={noter} disabled={!noteChoisie || envoi}>
            <Text style={ui.boutonTexte}>Envoyer ma note</Text>
          </TouchableOpacity>
        </Card>
      ) : null}
      {trajet.maNote != null ? <Text style={ui.aide}>Votre note : {etoiles(trajet.maNote)}</Text> : null}

      {erreurAction ? <Text style={ui.erreur}>{erreurAction}</Text> : null}

      {STATUTS_ANNULABLES.includes(trajet.statut) ? (
        <TouchableOpacity style={[ui.annuler, envoi && ui.boutonOff]} onPress={annuler} disabled={envoi}>
          <Text style={ui.annulerTexte}>Annuler le trajet</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

const ui = StyleSheet.create({
  contenu: { padding: 12, paddingBottom: 32 },
  reseau: { color: '#92400E', backgroundColor: '#FEF3C7', borderRadius: 8, padding: 8, marginBottom: 12, fontSize: 13 },
  statutLigne: { flexDirection: 'row', alignItems: 'center' },
  statut: { fontSize: 22, fontWeight: 'bold', color: '#111827', flex: 1 },
  texte: { color: COLORS.text, fontSize: 14 },
  aide: { color: '#6B7280', fontSize: 13, marginTop: 4, marginBottom: 8 },
  paye: { color: '#15803D', fontSize: 14, marginBottom: 12 },
  chauffeur: { fontSize: 18, fontWeight: '700', color: '#111827' },
  etoiles: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  etoile: { fontSize: 36, color: '#9CA3AF' },
  etoileOn: { color: '#F59E0B' },
  bouton: { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  boutonOff: { opacity: 0.5 },
  boutonTexte: { color: '#fff', fontSize: 16, fontWeight: '600' },
  erreur: { color: COLORS.danger, marginBottom: 12 },
  annuler: { borderWidth: 1, borderColor: COLORS.danger, borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  annulerTexte: { color: COLORS.danger, fontWeight: '600' },
});
