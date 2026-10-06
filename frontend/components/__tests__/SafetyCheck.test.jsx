import { act, render, screen } from '@testing-library/react';
import SafetyCheck from '../../../mobile/apps/delivery/components/SafetyCheck';

// Le composant mobile et le rendu web du test doivent partager la même copie de React.
jest.mock('../../../mobile/apps/delivery/node_modules/react', () => jest.requireActual('react'));
jest.mock('react-native', () => ({
  Linking: { openURL: jest.fn() },
  Vibration: { vibrate: jest.fn() },
  Modal: ({ visible, children }) => visible ? <div>{children}</div> : null,
  Text: ({ children }) => <span>{children}</span>,
  View: ({ children }) => <div>{children}</div>,
  TouchableOpacity: ({ children, onPress }) => <button onClick={onPress}>{children}</button>,
}), { virtual: true });
jest.mock('../../../mobile/apps/delivery/lib/api', () => ({ apiFetch: jest.fn() }));
jest.mock('../../../mobile/apps/delivery/lib/deliveries', () => ({
  distanceM: (a, b) => Math.hypot(a.lat - b.lat, a.lng - b.lng) * 111000,
  shortId: (id) => id,
}));
jest.mock('../../../mobile/apps/delivery/components/ui', () => ({
  COLORS: {}, themedStyles: (factory) => factory(),
}));

const course = { id: 'course', orderId: 'commande', status: 'PICKED_UP', latitude: 0, longitude: 0 };
const surLaRoute = { lat: 0.1, lng: 0 };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('garde la surveillance sur la route et ferme une alerte dès que l’attente client commence', () => {
  const { rerender } = render(<SafetyCheck token="token" deliveries={[course]} position={surLaRoute} />);
  act(() => jest.advanceTimersByTime(3 * 60000));
  expect(screen.getByText('Tout va bien ?')).toBeTruthy();
  rerender(<SafetyCheck token="token" deliveries={[{ ...course, attenteFinLe: new Date(Date.now() + 6 * 60000).toISOString() }]} position={surLaRoute} />);
  expect(screen.queryByText('Tout va bien ?')).toBeNull();
  act(() => jest.advanceTimersByTime(7 * 60000));
  expect(screen.queryByText('Tout va bien ?')).toBeNull();
});

it('ne déclenche pas d’alerte pendant les six minutes à la porte, malgré une position GPS décalée', () => {
  render(<SafetyCheck token="token" deliveries={[course]} position={{ lat: 0.003, lng: 0 }} />);
  act(() => jest.advanceTimersByTime(6 * 60000));
  expect(screen.queryByText('Tout va bien ?')).toBeNull();
});
