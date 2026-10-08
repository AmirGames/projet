import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import SuiviTrajetPage from "../../app/trajet/[id]/page";
import { appelerZupDrive } from "@/lib/zupdrive";

// Comme le vrai hook, la fonction de traduction garde la même identité d'un rendu à l'autre.
jest.mock("next-intl", () => {
  const traduire = (cle, valeurs) => (valeurs ? `${cle} ${JSON.stringify(valeurs)}` : cle);
  return { useLocale: () => "fr", useTranslations: () => traduire };
});
jest.mock("next/link", () => ({ __esModule: true, default: ({ children, href }) => <a href={href}>{children}</a> }));
jest.mock("@/components/CarteCourseDrive", () => ({ CarteCourseDrive: () => <div data-testid="carte" /> }));
jest.mock("@/components/NoterCourseDrive", () => ({ Etoiles: () => null, NoterCourseDrive: () => null }));
jest.mock("@/lib/auth-context", () => ({
  useAuth: () => ({ user: { id: "u1", email: "pat@exemple.test", name: "Pat" }, isLoading: false }),
}));
// Le vrai composant charge Stripe.js : ici on garde ce que la page lui passe et on simule le résultat.
let propsStripe;
jest.mock("@/components/stripe-payment", () => ({
  StripePayment: (props) => {
    propsStripe = props;
    return (
      <div data-testid="stripe">
        <button onClick={() => props.creerIntention().then((secret) => props.onPaymentComplete(secret === "secret-1"))}>payer</button>
        <button onClick={() => props.onPaymentComplete(false)}>refus</button>
      </div>
    );
  },
}));
jest.mock("@/lib/zupdrive", () => ({ ...jest.requireActual("@/lib/zupdrive"), appelerZupDrive: jest.fn() }));

const trajet = (statut, paiement) => ({
  id: "c1", statut, departAdresse: "Namur", arriveeAdresse: "Jambes", distanceMetres: 4000, dureeSecondes: 600, prixCentimes: 1500,
  annuleePar: null, departLatitude: 50.46, departLongitude: 4.86, arriveeLatitude: 50.45, arriveeLongitude: 4.88,
  chauffeur: null, maNote: null, peutNoter: false, paiement,
});

async function afficher(donnees) {
  appelerZupDrive.mockImplementation(async (chemin) => {
    if (chemin === "/api/zupdrive/payment/intent") return { clientSecret: "secret-1" };
    return donnees;
  });
  await act(async () => {
    render(<SuiviTrajetPage params={Promise.resolve({ id: "c1" })} />);
  });
  await screen.findByText(/statutDetail/);
}

beforeEach(() => {
  jest.clearAllMocks();
  propsStripe = undefined;
});

test("course à payer : le formulaire carte reçoit le prix de la course et crée l'intention par l'API", async () => {
  await afficher(trajet("RECHERCHE", { obligatoire: true, statut: null }));
  expect(screen.getByText("paiement.titre")).toBeTruthy();
  expect(screen.getByTestId("stripe")).toBeTruthy();
  // Le prix affiché au formulaire est celui du serveur (centimes → euros pour l'affichage seulement).
  expect(propsStripe.amount).toBe(15);
  expect(propsStripe.customerEmail).toBe("pat@exemple.test");
  // Une course n'est pas une commande ZupEat : pas de relevé /api/payments/confirm.
  expect(propsStripe.confirmerCommande).toBe(false);

  fireEvent.click(screen.getByText("payer"));
  await waitFor(() => expect(screen.getByText("paiement.confirmation")).toBeTruthy());
  // Seul l'identifiant de la course part : le montant n'est jamais envoyé par le navigateur.
  expect(appelerZupDrive).toHaveBeenCalledWith("/api/zupdrive/payment/intent", { method: "POST", corps: { courseId: "c1" } });
  // Carte acceptée : le formulaire disparaît en attendant la confirmation du webhook, relue par la page.
  expect(screen.queryByTestId("stripe")).toBeNull();
});

test("paiement refusé : le formulaire reste, rien n'est annoncé comme payé", async () => {
  await afficher(trajet("RECHERCHE", { obligatoire: true, statut: null }));
  fireEvent.click(screen.getByText("refus"));
  expect(screen.getByTestId("stripe")).toBeTruthy();
  expect(screen.queryByText("paiement.confirmation")).toBeNull();
  expect(screen.queryByText("paiement.paye")).toBeNull();
});

test("« payé » ne s'affiche que si le serveur le dit", async () => {
  await afficher(trajet("RECHERCHE", { obligatoire: true, statut: "SUCCEEDED" }));
  expect(screen.getByText("paiement.paye")).toBeTruthy();
  expect(screen.queryByTestId("stripe")).toBeNull();
});

test.each([
  ["SANS_CHAUFFEUR", "SUCCEEDED", "paiement.remboursement"],
  ["ANNULEE", "REFUND_REQUESTED", "paiement.remboursement"],
  ["ANNULEE", "REFUNDED", "paiement.rembourse"],
])("course %s, paiement %s : %s", async (statutCourse, statutPaiement, message) => {
  await afficher(trajet(statutCourse, { obligatoire: true, statut: statutPaiement }));
  expect(screen.getByText(message)).toBeTruthy();
  expect(screen.queryByTestId("stripe")).toBeNull();
});

test("paiement non exigé : la page n'affiche aucun bloc de paiement", async () => {
  await afficher(trajet("RECHERCHE", { obligatoire: false, statut: null }));
  expect(screen.queryByText("paiement.titre")).toBeNull();
  expect(screen.queryByTestId("stripe")).toBeNull();
});
