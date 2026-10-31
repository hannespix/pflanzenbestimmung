/* Pflanzenkenntnis (Pflanze-BW) – Copyright (C) 2026 Hannes Pix · SPDX-License-Identifier: GPL-3.0-or-later
   (vollständiger Hinweis in src/shared.js, Lizenztext in LICENSE) */
/* Service Worker – macht das Werkzeug installierbar (PWA) und offline-fest.
   Der Kern funktioniert ohnehin ohne Netz; dieser Worker legt die Dateien beim
   ersten Besuch in den Cache, sodass Startseite, Lern-Tool, Prüfungswerkzeug und
   Rechtliches auch ohne Verbindung starten – und sich die App zum Home-Bildschirm
   hinzufügen lässt.

   Streng offline-freundlich: Es werden AUSSCHLIESSLICH Anfragen der eigenen Herkunft
   (same-origin) behandelt. Die opt-in Wikipedia-Anreicherung (fremde Herkunft) läuft
   unberührt am Worker vorbei – online lädt sie, offline entfällt sie wie gehabt.

   __SW_VERSION__ wird von build.py durch einen Inhalts-Hash ersetzt; ändert sich
   der Inhalt, wird der Cache automatisch erneuert. */
"use strict";
const VERSION = "/*__SW_VERSION__*/dev";
const CACHE = "pflanzenkenntnis-" + VERSION;
const ASSETS = [
  "index.html",
  "pflanzenkenntnis.html",
  "pruefung/index.html",
  "pflanzen-lernen.html",
  "rechtliches.html",
  "manifest.webmanifest",
  "icon-192.png",
  "icon-512.png",
  "icon-maskable.png",
  "apple-touch-icon.png"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  // Kein .catch: Schlägt das Vorladen auch nur einer Datei fehl (schwache Leitung), scheitert
  // die Installation sauber und der bisherige Cache bleibt bestehen. Mit .catch »gelang« sie
  // trotzdem, »activate« räumte den alten Cache ab – und die App war offline leer (Audit-Fund).
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;   // nur eigene Herkunft – fremde (z. B. Wikipedia) unberührt lassen
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => (req.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
