import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { apiFetch } from "../lib/api";
import {
  addressIcon,
  addressName,
  type SavedAddress,
} from "../lib/saved-addresses";
import AddressScreen from "./screens/AddressScreen";
import { Card, COLORS } from "./ui";

export default function SavedAddressesCard({ token }: { token: string }) {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [draft, setDraft] = useState<SavedAddress | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [picking, setPicking] = useState(false);
  const load = useCallback(
    () =>
      apiFetch<{ data: SavedAddress[] }>("/api/client/me/addresses", token)
        .then((res) => {
          setAddresses(res.data.filter((a) => a.kind));
          setLoaded(true);
          setError("");
        })
        .catch(() => {
          setError("Impossible de charger vos adresses.");
        }),
    [token],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const edit = (kind: SavedAddress["kind"], address?: SavedAddress) =>
    setDraft(
      address || {
        id: Array.from({ length: 21 }, (_, i) => `favorite-${i}`).find(
          (id) => !addresses.some((a) => a.id === id),
        )!,
        kind,
        name: "",
        label: "",
        street: "",
        city: "",
        postalCode: "",
        latitude: null,
        longitude: null,
      },
    );
  const save = async (next: SavedAddress[]) => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch<{ data: SavedAddress[] }>(
        "/api/client/me/addresses",
        token,
        { method: "PUT", body: { addresses: next } },
      );
      setAddresses(res.data);
      setDraft(null);
      Alert.alert("Mes adresses", "Vos adresses sont enregistrées.");
    } catch (e: any) {
      setError(e?.message || "Impossible d’enregistrer vos adresses.");
    } finally {
      setSaving(false);
    }
  };
  const row = (kind: SavedAddress["kind"], address?: SavedAddress) => (
    <View key={address?.id || kind} style={styles.row}>
      <Text style={styles.icon}>{addressIcon(kind)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>
          {addressName({ kind, name: address?.name || "" })}
        </Text>
        <Text style={styles.help}>
          {address
            ? `${address.street}, ${address.postalCode} ${address.city}`
            : "Aucune adresse enregistrée"}
        </Text>
      </View>
      <TouchableOpacity
        accessibilityLabel={`${address ? "Modifier" : "Ajouter"} ${addressName({ kind, name: address?.name || "" })}`}
        disabled={!loaded || saving}
        onPress={() => edit(kind, address)}
        style={styles.action}
      >
        <Text style={styles.actionText}>
          {address ? "Modifier" : "Ajouter"}
        </Text>
      </TouchableOpacity>
      {address ? (
        <TouchableOpacity
          accessibilityLabel={`Supprimer ${addressName(address)}`}
          disabled={saving}
          onPress={() => save(addresses.filter((a) => a.id !== address.id))}
          style={styles.action}
        >
          <Text style={styles.help}>✕</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <Card title="Mes adresses favorites">
      <Text style={styles.help}>
        Retrouvez-les au moment de choisir votre livraison.
      </Text>
      {error ? (
        <View>
          <Text style={styles.error}>{error}</Text>
          {!loaded ? (
            <TouchableOpacity onPress={load}>
              <Text style={styles.actionText}>Réessayer</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {!loaded && !error ? <ActivityIndicator color={COLORS.primary} /> : null}
      {row(
        "HOME",
        addresses.find((a) => a.kind === "HOME"),
      )}
      {row(
        "WORK",
        addresses.find((a) => a.kind === "WORK"),
      )}
      {addresses.filter((a) => a.kind === "OTHER").map((a) => row("OTHER", a))}
      <TouchableOpacity
        disabled={!loaded || saving || addresses.length >= 20}
        onPress={() => edit("OTHER")}
        style={styles.action}
      >
        <Text style={styles.actionText}>＋ Ajouter un favori</Text>
      </TouchableOpacity>
      {draft ? (
        <View style={styles.form}>
          <Text style={styles.name}>
            {addressIcon(draft.kind)}{" "}
            {draft.kind === "OTHER" ? "Adresse favorite" : addressName(draft)}
          </Text>
          {draft.kind === "OTHER" ? (
            <View>
              <Text style={styles.help}>Nom du favori</Text>
              <TextInput
                value={draft.name}
                maxLength={50}
                placeholder="Maman, chez un ami…"
                placeholderTextColor={COLORS.muted}
                onChangeText={(name) => setDraft({ ...draft, name })}
                style={styles.input}
              />
            </View>
          ) : null}
          <TouchableOpacity
            onPress={() => setPicking(true)}
            style={styles.action}
          >
            <Text style={styles.actionText}>📍 Rechercher l’adresse</Text>
          </TouchableOpacity>
          {(["street", "postalCode", "city"] as const).map((key) => (
            <View key={key}>
              <Text style={styles.help}>
                {key === "street"
                  ? "Numéro et rue"
                  : key === "city"
                    ? "Ville"
                    : "Code postal"}
              </Text>
              <TextInput
                value={draft[key]}
                onChangeText={(value) =>
                  setDraft({
                    ...draft,
                    [key]: value,
                    latitude: null,
                    longitude: null,
                  })
                }
                style={styles.input}
              />
            </View>
          ))}
          <View style={styles.buttons}>
            <TouchableOpacity
              disabled={
                saving ||
                draft.street.trim().length < 3 ||
                !draft.city.trim() ||
                !draft.postalCode.trim() ||
                (draft.kind === "OTHER" && !draft.name.trim())
              }
              onPress={() =>
                save([...addresses.filter((a) => a.id !== draft.id), draft])
              }
              style={styles.save}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                {saving ? "Enregistrement…" : "Enregistrer"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={saving}
              onPress={() => setDraft(null)}
              style={styles.action}
            >
              <Text style={styles.help}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <Modal
        visible={picking}
        animationType="slide"
        onRequestClose={() => setPicking(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
          {draft ? (
            <AddressScreen
              current={draft}
              onBack={() => setPicking(false)}
              onSave={(selected) => {
                setDraft({ ...draft, ...selected });
                setPicking(false);
              }}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 14,
  },
  icon: { fontSize: 23 },
  name: { color: COLORS.text, fontSize: 15, fontWeight: "700" },
  help: { color: COLORS.muted, fontSize: 12, marginTop: 3 },
  error: { color: "#c62828", marginVertical: 8 },
  action: { padding: 8 },
  actionText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  form: { paddingTop: 16, gap: 10 },
  input: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.muted,
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    color: COLORS.text,
  },
  buttons: { flexDirection: "row", alignItems: "center", gap: 8 },
  save: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 8 },
});
