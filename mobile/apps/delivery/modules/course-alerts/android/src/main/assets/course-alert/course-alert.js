/* The page has no account, credentials or native JavaScript bridge. */
(function () {
  'use strict';
  var current = null;
  var map = null;
  var layers = [];
  var routeRequest = null;
  var routeLine = null;
  var busy = false;
  var card = document.getElementById('card');
  function el(id) { return document.getElementById(id); }
  function label(id, value) { el(id).textContent = value; }
  function status(value) { label('map-status', value); el('map-status').hidden = !value; }
  function point(p) { return p && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180; }
  function action(name) {
    if (busy || !current) return;
    if (name !== 'close' && Date.now() >= current.expiresAtMs) name = 'close';
    busy = true;
    el('accept').disabled = true;
    el('decline').disabled = true;
    window.location.href = 'zupeat-course-alert://' + name;
  }
  el('accept').onclick = function () { action('accepter'); };
  el('decline').onclick = function () { action('refuser'); };
  el('close').onclick = function () { action('close'); };

  function stop(name, address, type) {
    var item = document.createElement('div'); item.className = 'stop ' + type;
    var title = document.createElement('p'); title.className = 'stop-name'; title.textContent = name;
    var subtitle = document.createElement('p'); subtitle.className = 'stop-address'; subtitle.textContent = address;
    item.appendChild(title); item.appendChild(subtitle); el('stops').appendChild(item);
  }
  function ll(p) { return [p.lat, p.lng]; }
  function fit(points) {
    if (!map || !points.length) return;
    var covered = Math.min(card.offsetHeight + 42, window.innerHeight - 130);
    var options = { paddingTopLeft: [38, 92], paddingBottomRight: [38, covered], maxZoom: 16 };
    map.fitBounds(points.map(ll), options);
  }
  function marker(p, type) {
    var shape = type === 'pickup' ? '<path d="M3 8h18M5 8v12h14V8M3 8l2-5h14l2 5M9 20v-7h6v7"/>' : '<path d="M3 11l9-8 9 8M5 10v11h14V10M9 21v-8h6v8"/>';
    var icon = L.divIcon({ className: '', html: '<span class="pin ' + type + '"><svg viewBox="0 0 24 24">' + shape + '</svg></span>', iconSize: [32, 32], iconAnchor: [16, 16] });
    layers.push(L.marker(ll(p), { icon: icon, keyboard: false }).addTo(map));
  }
  function showMap(data) {
    if (typeof L === 'undefined') { status('Carte indisponible · vous pouvez répondre à la course'); return; }
    if (!map) {
      map = L.map('map', { zoomControl: false, attributionControl: true }).setView([46.6, 2.4], 5);
      map.attributionControl.setPrefix(false);
      map.attributionControl.setPosition('topright');
      var tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      tiles.on('tileerror', function () { status('Fond de carte indisponible · les repères restent affichés'); });
    }
    layers.forEach(function (layer) { map.removeLayer(layer); }); layers = [];
    if (routeLine) { map.removeLayer(routeLine); routeLine = null; }
    if (routeRequest) routeRequest.abort();
    var pickups = (data.pickups || []).map(function (s) { return s.point; }).filter(point);
    var dropoffs = (data.dropoffs || []).map(function (s) { return s.point; }).filter(point);
    var points = pickups.concat(dropoffs);
    pickups.forEach(function (p) { marker(p, 'pickup'); }); dropoffs.forEach(function (p) { marker(p, 'dropoff'); });
    if (!points.length) { status('Position du trajet indisponible'); return; }
    status('');
    requestAnimationFrame(function () { map.invalidateSize(); fit(points); });
    if (points.length < 2) return;
    // Immediate overview; a road route replaces it when the network answers.
    routeLine = L.polyline(points.map(ll), { color: '#eceef1', weight: 5, opacity: .8, dashArray: '7 8' }).addTo(map);
    var controller = new AbortController(); routeRequest = controller;
    var timer = setTimeout(function () { controller.abort(); }, 4500);
    var url = 'https://router.project-osrm.org/route/v1/driving/' + points.map(function (p) { return p.lng + ',' + p.lat; }).join(';') + '?overview=full&geometries=geojson';
    fetch(url, { signal: controller.signal }).then(function (response) { return response.json(); }).then(function (body) {
      if (routeRequest !== controller) return;
      var best = body.routes && body.routes[0];
      if (!best || !best.geometry || !Array.isArray(best.geometry.coordinates)) return;
      var coordinates = best.geometry.coordinates.filter(function (c) { return Array.isArray(c) && point({ lat: c[1], lng: c[0] }); }).map(function (c) { return [c[1], c[0]]; });
      if (coordinates.length < 2) return;
      map.removeLayer(routeLine);
      routeLine = L.polyline(coordinates, { color: '#eceef1', weight: 6, opacity: .9 }).addTo(map);
    }).catch(function () { /* The immediate route and the offer stay usable. */ }).finally(function () { clearTimeout(timer); });
  }

  window.showOffer = function (data) {
    current = data; busy = false;
    el('accept').disabled = false; el('decline').disabled = false; el('error').hidden = true;
    var count = Math.max(1, data.count || 1);
    label('tag', data.bientotLibre ? 'Course à enchaîner' : data.ajout ? 'Course sur votre trajet' : count > 1 ? 'Livraison groupée' : 'Nouvelle course');
    el('demo').hidden = !data.demo;
    label('amount', Number(data.payout || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €');
    label('guaranteed', (count > 1 ? 'Montant garanti · ' + count + ' courses' : 'Montant garanti') + (data.horsLimite ? ' · Plus longue que votre limite habituelle' : ''));
    var km = data.totalKm;
    label('journey', Number.isFinite(km) && km >= 0 ? '≈ ' + Math.max(1, Math.round(km * 3)) + ' min · ' + km.toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' km' : 'Distance à confirmer');
    var pickups = data.pickups && data.pickups.length ? data.pickups : [{ name: data.pickupStore || 'Commerce', address: data.pickupCity || 'Retrait au commerce' }];
    var dropoffs = data.dropoffs && data.dropoffs.length ? data.dropoffs : [{ address: data.deliveryCity || 'Adresse à l’acceptation' }];
    el('stops').replaceChildren();
    pickups.forEach(function (s) { stop(s.name || 'Commerce', s.address || 'Retrait au commerce', 'pickup'); });
    dropoffs.forEach(function (s, i) { stop(dropoffs.length > 1 ? 'Livraison ' + (i + 1) : 'Livraison', s.address || 'Adresse à l’acceptation', 'dropoff'); });
    label('stop-count', (pickups.length + dropoffs.length) + ' arrêts');
    label('accept-label', count > 1 ? 'Accepter les ' + count + ' courses' : 'Accepter');
    window.updateCountdown(Date.now());
    showMap(data);
  };
  window.updateCountdown = function (now) {
    if (!current) return;
    var left = Math.max(0, current.expiresAtMs - now);
    var duration = Math.max(1, current.expiresAtMs - (current.createdAtMs || now));
    label('countdown', '· ' + Math.ceil(left / 1000) + ' s');
    el('progress').style.transform = 'scaleX(' + Math.min(1, left / duration) + ')';
    el('accept').setAttribute('aria-label', el('accept-label').textContent + ', ' + Math.ceil(left / 1000) + ' secondes restantes');
    if (left <= 0) { el('accept').disabled = true; el('decline').disabled = true; }
  };
  window.showError = function () {
    busy = false; el('accept').disabled = false; el('decline').disabled = false;
    label('error', 'Réponse impossible. Ouvrez la notification pour réessayer.'); el('error').hidden = false;
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(function () {
    if (!current) return;
    var points = (current.pickups || []).concat(current.dropoffs || []).map(function (s) { return s.point; }).filter(point);
    fit(points);
  }).observe(card);
})();
