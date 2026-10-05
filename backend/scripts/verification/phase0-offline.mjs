/** Node >=24. Code réel, dépendances simulées ; ne remplace pas les suites Jest/HTTP. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import crypto from 'node:crypto';
const root = new URL('../../src/', import.meta.url);
let id = 0;
const modules = globalThis.__phase0Modules = new Map();
async function charger(file, deps = {}) {
  const key = ++id; modules.set(key, deps);
  const source = stripTypeScriptTypes(readFileSync(new URL(file, root),'utf8'),{mode:'transform'})
    .replace(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g,(_,names,path)=> {
      assert.ok(path in deps, `${file}: dépendance ${path}`);
      const dep=`globalThis.__phase0Modules.get(${key})[${JSON.stringify(path)}]`;
      return names.startsWith('{') ? `const ${names.replace(/\bas\b/g,':')} = ${dep};` : `const ${names} = ${dep}.default;`;
    });
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
class ApiError extends Error { constructor(statusCode,message,code) { super(message);Object.assign(this,{statusCode,code}); } }
const events=[]; const logger={warn(){},error(){},info(){}};
const storage=await charger('middleware/throttle-stockage.ts',{redis:{createClient(){throw Error('Redis non configuré');}},'../config/logger':{logger}});
const throttle=await charger('middleware/throttle.ts', {crypto:{createHash:crypto.createHash},express:{},'./errorHandler':{ApiError},'./throttle-stockage':storage,'../modules/auth/security-event.service':{SecurityEventService:{record:e=>events.push(e)}}});
process.env.NODE_ENV='test';
const req=(email='a@example.test')=>({ip:'127.0.0.1',body:{email}});
async function passer(mw,r) {let erreur,statut;const headers={};const res={setHeader:(k,v)=>headers[k]=v,status:n=>{statut=n;return res;},json:()=>res};await mw(r,res,e=>{erreur=e;});return{erreur,statut,headers};}
let controles=0;
async function verifier(nom,test){await test();console.log(`OK ${nom}`);controles++;}
await verifier('5 essais, puis 429 et Retry-After',async()=>{for(let i=0;i<5;i++)assert.equal((await passer(throttle.limiterConnexions,req())).erreur,undefined);const r=await passer(throttle.limiterConnexions,req());assert.equal(r.erreur.statusCode,429);assert.ok(Number(r.headers['Retry-After'])>0);});
await verifier('changement IP/casse/espaces ne contourne pas le blocage',async()=>assert.equal((await passer(throttle.limiterConnexions,{...req(' A@EXAMPLE.TEST '),ip:'192.0.2.2'})).erreur.statusCode,429));
await verifier('connexion réussie réinitialise le budget',async()=>{await throttle.limiterConnexions.reinitialiser(req());assert.equal((await passer(throttle.limiterConnexions,req())).erreur,undefined);});
await verifier('blocage et récidive journalisés',async()=>{const mw=throttle.limiterCadence({max:1,fenetreMs:60000,cle:()=> 'key'});for(let i=0;i<11;i++)await passer(mw,req());assert.ok(events.some(e=>e.action==='RATE_LIMIT_BLOCKED'));assert.ok(events.some(e=>e.action==='BRUTEFORCE_RECURRENCE'&&e.severity==='HIGH'));});
await verifier('production sans Redis : 503',async()=>{process.env.NODE_ENV='production';delete process.env.REDIS_URL;assert.equal((await passer(throttle.limiterConnexions,req('new'))).erreur.statusCode,503);process.env.NODE_ENV='test';});
await verifier('production avec compteur défaillant : 503',async()=>{const mw=throttle.limiterCadence({max:1,fenetreMs:60000,cle:()=> 'key',stockage:{incrementer:async()=>{throw Error('down');}}});process.env.NODE_ENV='production';assert.equal((await passer(mw,req())).erreur.statusCode,503);process.env.NODE_ENV='test';});
await verifier('instances partagent le compteur ; emails absents des clés Redis',async()=>{const counts=new Map();const redis=new storage.StockageRedis({eval:async(_,{keys})=>{assert.ok(!keys[0].includes('@'));const n=(counts.get(keys[0])||0)+1;counts.set(keys[0],n);return[n,60000];},del:async key=>counts.delete(key)});const options={nom:'shared',max:1,fenetreMs:60000,cle:r=>r.body.email,stockage:redis};assert.equal((await passer(throttle.limiterCadence(options),req())).erreur,undefined);assert.equal((await passer(throttle.limiterCadence(options),req())).erreur.statusCode,429);});
await verifier('expiration du blocage mémoire',async()=>{const mem=new storage.StockageMemoire();const old=Date.now;let now=100;Date.now=()=>now;try{assert.equal((await mem.incrementer('k',10)).compte,1);assert.equal((await mem.incrementer('k',10)).compte,2);now=111;assert.equal((await mem.incrementer('k',10)).compte,1);}finally{Date.now=old;}});
let user={id:'alice',status:'ACTIVE',isSuperOwner:false,isSystemAdmin:false,accesEquipe:[],passwordChangedAt:null};
const sessions=new Map(),tokens=[];let nextId=0,unreadable=false;
const orgA='aaaaaaaaaaaaaaaaaaaaaaaaa',orgB='bbbbbbbbbbbbbbbbbbbbbbbbb',storeA='ccccccccccccccccccccccccc',storeB='ddddddddddddddddddddddddd',resourceB='eeeeeeeeeeeeeeeeeeeeeeeee';
const db={
 user:{findUnique:async()=>user},
 store:{findUnique:async({where})=>where.id===storeA?{orgId:orgA}:where.id===storeB?{orgId:orgB}:null},
 organization:{findUnique:async({where})=>[orgA,orgB].includes(where.id)?{id:where.id}:null},
 membership:{findMany:async()=>[{orgId:orgA,role:'ADMIN',storeIds:[]}]},
 product:{findUnique:async()=>{if(unreadable)throw Error('DB down');return{storeId:storeB,store:{orgId:orgB}};}},
 sessionConnexion:{
  create:async({data})=>{const s={id:`s${++nextId}`,revokedAt:null,...data};sessions.set(s.id,s);return s;},
  findUnique:async({where})=>sessions.get(where.id)||null,
  updateMany:async({where,data})=>{const found=[...sessions.values()].filter(s=>(!where.userId||s.userId===where.userId)&&(!where.id||(typeof where.id==='string'?s.id===where.id:s.id!==where.id.not))&&!s.revokedAt);found.forEach(s=>Object.assign(s,data));return{count:found.length};},
 },
 jetonRafraichissement:{
  create:async({data})=>tokens.push({id:`j${++nextId}`,usedAt:null,...data}),
  findUnique:async({where})=>tokens.find(t=>t.jtiHash===where.jtiHash)||null,
  updateMany:async({where,data})=>{const found=tokens.filter(t=>t.id===where.id&&!t.usedAt);found.forEach(t=>Object.assign(t,data));return{count:found.length};},
  deleteMany:async()=>({count:0}),
 },
};
const AuthService={generateAccessToken:(userId,sid)=>JSON.stringify({userId,sid,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+900}),generateRefreshToken:(userId,sid,jti)=>JSON.stringify({userId,sid,jti}),verifyAccessToken:JSON.parse,verifyRefreshToken:JSON.parse};
const common={express:{},'../../services/db':{db},'../../middleware/errorHandler':{ApiError}};
const sso=await charger('modules/auth/sso.service.ts',{...common,crypto:{default:crypto},'./auth.service':{AuthService},'./origines-autorisees':{originesAutorisees:()=>[]}});
const auth=await charger('modules/auth/auth.middleware.ts',{...common,'./auth.service':{AuthService},'./sso.service':sso});
await verifier('session serveur expire à 7 jours',async()=>{const before=Date.now();const{sid}=await sso.SsoService.connecter('alice');const age=sessions.get(sid).expiresAt.getTime()-before;assert.ok(age>=7*86400000&&age<=7*86400000+1000);});
await verifier('rotation à chaque renouvellement',async()=>{const{refreshToken:r1}=await sso.SsoService.connecter('alice');const{refreshToken:r2}=await sso.SsoService.renouveler(r1);assert.notEqual(r1,r2);assert.ok(JSON.parse(r2).jti);});
await verifier('rejeu tardif révoque access et refresh',async()=>{const{refreshToken:r1,accessToken}=await sso.SsoService.connecter('alice');const{refreshToken:r2}=await sso.SsoService.renouveler(r1);tokens.find(t=>t.jtiHash===crypto.createHash('sha256').update(JSON.parse(r1).jti).digest('hex')).usedAt=new Date(Date.now()-60000);await assert.rejects(sso.SsoService.renouveler(r1),e=>e.code==='SESSION_INVALIDE');await assert.rejects(sso.SsoService.renouveler(r2),e=>e.code==='SESSION_INVALIDE');assert.equal((await passer(auth.authMiddleware,{headers:{authorization:`Bearer ${accessToken}`}})).erreur.statusCode,401);});
await verifier('révocation externe visible sans cache',async()=>{const{sid}=await sso.SsoService.connecter('alice');assert.equal(await sso.SsoService.sessionActive(sid),true);sessions.get(sid).revokedAt=new Date();assert.equal(await sso.SsoService.sessionActive(sid),false);});
await verifier('expiration serveur refusée',async()=>{const{sid}=await sso.SsoService.connecter('alice');sessions.get(sid).expiresAt=new Date(0);assert.equal(await sso.SsoService.sessionActive(sid),false);});
await verifier('révocation globale inclut session courante',async()=>{const a=await sso.SsoService.connecter('alice'),b=await sso.SsoService.connecter('alice');await sso.SsoService.fermerToutes('alice');assert.equal(await sso.SsoService.sessionActive(a.sid),false);assert.equal(await sso.SsoService.sessionActive(b.sid),false);});
await verifier('refresh sans session refusé en production',async()=>{process.env.NODE_ENV='production';await assert.rejects(sso.SsoService.renouveler(JSON.stringify({userId:'alice'})),e=>e.code==='SESSION_INVALIDE');process.env.NODE_ENV='test';});
await verifier('refresh sans jti refusé',async()=>{const{sid}=await sso.SsoService.connecter('alice');await assert.rejects(sso.SsoService.renouveler(JSON.stringify({userId:'alice',sid})),e=>e.code==='SESSION_INVALIDE');});
await verifier('refresh stocké expiré refusé',async()=>{const{refreshToken}=await sso.SsoService.connecter('alice');tokens.at(-1).expiresAt=new Date(0);await assert.rejects(sso.SsoService.renouveler(refreshToken),e=>e.code==='SESSION_INVALIDE');});
await verifier('compte supprimé refusé sans cache',async()=>{assert.ok(await auth.compteDuJeton('alice'));const old=user;user=null;assert.equal(await auth.compteDuJeton('alice'),null);user=old;});
await verifier('compte suspendu refusé sans cache',async()=>{user.status='SUSPENDED';assert.equal(await auth.compteDuJeton('alice'),null);user.status='ACTIVE';});
await verifier('droits retirés immédiatement',async()=>{user.isSystemAdmin=true;assert.equal((await auth.compteDuJeton('alice')).isSystemAdmin,true);user.isSystemAdmin=false;assert.equal((await auth.compteDuJeton('alice')).isSystemAdmin,false);});
const chemin=await charger('utils/chemin.ts');
const cloison=await charger('modules/auth/cloisonnement.middleware.ts',{...common,'../../utils/chemin':chemin,'../../config/logger':{logger},'./auth.middleware':auth,'./security-event.service':{SecurityEventService:{record:e=>events.push(e)}}});
const merchantReq=path=>({path,method:'GET',headers:{authorization:`Bearer ${JSON.stringify({userId:'alice'})}`},query:{},body:{}});
await verifier('boutique propre autorisée',async()=>assert.equal((await passer(cloison.cloisonnement,merchantReq(`/api/invoices/${storeA}`))).statut,undefined));
for(const endroit of ['URL','query','body'])await verifier(`boutique étrangère dans ${endroit} refusée`,async()=>{const r=merchantReq(endroit==='URL'?`/api/invoices/${storeB}`:'/api/reports');if(endroit!=='URL')r[endroit]={storeId:storeB};assert.equal((await passer(cloison.cloisonnement,r)).statut,403);});
await verifier('support/admin sans appartenance ne contourne plus le cloisonnement',async()=>{user.isSystemAdmin=true;assert.equal((await passer(cloison.cloisonnement,merchantReq(`/api/invoices/${storeB}`))).statut,403);user.isSystemAdmin=false;});
await verifier('produit étranger refusé',async()=>assert.equal((await passer(cloison.cloisonnement,{...merchantReq(`/api/products/${resourceB}`),method:'PUT'})).statut,403));
await verifier('propriétaire illisible : refus',async()=>{unreadable=true;assert.equal((await passer(cloison.cloisonnement,{...merchantReq(`/api/products/${resourceB}`),method:'PUT'})).statut,403);unreadable=false;});
const finances=await charger('modules/auth/financial-data.ts');
await verifier('finances imbriquées et pièces bank retirées sans modifier l’identité',async()=>{const input={name:'Commerce',revenu:50,stores:[{name:'Boutique',iban:'BE...',stats:{totalRevenue:200,ordersCount:4}}],documents:[{type:'bank',documentUrl:'secret'},{type:'identity',documentUrl:'identity'}]};assert.deepEqual(finances.filtrerDonneesFinancieres(input),{name:'Commerce',stores:[{name:'Boutique',stats:{ordersCount:4}}],documents:[{type:'identity',documentUrl:'identity'}]});assert.equal(input.documents.length,2);});

let rolePermissions = { organizations: 'read', drivers: 'read', dashboard: 'read' };
db.platformRole = {
 findMany: async () => ['SUPPORT','ADMIN','SUPER_ADMIN'].map(code => ({code,label:code,permissions:code === 'SUPPORT' ? rolePermissions : {billing:'write'}})),
 createMany: async () => undefined,
 findUnique: async () => ({permissions:rolePermissions}),
};
const permissions = await charger('modules/auth/permissions-plateforme.service.ts', {
 ...common, './financial-data':finances, '@prisma/client':{}, '../../utils/chemin':chemin,
});
const support = {id:'support',isSuperOwner:false,isSystemAdmin:true,acces:{EAT:'SUPPORT'}};
await verifier('support ne peut pas lire la facturation', async()=> {
 assert.equal((await passer(permissions.exigerPermission('superowner'),{compte:support,path:'/billing',method:'GET'})).erreur.statusCode,403);
});
await verifier('permissions de rôle retirées sans cache', async()=> {
 assert.equal((await permissions.PermissionsPlateforme.permissionsDu('SUPPORT')).organizations,'read');
 rolePermissions={}; assert.deepEqual(await permissions.PermissionsPlateforme.permissionsDu('SUPPORT'),{});
 rolePermissions={organizations:'read',drivers:'read',dashboard:'read'};
});
await verifier('réponse réellement filtrée sur route autorisée au support', async()=> {
 let data;const res={json:body=>{data=body;return res;}};let err;
 await permissions.exigerPermission('superowner')({compte:support,path:'/organizations',method:'GET'},res,e=>{err=e;});
 assert.equal(err,undefined);res.json({organizations:[{name:'Commerce',revenue:200,iban:'BE123'}]});
 assert.deepEqual(data,{organizations:[{name:'Commerce'}]});
});
await verifier('route financière autorisée conserve ses montants', async()=> {
 let data;const res={json:body=>{data=body;return res;}};
 await permissions.exigerPermission('superowner')({compte:{...support,acces:{EAT:'ADMIN'}},path:'/billing',method:'GET'},res,e=>assert.equal(e,undefined));
 res.json({totalAmount:200});assert.deepEqual(data,{totalAmount:200});
});
user.email='alice@example.test';user.emailVerified=true;
db.order={findUnique:async()=>({customerEmail:'bob@example.test',store:{orgId:orgB},delivery:{driver:{userId:'bob'}}})};
db.membership.findFirst=async({where})=>where.userId==='alice'&&where.orgId===orgA?{id:'membership'}:null;
const sockets=await charger('modules/realtime/socket-access.ts', {
 '../../services/db':{db}, '../auth/sso.service':sso, '../auth/permissions-plateforme.service':permissions,
});
await verifier('Socket : commande étrangère refusée',async()=>assert.equal(await sockets.accesCommande(user,'order-b'),false));
await verifier('Socket : salon privé d’un autre compte refusé',async()=>assert.equal(await sockets.accesSalon(user,'compte-bob'),false));
await verifier('Socket : salon propre autorisé',async()=>assert.equal(await sockets.accesSalon(user,'compte-alice'),true));
await verifier('Socket : session révoquée refusée',async()=>{const{sid}=await sso.SsoService.connecter('alice');sessions.get(sid).revokedAt=new Date();assert.equal(await sockets.compteSocket({userId:'alice',sid,exp:Math.floor(Date.now()/1000)+900}),null);});
await verifier('Socket : access expiré refusé',async()=>assert.equal(await sockets.compteSocket({userId:'alice',exp:0}),null));
const types=await charger('utils/file-type.ts');
const files=await charger('modules/files/fichiers-prives.service.ts',{
 crypto:{createHmac:crypto.createHmac,randomBytes:crypto.randomBytes,timingSafeEqual:crypto.timingSafeEqual},
 fs:{default:await import('node:fs')},path:await import('node:path'),
 '../../config/env':{getEnv:()=>({JWT_SECRET:'a'.repeat(40),API_URL:'https://api.test'})},
 '../../utils/file-type':types,'../../services/db':{db},'../auth/permissions-plateforme.service':permissions,
});
db.courierDocument={findFirst:async({where})=>where.driver.userId==='alice'?{id:'doc'}:null};
db.organizationDocument={findFirst:async({where})=>where.org?(where.org.memberships.some.userId==='alice'?{id:'doc',type:'bank'}:null):{id:'doc',type:'bank'}};
await verifier('document livreur : propriétaire autorisé, autre compte refusé',async()=>{
 assert.equal(await files.peutLire({userId:'alice'},'drivers/permis.jpg'),true);
 assert.equal(await files.peutLire({userId:'bob'},'drivers/permis.jpg'),false);
});
await verifier('document bancaire commerçant refusé au support',async()=>assert.equal(await files.peutLire({userId:'support',compte:support},'merchants/rib.pdf'),false));
await verifier('document bancaire conservé pour son propriétaire',async()=>assert.equal(await files.peutLire({userId:'alice'},'merchants/rib.pdf'),true));
await verifier('une permission DRIVE ne donne pas accès aux pièces EAT',async()=>assert.equal(await files.peutLire({userId:'support',compte:{...support,acces:{DRIVE:'ADMIN'}}},'merchants/rib.pdf'),false));
await verifier('signature document : substitution chemin et expiration refusées',async()=>{
 const now=Date.now();const{exp,sig}=files.signer('drivers/permis.jpg',now);
 assert.equal(files.signatureValable('drivers/permis.jpg',String(exp),sig,now),true);
 assert.equal(files.signatureValable('drivers/autre.jpg',String(exp),sig,now),false);
 assert.equal(files.signatureValable('drivers/permis.jpg',String(exp),sig,now+301000),false);
});
console.log(`\n${controles} contrôles locaux réussis. Dépendances simulées ; Phase 0 non validée.`);
delete globalThis.__phase0Modules;
