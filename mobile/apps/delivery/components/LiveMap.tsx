import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

export interface MapPoint {
  lat: number;
  lng: number;
}

export interface RouteInfo {
  /** Par la route, en mètres. */
  distanceM: number;
  /** Durée estimée en voiture, en secondes. */
  durationS: number;
}

/**
 * La carte de la course, dans l'application : le livreur en direct, le
 * commerce, le client, et l'itinéraire par la route jusqu'à la prochaine
 * étape. Même fond que le site (OpenStreetMap, dessiné par Leaflet) : ni clé,
 * ni compte, et rien ne s'ouvre en dehors de l'application.
 *
 * La carte suit le livreur ; il peut la déplacer du doigt, un bouton la
 * recentre. L'itinéraire vient du service public OSRM et se recalcule quand
 * le livreur s'en écarte ; faute de réseau, un trait direct le remplace.
 */
export default function LiveMap({
  driver,
  pickup,
  dropoff,
  target,
  follow = 'driver',
  height,
  onRoute,
  dark,
  bottomInset = 0,
}: {
  driver: MapPoint | null;
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
  /**
   * La prochaine étape : l'itinéraire y mène. « tour » trace la course entière
   * (livreur, commerce, client), pour une proposition.
   */
  target: 'pickup' | 'dropoff' | 'tour' | null;
  /** « driver » centre sur le livreur, « overview » garde tous les points en vue. */
  follow?: 'driver' | 'overview';
  /** Sans hauteur, la carte occupe toute la place disponible. */
  height?: number;
  onRoute?: (route: RouteInfo | null) => void;
  /** Fond de carte assombri, pour l'écran de course au thème sombre. */
  dark?: boolean;
  /** Hauteur couverte par un panneau en bas de la carte : le cadrage l'évite. */
  bottomInset?: number;
}) {
  const web = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const onRouteRef = useRef(onRoute);
  onRouteRef.current = onRoute;

  useEffect(() => {
    if (!ready) return;
    const data = JSON.stringify({ driver, pickup, dropoff, target, follow, dark: !!dark, bottomInset });
    web.current?.injectJavaScript(`window.maj && window.maj(${data}); true;`);
  }, [ready, driver?.lat, driver?.lng, pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, target, follow, dark, bottomInset]);

  const onMessage = (e: WebViewMessageEvent) => {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === 'route') onRouteRef.current?.(msg.route || null);
    } catch {
      // Message illisible : ignoré.
    }
  };

  return (
    <View style={[styles.box, dark && styles.boxDark, height ? { height } : { flex: 1 }]}>
      <WebView
        ref={web}
        source={{ html: HTML, baseUrl: 'https://zupone.com/' }}
        originWhitelist={['*']}
        onLoadEnd={() => setReady(true)}
        onMessage={onMessage}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        style={[styles.web, dark && styles.boxDark]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 10, overflow: 'hidden', backgroundColor: '#e5e3df' },
  web: { flex: 1, backgroundColor: '#e5e3df' },
  boxDark: { backgroundColor: '#1b1d20' },
});

const HTML = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; background: #e5e3df; }
  /* Thème sombre : les tuiles OpenStreetMap inversées, les couleurs remises
     dans le bon sens. Les repères et l'itinéraire, eux, gardent leurs couleurs. */
  body.dark, body.dark #map { background: #1b1d20; }
  body.dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9); }
  body.dark .leaflet-control-attribution { background: rgba(0,0,0,.6); color: #aaa; }
  body.dark .leaflet-control-attribution a { color: #8ab4f8; }
  .pin { display:flex; align-items:center; justify-content:center; width:32px; height:32px; border-radius:50%;
         border:3px solid #fff; font-size:16px; box-shadow:0 1px 4px rgba(0,0,0,.45); }
  #recentrer { position:absolute; right:10px; bottom:24px; z-index:1000; display:none; background:#EA580C; color:#fff;
         border:none; border-radius:20px; padding:9px 14px; font:600 14px sans-serif; box-shadow:0 1px 4px rgba(0,0,0,.35); }
</style>
</head><body>
<div id="map"></div>
<button id="recentrer">◎ Recentrer</button>
<script>
(function () {
  function send(msg) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg)); }
  if (typeof L === 'undefined') { send({ type: 'route', route: null }); return; }

  var map = L.map('map', { zoomControl: false }).setView([46.6, 2.4], 5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  function icon(bg, emoji) {
    return L.divIcon({ className: '', html: '<span class="pin" style="background:' + bg + '">' + emoji + '</span>',
      iconSize: [32, 32], iconAnchor: [16, 16] });
  }
  var ICONS = { driver: icon('#EA580C', '🛵'), pickup: icon('#475569', '🏪'), dropoff: icon('#16a34a', '🏠') };
  var markers = { driver: null, pickup: null, dropoff: null };
  var line = null;
  var following = true;
  var framed = false;
  var state = {};
  var lastRoute = { key: '', from: null, at: 0 };
  var btn = document.getElementById('recentrer');

  map.on('dragstart', function () { following = false; btn.style.display = 'block'; });
  btn.onclick = function () { following = true; framed = false; btn.style.display = 'none'; frame(); };

  function ll(p) { return [p.lat, p.lng]; }
  function dist(a, b) {
    var r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
  function place(name, p) {
    if (!p) { if (markers[name]) { map.removeLayer(markers[name]); markers[name] = null; } return; }
    if (markers[name]) markers[name].setLatLng(ll(p));
    else markers[name] = L.marker(ll(p), { icon: ICONS[name], zIndexOffset: name === 'driver' ? 1000 : 0 }).addTo(map);
  }
  function points() {
    return ['driver', 'pickup', 'dropoff'].map(function (k) { return state[k]; }).filter(Boolean);
  }
  function frame() {
    if (!following) return;
    var goal = state.target && state.target !== 'tour' ? state[state.target] : null;
    if (state.follow === 'driver' && state.driver && framed) { map.panTo(ll(state.driver)); return; }
    var pts = state.follow === 'driver' && state.driver && goal ? [state.driver, goal] : points();
    if (pts.length === 1) map.setView(ll(pts[0]), 16);
    else if (pts.length > 1) map.fitBounds(pts.map(ll), {
      paddingTopLeft: [40, 60], paddingBottomRight: [40, 40 + (state.bottomInset || 0)], maxZoom: 17 });
    framed = pts.length > 0;
  }
  function straight(from, to) {
    if (line) map.removeLayer(line);
    line = L.polyline([ll(from), ll(to)], { color: '#EA580C', weight: 4, opacity: 0.7, dashArray: '8 8' }).addTo(map);
    send({ type: 'route', route: { distanceM: dist(from, to) * 1.3, durationS: dist(from, to) * 1.3 / 8 } });
  }
  function tour() {
    var pts = [state.driver, state.pickup, state.dropoff].filter(Boolean);
    if (pts.length < 2) { if (line) { map.removeLayer(line); line = null; } send({ type: 'route', route: null }); return; }
    var key = 'tour:' + pts.map(function (p) { return p.lat + ',' + p.lng; }).join(';');
    if (key === lastRoute.key) return;
    lastRoute = { key: key, from: pts[0], at: Date.now() };
    var droit = function () {
      if (line) map.removeLayer(line);
      line = L.polyline(pts.map(ll), { color: '#EA580C', weight: 5, opacity: 0.7, dashArray: '8 8' }).addTo(map);
      var m = 0; for (var i = 1; i < pts.length; i++) m += dist(pts[i - 1], pts[i]) * 1.3;
      send({ type: 'route', route: { distanceM: m, durationS: m / 8 } });
    };
    var url = 'https://router.project-osrm.org/route/v1/driving/' +
      pts.map(function (p) { return p.lng + ',' + p.lat; }).join(';') + '?overview=full&geometries=geojson';
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var best = data && data.routes && data.routes[0];
      if (!best) { droit(); return; }
      if (line) map.removeLayer(line);
      line = L.polyline(best.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }),
        { color: '#1F2328', weight: 6, opacity: 0.8 }).addTo(map);
      if (document.body.classList.contains('dark')) line.setStyle({ color: '#E6E8EB' });
      send({ type: 'route', route: { distanceM: best.distance, durationS: best.duration } });
    }).catch(droit);
  }
  function route() {
    if (state.target === 'tour') { tour(); return; }
    var to = state.target ? state[state.target] : null;
    var from = state.driver || (state.target === 'dropoff' ? state.pickup : null);
    if (!from || !to) { if (line) { map.removeLayer(line); line = null; } send({ type: 'route', route: null }); return; }
    var key = state.target + ':' + to.lat + ',' + to.lng;
    var moved = lastRoute.from ? dist(lastRoute.from, from) : Infinity;
    if (key === lastRoute.key && moved < 60 && Date.now() - lastRoute.at < 60000) return;
    lastRoute = { key: key, from: from, at: Date.now() };
    var url = 'https://router.project-osrm.org/route/v1/driving/' + from.lng + ',' + from.lat + ';' + to.lng + ',' + to.lat +
      '?overview=full&geometries=geojson';
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      var best = data && data.routes && data.routes[0];
      if (!best) { straight(from, to); return; }
      if (line) map.removeLayer(line);
      line = L.polyline(best.geometry.coordinates.map(function (c) { return [c[1], c[0]]; }),
        { color: '#EA580C', weight: 6, opacity: 0.85 }).addTo(map);
      send({ type: 'route', route: { distanceM: best.distance, durationS: best.duration } });
    }).catch(function () { straight(from, to); });
  }

  window.maj = function (d) {
    var targetChanged = d.target !== state.target;
    state = d;
    document.body.classList.toggle('dark', !!d.dark);
    place('driver', d.driver); place('pickup', d.pickup); place('dropoff', d.dropoff);
    if (targetChanged) framed = false;
    frame();
    route();
  };
})();
</script>
</body></html>`;
