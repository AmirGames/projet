import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { apiFetch, setSessionRenewedHandler, setUnauthorizedHandler } from '../lib/api';
import { clearSession, loadSession, saveSession, Session } from '../lib/session';
import { avancerCourse, changerDisponibilite, DossierChauffeur, enregistrerPosition, lireDossier, lireRevenus, lireTableau, repondreProposition, RevenusChauffeur, TableauChauffeur } from '../lib/chauffeur';

type Onglet = 'courses' | 'revenus' | 'profil';
const libelleStatut: Record<string, string> = {
  BROUILLON: 'Dossier à compléter', SOUMIS: 'Dossier en validation', VALIDE: 'Dossier validé',
  REFUSE: 'Dossier refusé — corrections requises', SUSPENDU: 'Compte suspendu',
  ACCEPTEE: 'Course acceptée', ARRIVEE: 'Arrivé au départ', EN_COURS: 'Course en cours',
  TERMINEE: 'Terminée', ANNULEE: 'Annulée',
};
const messageErreur = (e: unknown) => e instanceof Error ? e.message : 'Connexion réseau impossible. Vérifiez votre connexion puis réessayez.';

export default function ZupDriveDriverApp() {
  const [pret, setPret] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [dossier, setDossier] = useState<DossierChauffeur | null>(null);
  const [tableau, setTableau] = useState<TableauChauffeur | null>(null);
  const [revenus, setRevenus] = useState<RevenusChauffeur | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('courses');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState('');
  const accessToken = session?.accessToken;

  const charger = useCallback(async (token: string) => {
    setErreur('');
    try {
      const [profil, courses] = await Promise.all([lireDossier(token), lireTableau(token)]);
      setDossier(profil);
      setTableau(courses);
    } catch (e) { setErreur(messageErreur(e)); }
  }, []);

  useEffect(() => {
    let vivant = true;
    loadSession().then((saved) => { if (vivant && saved?.accessToken) { setSession(saved); void charger(saved.accessToken); } })
      .finally(() => { if (vivant) setPret(true); });
    setSessionRenewedHandler(setSession);
    setUnauthorizedHandler(() => { void clearSession(); setSession(null); setDossier(null); setTableau(null); setErreur('Session expirée. Reconnectez-vous.'); });
    return () => { vivant = false; setSessionRenewedHandler(null); setUnauthorizedHandler(null); };
  }, [charger]);

  // Le backend expire les propositions après 20 s ; relire le tableau pendant
  // que le chauffeur est en ligne. Les positions sont envoyées au premier plan.
  useEffect(() => {
    if (!accessToken || !tableau?.enLigne) return;
    const rafraichir = setInterval(() => { void charger(accessToken); }, 4000);
    const positionner = setInterval(async () => {
      try {
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await enregistrerPosition(accessToken, location.coords.latitude, location.coords.longitude);
      } catch (e) { setErreur(messageErreur(e)); }
    }, 15000);
    return () => { clearInterval(rafraichir); clearInterval(positionner); };
  }, [accessToken, tableau?.enLigne, charger]);

  const connecter = async () => {
    setChargement(true); setErreur('');
    try {
      const res = await apiFetch<{ accessToken: string; refreshToken: string; user?: { email?: string } }>('/api/auth/login', null, {
        method: 'POST', body: { email: email.trim(), password: motDePasse },
      });
      if (!res.accessToken || !res.refreshToken) throw new Error('Réponse de connexion incomplète');
      const next = { accessToken: res.accessToken, refreshToken: res.refreshToken, email: res.user?.email ?? email.trim() };
      await saveSession(next); setSession(next); await charger(next.accessToken);
    } catch (e) { setErreur(messageErreur(e)); }
    finally { setChargement(false); }
  };

  const action = async (operation: () => Promise<TableauChauffeur>) => {
    if (!session) return;
    setChargement(true); setErreur('');
    try { setTableau(await operation()); }
    catch (e) { const msg = messageErreur(e); setErreur(msg); Alert.alert('Action non effectuée', msg); await charger(session.accessToken); }
    finally { setChargement(false); }
  };

  const changerEtatDispo = async () => {
    if (!session || !tableau) return;
    await action(async () => {
      const enLigne = !tableau.enLigne;
      if (enLigne) {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== 'granted') throw new Error('Autorisez la localisation pour passer en ligne.');
        const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await enregistrerPosition(session.accessToken, location.coords.latitude, location.coords.longitude);
      }
      return changerDisponibilite(session.accessToken, enLigne);
    });
  };

  const deconnecter = async () => { await clearSession(); setSession(null); setDossier(null); setTableau(null); setRevenus(null); };

  const afficherRevenus = async () => {
    if (!session) return;
    setOnglet('revenus'); setChargement(true); setErreur('');
    try { setRevenus(await lireRevenus(session.accessToken)); }
    catch (e) { setErreur(messageErreur(e)); }
    finally { setChargement(false); }
  };

  const accepter = async () => {
    const id = tableau?.proposition?.id;
    if (id) await action(() => repondreProposition(session!.accessToken, id));
  };

  if (!pret) return <SafeAreaView style={s.center}><ActivityIndicator /></SafeAreaView>;
  if (!session) return <SafeAreaView style={s.page}><StatusBar style="dark" /><View style={s.form}>
    <Text style={s.title}>ZupDrive Chauffeur</Text><Text style={s.muted}>Connexion à votre compte ZupOne</Text>
    <TextInput autoCapitalize="none" keyboardType="email-address" placeholder="Adresse e-mail" value={email} onChangeText={setEmail} style={s.input} />
    <TextInput secureTextEntry placeholder="Mot de passe" value={motDePasse} onChangeText={setMotDePasse} style={s.input} />
    {erreur ? <Text accessibilityRole="alert" style={s.error}>{erreur}</Text> : null}
    <Bouton titre={chargement ? 'Connexion…' : 'Se connecter'} onPress={connecter} disabled={chargement || !email.trim() || !motDePasse} />
  </View></SafeAreaView>;

  const autorise = dossier?.statut === 'VALIDE' && tableau?.statut === 'VALIDE';
  const course = tableau?.course;
  const proposition = tableau?.proposition;
  return <SafeAreaView style={s.page}><StatusBar style="dark" />
    <View style={s.header}><Text style={s.title}>ZupDrive Chauffeur</Text><Text style={s.muted}>{dossier?.nomComplet || session.email}</Text></View>
    <View style={s.tabs}><OngletBouton titre="Courses" actif={onglet === 'courses'} onPress={() => setOnglet('courses')} /><OngletBouton titre="Revenus" actif={onglet === 'revenus'} onPress={afficherRevenus} /><OngletBouton titre="Profil" actif={onglet === 'profil'} onPress={() => setOnglet('profil')} /></View>
    <ScrollView contentContainerStyle={s.content}>
      {erreur ? <View style={s.notice}><Text style={s.error}>{erreur}</Text><Bouton titre="Réessayer" onPress={() => void charger(session.accessToken)} /></View> : null}
      {onglet === 'courses' && <>
        {!autorise && <View style={s.notice}><Text style={s.heading}>{dossier ? libelleStatut[dossier.statut] : 'Aucun dossier chauffeur'}</Text>
          <Text style={s.body}>{dossier?.motifStatut || (dossier?.statut === 'SOUMIS' ? 'Vous pourrez vous mettre en ligne dès validation par l’équipe ZupDrive.' : 'Complétez ou faites valider votre dossier chauffeur avant de recevoir des courses.')}</Text></View>}
        {autorise && <Bouton titre={tableau?.enLigne ? 'Passer hors ligne' : 'Passer en ligne'} onPress={() => void changerEtatDispo()} disabled={chargement} />}
        {proposition && <View style={s.card}><Text style={s.heading}>Nouvelle proposition</Text><Text>{proposition.course.departAdresse} → {proposition.course.arriveeAdresse}</Text><Text>{proposition.course.passager || 'Passager'} · {(proposition.course.prixCentimes / 100).toFixed(2)} {proposition.course.devise}</Text><Text style={s.muted}>Expire à {new Date(proposition.expireA).toLocaleTimeString()}</Text><Bouton titre="Accepter la proposition" onPress={accepter} disabled={!autorise || chargement} /></View>}
        {course && <View style={s.card}><Text style={s.heading}>{libelleStatut[course.statut]}</Text><Text>{course.passager || 'Passager'} · {course.departAdresse} → {course.arriveeAdresse}</Text>
          {course.statut === 'ACCEPTEE' && <Bouton titre="Je suis arrivé" onPress={() => void action(() => avancerCourse(session.accessToken, course.id, 'arrive'))} />}
          {course.statut === 'ARRIVEE' && <Bouton titre="Démarrer la course" onPress={() => void action(() => avancerCourse(session.accessToken, course.id, 'demarrer'))} />}
          {course.statut === 'EN_COURS' && <Bouton titre="Terminer la course" onPress={() => void action(() => avancerCourse(session.accessToken, course.id, 'terminer'))} />}
        </View>}
        {!course && !proposition && <Text style={s.muted}>{tableau?.enLigne ? 'En attente de proposition. Actualisez pour récupérer le dernier état.' : 'Vous êtes hors ligne.'}</Text>}
        <Bouton titre="Actualiser" onPress={() => void charger(session.accessToken)} />
        {!!tableau?.historique.length && <View style={s.card}><Text style={s.heading}>Mes courses récentes</Text>{tableau.historique.map(c => <Text key={c.id} style={s.body}>{libelleStatut[c.statut]} · {c.departAdresse} → {c.arriveeAdresse}</Text>)}</View>}
      </>}
      {onglet === 'revenus' && <View style={s.card}><Text style={s.heading}>Revenus et versements</Text>{revenus ? <>
        <Text style={s.body}>Total enregistré : {((Number(revenus.totalEarningsCentimes) || 0) / 100).toFixed(2)} €</Text>
        <Text style={s.body}>En attente : {((Number(revenus.pendingCentimes) || 0) / 100).toFixed(2)} €</Text>
        {revenus.payouts.map(p => <Text key={p.id} style={s.body}>{new Date(p.period.start).toLocaleDateString()} → {new Date(p.period.end).toLocaleDateString()} · {(p.amount / 100).toFixed(2)} € · {p.status}</Text>)}
      </> : <Bouton titre="Charger les revenus" onPress={afficherRevenus} />}</View>}
      {onglet === 'profil' && <View style={s.card}><Text style={s.heading}>Dossier chauffeur</Text><Text>{dossier?.nomComplet || 'Aucun dossier'}</Text><Text>{dossier ? libelleStatut[dossier.statut] : 'À créer'}</Text><Text>{session.email}</Text><Bouton titre="Se déconnecter" onPress={() => void deconnecter()} /></View>}
    </ScrollView>
  </SafeAreaView>;
}

function Bouton({ titre, onPress, disabled }: { titre: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{titre}</Text></TouchableOpacity>;
}
function OngletBouton({ titre, actif, onPress }: { titre: string; actif: boolean; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: actif }} onPress={onPress} style={s.tab}><Text style={actif ? s.tabActive : s.muted}>{titre}</Text></TouchableOpacity>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#fff' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  form: { flex: 1, justifyContent: 'center', padding: 24 }, header: { padding: 18, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  title: { fontSize: 23, fontWeight: '700', color: '#102a43' }, muted: { color: '#64748b', marginTop: 6 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 13, marginTop: 14, fontSize: 16 },
  button: { backgroundColor: '#145da0', borderRadius: 8, padding: 13, alignItems: 'center', marginTop: 12 },
  disabled: { opacity: 0.5 }, buttonText: { color: 'white', fontWeight: '700' }, tabs: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  tab: { flex: 1, padding: 14, alignItems: 'center' }, tabActive: { color: '#145da0', fontWeight: '700' }, content: { padding: 16, gap: 12 },
  card: { borderWidth: 1, borderColor: '#dbe3ea', borderRadius: 10, padding: 14, gap: 8 }, notice: { backgroundColor: '#eff6ff', padding: 14, borderRadius: 8, gap: 8 },
  heading: { fontSize: 17, fontWeight: '700', color: '#102a43' }, body: { color: '#334155', marginTop: 5 }, error: { color: '#b42318', marginTop: 8 },
});
