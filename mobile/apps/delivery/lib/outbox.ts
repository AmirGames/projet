import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';
import type * as NotificationsModule from 'expo-notifications';
import { subscribeOnline } from './network';
import { keepFile, readJson, removeFile, writeJson } from './offlineStore';
import { withSession, fetchWithSession } from './sessionFetch';
import { uploadFile } from './upload';

/**
 * Les étapes d'une course faites sans réseau.
 *
 * Un sous-sol, une cage d'escalier, une zone blanche : le livreur ne pouvait
 * plus ni prendre la commande en charge ni la remettre, et restait bloqué
 * devant le client. L'étape est maintenant enregistrée sur le téléphone, la
 * course avance à l'écran, et l'envoi part tout seul au retour du réseau,
 * dans l'ordre, avec l'heure où l'étape a vraiment eu lieu.
 *
 * Ce qui reste au serveur : le code du client ne se vérifie qu'en ligne (il
 * n'est jamais sur le téléphone du livreur). Un code saisi hors connexion
 * part au retour du réseau ; refusé, le livreur est prévenu aussitôt.
 */

export type PendingStep =
  | {
      id: string;
      kind: 'pickup';
      deliveryId: string;
      /** Quand l'étape a eu lieu, heure du téléphone. */
      at: string;
    }
  | {
      id: string;
      kind: 'handover';
      deliveryId: string;
      at: string;
      code: string;
    }
  | {
      id: string;
      kind: 'drop';
      deliveryId: string;
      at: string;
      note: string;
      /** La photo gardée sur le téléphone jusqu'à son envoi. */
      photoUri: string;
      /** Rempli une fois la photo envoyée : pas de second envoi en cas de reprise. */
      photoUrl?: string;
    };

/** Une étape que le serveur a refusée : le livreur doit le savoir. */
export interface RejectedStep {
  id: string;
  deliveryId: string;
  kind: PendingStep['kind'];
  message: string;
}

export interface OutboxState {
  pending: PendingStep[];
  rejected: RejectedStep[];
  /** Un envoi est en cours. */
  sending: boolean;
}

const KEY = 'envois-en-attente';
const REJECTED_KEY = 'envois-refuses';

let state: OutboxState = { pending: [], rejected: [], sending: false };
const listeners = new Set<(s: OutboxState) => void>();

let loaded: Promise<void> | null = null;
function load() {
  loaded ??= (async () => {
    const [pending, rejected] = await Promise.all([
      readJson<PendingStep[]>(KEY),
      readJson<RejectedStep[]>(REJECTED_KEY),
    ]);
    state = { ...state, pending: pending || [], rejected: rejected || [] };
    emit();
  })();
  return loaded;
}

function emit() {
  listeners.forEach((l) => l(state));
}

async function setState(patch: Partial<OutboxState>) {
  state = { ...state, ...patch };
  emit();
  if (patch.pending) await writeJson(KEY, state.pending);
  if (patch.rejected) await writeJson(REJECTED_KEY, state.rejected);
}

export function subscribeOutbox(listener: (s: OutboxState) => void) {
  listeners.add(listener);
  load().then(() => listener(state));
  return () => {
    listeners.delete(listener);
  };
}

export const getOutbox = () => state;

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

type NewStep =
  | { kind: 'pickup'; deliveryId: string }
  | { kind: 'handover'; deliveryId: string; code: string }
  | { kind: 'drop'; deliveryId: string; note: string; photoUri: string; photoUrl?: string };

/** Enregistre une étape faite sans réseau ; l'envoi part dès que possible. */
export async function enqueueStep(step: NewStep) {
  await load();
  const id = newId();
  const at = new Date().toISOString();
  const full: PendingStep =
    step.kind === 'drop'
      ? { ...step, id, at, photoUri: step.photoUrl ? step.photoUri : await keepFile(step.photoUri, `depot-${id}.jpg`) }
      : { ...step, id, at };
  // Une étape déjà en attente pour la même course et le même geste est
  // remplacée (un code ressaisi, une autre photo) : une seule part.
  const pending = state.pending.filter((p) => !(p.deliveryId === step.deliveryId && sameGesture(p.kind, step.kind)));
  await setState({ pending: [...pending, full] });
  flushOutbox();
}

/** Code et photo sont deux façons de faire la même remise. */
const sameGesture = (a: PendingStep['kind'], b: PendingStep['kind']) =>
  a === b || (a !== 'pickup' && b !== 'pickup');

/** Le livreur a lu le refus : il disparaît. */
export async function dismissRejected(id: string) {
  await load();
  await setState({ rejected: state.rejected.filter((r) => r.id !== id) });
}

/** Déconnexion : les envois du livreur précédent ne partent pas avec le compte suivant. */
export async function clearOutbox() {
  await load();
  await Promise.all(state.pending.map((p) => (p.kind === 'drop' ? removeFile(p.photoUri) : undefined)));
  await setState({ pending: [], rejected: [] });
}

/**
 * Où en est la course, étapes en attente comprises : l'écran l'affiche
 * comme si elles étaient parties.
 */
export function pendingStatus(deliveryId: string, pending: PendingStep[] = state.pending) {
  const steps = pending.filter((p) => p.deliveryId === deliveryId);
  if (steps.some((p) => p.kind !== 'pickup')) return 'DELIVERED' as const;
  if (steps.some((p) => p.kind === 'pickup')) return 'PICKED_UP' as const;
  return null;
}

type Outcome = { done: true } | { done: false; retry: true } | { done: false; retry: false; message: string };

/** Réponse d'erreur : à retenter plus tard (serveur indisponible) ou refusée pour de bon. */
async function fromResponse(response: { status: number; json?: () => Promise<any> } | null, data?: any): Promise<Outcome> {
  // Plus de session : les étapes attendent la reconnexion du livreur.
  if (!response) return { done: false, retry: true };
  if (response.status >= 200 && response.status < 300) return { done: true };
  if (response.status >= 500 || response.status === 408 || response.status === 429 || response.status === 401) {
    return { done: false, retry: true };
  }
  const body = data ?? (await response.json?.().catch(() => null));
  return { done: false, retry: false, message: body?.error || body?.message || `Erreur ${response.status}` };
}

async function sendStatus(step: PendingStep, proof: Record<string, string>) {
  const response = await fetchWithSession(`/api/drivers/deliveries/${step.deliveryId}`, {
    method: 'PATCH',
    body: { status: step.kind === 'pickup' ? 'PICKED_UP' : 'DELIVERED', effectueLe: step.at, ...proof },
  });
  if (response?.status === 409 && step.kind === 'pickup') {
    // Prise en charge partie en double (réponse perdue) après la remise :
    // elle a déjà eu lieu, rien à signaler.
    const data = await response.json().catch(() => null);
    if (data?.code === 'DELIVERY_FINISHED') return { done: true } as const;
    return fromResponse(response, data);
  }
  return fromResponse(response);
}

async function send(step: PendingStep): Promise<Outcome> {
  if (step.kind === 'pickup') return sendStatus(step, {});
  if (step.kind === 'handover') return sendStatus(step, { code: step.code });

  let photoUrl = step.photoUrl;
  if (!photoUrl) {
    const upload = await withSession((token) =>
      uploadFile(`/api/drivers/deliveries/${step.deliveryId}/photo`, token, {
        uri: step.photoUri,
        type: 'image/jpeg',
        name: 'depot.jpg',
      }, 'photo')
    );
    if (!upload?.ok) return fromResponse(upload, upload?.data);
    photoUrl = upload.data?.data?.photoUrl as string;
    // La photo est chez nous : une reprise ne la renverra pas.
    await setState({ pending: state.pending.map((p) => (p.id === step.id ? { ...step, photoUrl } : p)) });
  }
  return sendStatus(step, { photoUrl: photoUrl!, note: step.note });
}

const STEP_LABELS: Record<PendingStep['kind'], string> = {
  pickup: 'La prise en charge',
  handover: 'La remise avec le code',
  drop: 'Le dépôt',
};

let flushing: Promise<boolean> | null = null;
let again = false;

/**
 * Envoie les étapes en attente, dans l'ordre. S'arrête au premier échec
 * réseau : les suivantes dépendent souvent de celle-là (pas de remise sans
 * prise en charge). Renvoie vrai si au moins une étape est partie ou a été
 * refusée : l'écran se relit.
 *
 * Appelée pendant un envoi (le réseau revient au milieu d'un essai raté),
 * elle relance une passe à la fin de celui-ci au lieu d'attendre le
 * déclencheur suivant.
 */
export function flushOutbox(): Promise<boolean> {
  if (flushing) {
    again = true;
    return flushing;
  }
  flushing = (async () => {
    let changed = false;
    do {
      again = false;
      changed = (await flushOnce()) || changed;
    } while (again);
    return changed;
  })().finally(() => {
    flushing = null;
  });
  return flushing;
}

async function flushOnce(): Promise<boolean> {
  await load();
  let changed = false;
  if (state.pending.length === 0) return false;
  await setState({ sending: true });
  try {
    while (state.pending.length > 0) {
      const step = state.pending[0];
      let outcome: Outcome;
      try {
        outcome = await send(step);
      } catch {
        // Pas de réponse : le réseau n'est pas revenu.
        outcome = { done: false, retry: true };
      }
      if (!outcome.done && outcome.retry) break;

      changed = true;
      if (outcome.done) {
        if (step.kind === 'drop') await removeFile(step.photoUri);
        await setState({ pending: state.pending.filter((p) => p.id !== step.id) });
        continue;
      }

      // Refusée : les étapes suivantes de la même course n'ont plus de
      // sens (une remise sans prise en charge), elles tombent avec elle.
      const dropped = state.pending.filter((p) => p.deliveryId === step.deliveryId);
      await Promise.all(dropped.map((p) => (p.kind === 'drop' ? removeFile(p.photoUri) : undefined)));
      const rejected: RejectedStep = {
        id: step.id,
        deliveryId: step.deliveryId,
        kind: step.kind,
        message: outcome.message,
      };
      await setState({
        pending: state.pending.filter((p) => p.deliveryId !== step.deliveryId),
        rejected: [...state.rejected, rejected],
      });
      notifyRejected(rejected);
    }
  } finally {
    await setState({ sending: false });
  }
  return changed;
}

// Le réseau revient : ce qui attendait part aussitôt.
subscribeOnline((online) => {
  if (online) flushOutbox();
});

let notificationsModule: typeof NotificationsModule | null | undefined;
function notifications() {
  if (notificationsModule !== undefined) return notificationsModule;
  notificationsModule =
    isRunningInExpoGo() || Platform.OS === 'web' ? null : (require('expo-notifications') as typeof NotificationsModule);
  return notificationsModule;
}

/**
 * Le refus arrive souvent téléphone rangé (l'envoi part avec la position,
 * en arrière-plan) : une notification le dit au livreur, qui est peut-être
 * encore devant la porte.
 */
function notifyRejected(rejected: RejectedStep) {
  notifications()
    ?.scheduleNotificationAsync({
      content: {
        title: `⚠️ ${STEP_LABELS[rejected.kind]} n’a pas été acceptée`,
        body: rejected.message,
        data: { tag: 'envoi-refuse', deliveryId: rejected.deliveryId },
      },
      trigger: null,
    })
    .catch(() => undefined);
}

export const stepLabel = (kind: PendingStep['kind']) => STEP_LABELS[kind];


/** L'état de la file, pour l'écran. */
export function useOutbox() {
  const [current, setCurrent] = useState(state);
  useEffect(() => subscribeOutbox(setCurrent), []);
  return current;
}

const STATUS_RANK: Record<string, number> = { PENDING: 0, ACCEPTED: 1, PICKED_UP: 2, DELIVERED: 3 };

/**
 * La course telle que le livreur l'a faite : les étapes en attente d'envoi
 * l'emportent sur ce que le serveur sait déjà, jamais l'inverse (une course
 * annulée entre-temps reste annulée).
 */
export function withPendingSteps<T extends { id: string; status: string }>(delivery: T, pending: PendingStep[]): T {
  const local = pendingStatus(delivery.id, pending);
  if (!local || !(delivery.status in STATUS_RANK)) return delivery;
  return STATUS_RANK[local] > STATUS_RANK[delivery.status] ? { ...delivery, status: local } : delivery;
}
