// Tests HTTP sur une API locale et une base dédiée : aucun service externe attaqué.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { inscrirePlateforme, inscrire, titre, check, j, uniq, post, get, patch, del, terminer } from './outils.mjs';
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const plateforme = await inscrirePlateforme();
const alice = await inscrire('audit-alice');
const bob = await inscrire('audit-bob');
const storeResponse = await post('/api/stores', {orgId:alice.organization.id,name:`Audit ${uniq}`,slug:`audit-${uniq}`,address:'1 place Bellecour',city:'Lyon',postalCode:'69002',phone:'0400000000',latitude:45.764,longitude:4.8357}, alice.accessToken);
const storeBody = await j(storeResponse);
const storeId = storeBody?.store?.id || storeBody?.id;
if (!storeId) throw new Error(`Boutique non créée: ${storeResponse.status}`);
async function livreur(nom) {
  const r = await post('/api/drivers/register', {conditionsAcceptees:true,name:nom,email:`${nom}-${uniq}@test.fr`,password:'Password123!',phone:'0600000000',vehicleType:'bike'});
  const c = await j(r);
  if (!c?.accessToken) throw new Error(`Livreur non créé: ${r.status}`);
  const d = await db.courier.findUniqueOrThrow({where:{email:`${nom}-${uniq}@test.fr`}});
  return {...d,token:c.accessToken};
}
const da = await livreur('audit-livreur-a');
const dbob = await livreur('audit-livreur-b');
const order = await db.order.create({data:{storeId,customerName:'Client confidentiel',customerEmail:`client-${uniq}@test.fr`,customerPhone:'0612345678',deliveryType:'DELIVERY',deliveryAddress:'Adresse confidentielle',totalAmount:12,taxAmount:0,feesAmount:3}});
const delivery = await db.orderDelivery.create({data:{orderId:order.id}});
const notification = await db.notification.create({data:{storeId,type:'ORDER_PLACED',title:'Privée',message:'Message confidentiel',recipientEmail:alice.user.email}});

titre('Boutique et notifications personnelles');
const notifications = [
 ['liste boutique',()=>get(`/api/notifications/${storeId}`,bob.accessToken),403],
 ['nombre boutique',()=>get(`/api/notifications/${storeId}/unread/count`,bob.accessToken),403],
 ['lecture boutique',()=>get(`/api/notifications/${storeId}/${notification.id}`,bob.accessToken),403],
 ['création boutique',()=>post(`/api/notifications/${storeId}`,{type:'ORDER_PLACED',title:'Intrusion',message:'Intrusion',recipientEmail:bob.user.email},bob.accessToken),403],
 ['lecture globale boutique',()=>patch(`/api/notifications/${storeId}/read-all`,{},bob.accessToken),403],
 ['marquer boutique',()=>patch(`/api/notifications/${storeId}/${notification.id}/read`,{},bob.accessToken),403],
 ['supprimer boutique',()=>del(`/api/notifications/${storeId}/${notification.id}`,null,bob.accessToken),403],
 ['marquer personnelle',()=>patch(`/api/notifications/${notification.id}/read`,{},bob.accessToken),404],
];
for(const [nom,appel,status] of notifications){const r=await appel();check(nom,r.status===status,`statut ${r.status}`);}
const personnelle = await j(await get(`/api/notifications?recipientEmail=${encodeURIComponent(alice.user.email)}`,bob.accessToken));
check('destinataire injecté ignoré',personnelle?.data?.every(n=>n.recipientEmail===bob.user.email));
await patch('/api/notifications/read-all',{},bob.accessToken);
let enBase=await db.notification.findUnique({where:{id:notification.id}});
check('notification Alice intacte',enBase?.isRead===false);
check('Alice lit sa boutique',(await get(`/api/notifications/${storeId}`,alice.accessToken)).status===200);
check('Alice marque sa notification',(await patch(`/api/notifications/${notification.id}/read`,{},alice.accessToken)).status===200);

titre('Livreurs et propositions de courses');
for(const token of [undefined, bob.accessToken, dbob.token]) {
 const r=await get(`/api/drivers/available?storeId=${storeId}`,token);
 check('annuaire boutique protégé',r.status===(token?403:401),`statut ${r.status}`);
}
check('annuaire propre boutique',(await get(`/api/drivers/available?storeId=${storeId}`,alice.accessToken)).status===200);
check('annuaire plateforme',(await get(`/api/drivers/available?storeId=${storeId}`,plateforme.accessToken)).status===200);
check('annuaire orgId multiple refusé',(await get(`/api/drivers/available?storeId=${storeId}&storeId=autre`,alice.accessToken)).status===400);
check('course sans jeton',(await get(`/api/drivers/deliveries/${delivery.id}`)).status===401);
check('course sans profil',(await get(`/api/drivers/deliveries/${delivery.id}`,bob.accessToken)).status===404);
check('course sans proposition refusée',(await get(`/api/drivers/deliveries/${delivery.id}`,dbob.token)).status===403);
check('position sans attribution refusée',(await patch(`/api/drivers/deliveries/${delivery.id}/location`,{latitude:45.7,longitude:4.8},dbob.token)).status===403);
check('acceptation sans proposition refusée',(await patch(`/api/drivers/deliveries/${delivery.id}/accept`,{},dbob.token)).status===403);
const offre=await db.deliveryOffer.create({data:{deliveryId:delivery.id,driverId:da.id,expiresAt:new Date(Date.now()+60000),payout:3}});
check('proposition en cours lisible',(await get(`/api/drivers/deliveries/${delivery.id}`,da.token)).status===200);
check('proposition autre livreur refusée',(await get(`/api/drivers/deliveries/${delivery.id}`,dbob.token)).status===403);
await db.deliveryOffer.update({where:{id:offre.id},data:{expiresAt:new Date(Date.now()-1000)}});
check('proposition expirée refusée',(await get(`/api/drivers/deliveries/${delivery.id}`,da.token)).status===403);
await db.deliveryOffer.update({where:{id:offre.id},data:{expiresAt:new Date(Date.now()+60000),status:'DECLINED'}});
check('proposition refusée inaccessible',(await get(`/api/drivers/deliveries/${delivery.id}`,da.token)).status===403);
await db.orderDelivery.update({where:{id:delivery.id},data:{driverId:da.id,status:'DELIVERED'}});
check('course attribuée autre livreur refusée',(await get(`/api/drivers/deliveries/${delivery.id}`,dbob.token)).status===403);
check('historique du propriétaire lisible',(await get(`/api/drivers/deliveries/${delivery.id}`,da.token)).status===200);
check('attribution finale intacte',(await db.orderDelivery.findUnique({where:{id:delivery.id}}))?.driverId===da.id);
check('position intruse non enregistrée',(await db.courier.findUnique({where:{id:dbob.id}}))?.latitude===null);

titre('Administration : authentification et privilèges');
const routes=['/api/admin/config','/api/admin/merchants','/api/admin/tickets','/api/admin/stats','/api/admin/notifications','/api/superowner/dashboard','/api/superowner/support-tickets','/api/superowner/members/clients','/api/superowner/system-config','/api/superowner/webhooks','/api/superowner/drivers','/api/zupdrive/admin/chauffeurs','/api/zupdrive/admin/societes','/api/zupdrive/admin/courses'];
for(const path of routes) {
 for(const token of [undefined,bob.accessToken]) {const r=await get(path,token);check(`${path} ${token?'compte ordinaire':'sans jeton'}`,r.status===(token?403:401),`statut ${r.status}`);}
}
for(const [path,method,body] of [['/api/admin/config','PUT',{}],[`/api/admin/merchants/${alice.organization.id}/suspend`,'POST',{reason:'Intrusion'}],[`/api/superowner/support-tickets/inconnu/status`,'PATCH',{status:'CLOSED'}],['/api/zupdrive/admin/tarifs/BRUXELLES','PUT',{}]]) {
 const r=await fetch((process.env.VERIF_API_URL||'http://localhost:3001')+path,{method,headers:{Authorization:`Bearer ${bob.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
 check('mutation administrative refusée',r.status===403,`${path}: ${r.status}`);
}
check('commerce Alice non suspendu',(await db.organization.findUnique({where:{id:alice.organization.id}}))?.status==='ACTIVE');

titre('ZupDrive : passagers et sociétés');
const trajet=await db.courseDrive.create({data:{passagerId:alice.user.id,cleIdempotence:`audit-${uniq}`,statut:'ANNULEE',region:'BRUXELLES',departAdresse:'Départ privé',departLatitude:50.85,departLongitude:4.35,arriveeAdresse:'Arrivée privée',arriveeLatitude:50.86,arriveeLongitude:4.36,distanceMetres:1000,dureeSecondes:300,prixCentimes:1000,tarifApplique:{}}});
for(const [nom,appel] of [['lecture',()=>get(`/api/zupdrive/courses/${trajet.id}`,bob.accessToken)],['annulation',()=>post(`/api/zupdrive/courses/${trajet.id}/annuler`,{},bob.accessToken)],['note',()=>post(`/api/zupdrive/courses/${trajet.id}/note`,{note:5},bob.accessToken)]]){const r=await appel();check(`trajet étranger ${nom}`,r.status===404,`statut ${r.status}`);}
check('trajet sans jeton',(await get(`/api/zupdrive/courses/${trajet.id}`)).status===401);
check('trajet propre lisible',(await get(`/api/zupdrive/courses/${trajet.id}`,alice.accessToken)).status===200);
const courses=await j(await get(`/api/zupdrive/courses?passagerId=${alice.user.id}`,bob.accessToken));
check('passagerId injecté ignoré',courses?.data?.every(c=>c.passagerId===bob.user.id));
for(const c of [alice,bob]){const r=await post('/api/zupdrive/societe/me',{raisonSociale:`Société ${c.user.name}`},c.accessToken);if(r.status!==201)throw new Error(`Société non créée: ${r.status}`);}
const v=await j(await post('/api/zupdrive/societe/me/vehicules',{marque:'Test',modele:'Test',plaque:`AUDIT-${uniq}`},alice.accessToken));
if(!v?.data?.id)throw new Error('Véhicule non créé');
check('véhicule étranger modification',(await patch(`/api/zupdrive/societe/me/vehicules/${v.data.id}`,{marque:'Intrusion'},bob.accessToken)).status===404);
check('véhicule étranger retrait',(await post(`/api/zupdrive/societe/me/vehicules/${v.data.id}/retirer`,{},bob.accessToken)).status===404);
check('véhicule intact en base',(await db.vehiculeDrive.findUnique({where:{id:v.data.id}}))?.marque==='Test');
check('trajet intact en base',(await db.courseDrive.findUnique({where:{id:trajet.id}}))?.annuleePar===null);
titre('Variantes de chemins : même isolation');
const produit = await db.product.create({data:{storeId,name:'Produit intact',price:12,sku:uniq}});
const idEncode = '%'+produit.id.charCodeAt(0).toString(16)+produit.id.slice(1);
for(const path of [`/api/products/${produit.id}`,`/api/PRODUCTS/${produit.id}`,`/API/products/${produit.id}`,`/api/products/${idEncode}`]) {
  const r=await fetch((process.env.VERIF_API_URL||'http://localhost:3001')+path,{method:'PUT',headers:{Authorization:`Bearer ${bob.accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({name:'Intrusion'})});
  check('variante de chemin inter-tenant refusée',r.status===403,`${path}: ${r.status}`);
}
check('produit intact en base',(await db.product.findUnique({where:{id:produit.id}}))?.name==='Produit intact');
const suspension = await post(`/api/admin/merchants/${alice.organization.id}/suspend`,{reason:'Vérification sécurité'},plateforme.accessToken);
check('suspension de test appliquée',suspension.status===200);
check('support suspendu casse alternative',(await get(`/API/SUPPORT/tickets?orgId=${alice.organization.id}`,alice.accessToken)).status===200);
check('compte suspendu casse alternative',(await get(`/API/SUPPORT/compte/${alice.organization.id}`,alice.accessToken)).status===200);
check('produit suspendu reste fermé',(await get(`/API/PRODUCTS/${produit.id}`,alice.accessToken)).status===403);
await db.$disconnect();
await terminer();

