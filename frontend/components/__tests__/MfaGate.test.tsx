import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import MfaGate, { MfaPanel } from '../MfaGate';
jest.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/jeton-session', () => ({ jetonAcces: () => 'session-test' }));
let state: { enabled: boolean; required: boolean; verified: boolean; recent: boolean; recovery: boolean };
let calls: string[];
beforeEach(() => {
  state = { enabled: true, required: true, verified: false, recent: false, recovery: false }; calls = [];
  global.fetch = jest.fn(async (url) => {
    const path = String(url); calls.push(path);
    if (path.endsWith('/verify')) { state = { ...state, verified: true, recent: true }; }
    if (path.endsWith('/recover')) { state = { ...state, verified: true, recovery: true }; }
    const data = path.endsWith('/begin') ? { secret: 'KEY-FIXTURE' } : path.endsWith('/confirm') ? { recoveryCodes: ['RECOVERY-FIXTURE'] } : state;
    return { ok: true, json: async () => data } as Response;
  });
});
it('cache les pages privilégiées jusqu’à la confirmation MFA', async () => {
  render(<MfaGate><p>Administration</p></MfaGate>);
  await screen.findByRole('button', { name: 'verify' }); expect(screen.queryByText('Administration')).toBeNull();
  await waitFor(() => expect(screen.getByRole('button', { name: 'verify' })).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'verify' })); await screen.findByText('Administration');
  expect(calls.filter((p) => p.endsWith('/verify'))).toHaveLength(1);
});
it('montre la clé et les codes une seule fois, sans stockage navigateur', async () => {
  render(<MfaPanel />); await waitFor(() => expect(screen.getByRole('button', { name: 'rotate' })).not.toBeDisabled());
  fireEvent.change(screen.getByLabelText('password'), { target: { value: 'test-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'rotate' })); await screen.findByText('KEY-FIXTURE');
  fireEvent.change(screen.getByLabelText('code'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'verify' })); await screen.findByText('RECOVERY-FIXTURE');
  expect(screen.queryByText('KEY-FIXTURE')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'saved' })); expect(screen.queryByText('RECOVERY-FIXTURE')).toBeNull();
  expect(localStorage.length).toBe(0); expect(sessionStorage.length).toBe(0);
});
it('une MFA trop ancienne interrompt la page et ne rejoue aucune action financière', async () => {
  state.verified = true; render(<MfaGate><p>Administration</p></MfaGate>); await screen.findByText('Administration');
  act(() => window.dispatchEvent(new Event('mfa-required')));
  await screen.findByText('title'); expect(screen.queryByText('Administration')).toBeNull();
  expect(calls.every((p) => p.startsWith('/api/auth/mfa'))).toBe(true);
});
it('la récupération conserve le blocage de l’administration', async () => {
  render(<MfaGate><p>Administration</p></MfaGate>);
  await screen.findByRole('button', { name: 'recover' }); fireEvent.click(screen.getByRole('button', { name: 'recover' }));
  await screen.findByText('recoverNotice'); expect(screen.queryByText('Administration')).toBeNull();
});
