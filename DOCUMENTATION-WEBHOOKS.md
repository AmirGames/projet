# Webhooks Zupone

Un webhook prévient **votre** serveur de ce qui se passe sur la plateforme :
une commande arrive, un ticket s'ouvre, un commerçant est suspendu. Vous
enregistrez une adresse, vous choisissez des événements, et Zupone vous envoie
une requête `POST` à chaque fois que l'un d'eux se produit.

Les abonnements se gèrent dans **Administration → Webhooks**
(`/superowner/webhooks`).

---

## 1. Ce que vous recevez

```http
POST https://votre-serveur.fr/zupone
Content-Type: application/json
X-Webhook-Event: order.created
X-Webhook-Signature: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b…
X-Webhook-Id: cmu5kdp8z000plyeg0pzox4al
X-Webhook-Attempt: 1

{
  "id": "cmu5kdp8z000plyeg0pzox4al",
  "event": "order.created",
  "sentAt": "2026-09-17T13:27:09.412Z",
  "attempt": 1,
  "data": {
    "orderId": "cmu5kde…",
    "storeId": "cmu5kdb…",
    "status": "PENDING",
    "deliveryType": "PICKUP",
    "totalAmount": 24,
    "customerName": "Client Dupont",
    "createdAt": "2026-09-17T13:27:09.380Z"
  }
}
```

| En-tête | Ce qu'il porte |
| --- | --- |
| `X-Webhook-Event` | Le nom de l'événement |
| `X-Webhook-Signature` | HMAC-SHA256 du corps, en hexadécimal |
| `X-Webhook-Id` | L'identifiant de **l'envoi** — le même à chaque relance |
| `X-Webhook-Attempt` | Le numéro de la tentative, de 1 à 4 |

---

## 2. Vérifier la signature

C'est ce qui prouve que la requête vient de Zupone et que personne n'a touché
au contenu. **Le secret est affiché une seule fois, à la création de
l'abonnement.** Il n'est récupérable nulle part ensuite : copiez-le tout de
suite. Si vous l'avez perdu, supprimez l'abonnement et recréez-le.

La signature porte sur le **corps brut**, octet pour octet. Si vous
re-sérialisez l'objet après l'avoir analysé, les espaces changent et la
signature ne tombera plus juste.

### Node / Express

```js
const crypto = require('crypto');

app.post('/zupone', express.raw({ type: 'application/json' }), (req, res) => {
  const attendue = crypto.createHmac('sha256', SECRET).update(req.body).digest('hex');
  const recue = req.get('X-Webhook-Signature') || '';

  const valide =
    recue.length === attendue.length &&
    crypto.timingSafeEqual(Buffer.from(attendue), Buffer.from(recue));

  if (!valide) return res.status(401).end();

  res.status(200).end();          // on répond d'abord
  const envoi = JSON.parse(req.body);
  traiter(envoi);                 // on travaille ensuite
});
```

### PHP

```php
$corps = file_get_contents('php://input');
$attendue = hash_hmac('sha256', $corps, $SECRET);

if (!hash_equals($attendue, $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '')) {
    http_response_code(401);
    exit;
}

http_response_code(200);
$envoi = json_decode($corps, true);
```

### Python / Flask

```python
import hmac, hashlib

@app.post("/zupone")
def zupone():
    corps = request.get_data()
    attendue = hmac.new(SECRET.encode(), corps, hashlib.sha256).hexdigest()

    if not hmac.compare_digest(attendue, request.headers.get("X-Webhook-Signature", "")):
        return "", 401

    return "", 200
```

Comparez toujours avec `timingSafeEqual` / `hash_equals` / `compare_digest`,
jamais avec `==` : une comparaison ordinaire s'arrête au premier caractère
différent, et ce temps de réponse suffit à deviner la signature attendue,
caractère par caractère.

---

## 3. Répondez vite

**Zupone abandonne l'envoi au bout de 5 secondes.** Répondez `200` dès que vous
avez vérifié la signature, et faites votre travail après — imprimer un ticket,
appeler votre caisse, envoyer un courriel. Un traitement lent ne rate pas
seulement le délai : il fait croire à Zupone que votre serveur est en panne.

Tout code de la famille `2xx` vaut succès. Tout le reste vaut échec, et
déclenche les relances.

---

## 4. Les relances

Un envoi raté est rejoué **trois fois** : une minute après, puis cinq, puis
trente. Quatre tentatives en tout, sur un peu plus d'une demi-heure. Au-delà,
l'envoi est abandonné.

La file d'attente est en base de données, pas en mémoire : un redémarrage du
serveur Zupone ne perd pas les relances en cours.

**Les relances portent le même `X-Webhook-Id`.** C'est ce qui vous permet de
reconnaître un envoi que vous avez déjà traité — par exemple si vous aviez bien
reçu la commande mais que votre réponse s'est perdue. Gardez les identifiants
déjà vus et ignorez les doublons, sinon vous compterez la même commande deux
fois.

> ⚠️ **Cinq envois abandonnés d'affilée coupent l'abonnement** : il passe en
> « Coupé » et plus rien n'est envoyé. Corrigez votre serveur, puis réactivez-le
> depuis l'écran — le secret ne change pas. Un envoi réussi remet le compteur à
> zéro.

---

## 5. Les événements

Six événements existent. **Ce sont les seuls** : la page n'en propose pas
d'autres, et le serveur refuse un abonnement qui en nomme un inconnu.

| Événement | Quand | Ce que porte `data` |
| --- | --- | --- |
| `order.created` | Une commande vient d'être passée | `orderId`, `storeId`, `status`, `deliveryType`, `totalAmount`, `customerName`, `createdAt` |
| `order.status_changed` | Une commande change d'état | `orderId`, `storeId`, `previousStatus`, `status`, `totalAmount` |
| `merchant.suspended` | Un compte commerçant est suspendu | `orgId`, `name`, `reason` |
| `merchant.closed` | Un compte commerçant est fermé | `orgId`, `name`, `reason`, `closedUntil` |
| `ticket.created` | Un commerçant ouvre un ticket | `ticketId`, `orgId`, `title`, `priority`, `category` |
| `ticket.message` | Un message est ajouté à un ticket | `ticketId`, `title`, `orgId`, `authorRole` |

Les états d'une commande : `PENDING`, `ACCEPTED`, `REJECTED`, `READY`,
`COMPLETED`.

À ceux-là s'ajoute `webhook.test`, envoyé uniquement par le bouton d'essai. Il
ne correspond à aucun événement réel — ne le traitez pas comme une commande.

---

## 6. Mettre au point son destinataire

Le bouton **Envoi d'essai** (l'icône d'avion, sur chaque abonnement) envoie un
`webhook.test` immédiatement et vous dit ce que votre serveur a répondu. C'est
la façon de vérifier votre récepteur sans attendre une vraie commande — et sans
risquer de la manquer.

L'icône d'horloge ouvre l'**historique** : les derniers envois, le code que vous
avez rendu, le nombre de tentatives, et l'heure de la prochaine relance quand il
y en a une.

Pour développer en local, exposez votre poste avec un tunnel (`ngrok http 3000`
ou équivalent) et enregistrez l'adresse publique qu'il vous donne.

---

## 7. Réglages du serveur

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `WEBHOOK_RELANCES_MS` | `60000,300000,1800000` | Les délais des relances, en millisecondes |
| `WEBHOOK_BALAYAGE_MS` | `15000` | À quelle fréquence les relances dues sont rejouées |

Les vérifications s'en servent pour ne pas attendre une demi-heure :

```bash
WEBHOOK_RELANCES_MS=300,600,900 WEBHOOK_BALAYAGE_MS=200 npx tsx src/server.ts
```

---

## 8. Ce qui n'existe pas encore

- **Les webhooks sont au niveau de la plateforme.** Un commerçant ne peut pas
  brancher sa propre caisse sur ses propres commandes : seul le superowner gère
  des abonnements, et ils reçoivent les événements de tous les commerces.
- **Aucun filtrage par boutique** : si vous vous abonnez à `order.created`, vous
  recevez toutes les commandes de la plateforme.
- **Pas de rotation du secret** : pour en changer, il faut supprimer
  l'abonnement et le recréer.
