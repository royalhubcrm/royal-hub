// Guarda as telas do sistema para abrir rápido e aguentar oscilação de rede.
// Dados (API) nunca ficam guardados: sempre busca do servidor.
const CACHE = "royal-hub-v1";
const BASICO = ["/", "/index.html", "/app.js", "/styles.css", "/login.html",
                "/icones/icone-192.png", "/icones/icone-512.png", "/manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICO)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ns) => Promise.all(ns.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/")) return;          // dados sempre do servidor

  // fotos e ícones: usa o guardado quando houver
  if (url.pathname.startsWith("/fotos/") || url.pathname.startsWith("/icones/")) {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request).then((resp) => {
      const copia = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia));
      return resp;
    })));
    return;
  }

  // telas: tenta a rede, cai no guardado se estiver sem sinal
  e.respondWith(
    fetch(e.request).then((resp) => {
      const copia = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copia));
      return resp;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});
