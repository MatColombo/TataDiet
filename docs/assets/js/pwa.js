(() => {
  "use strict";

  const VERSION = document.body?.dataset.version || "5.2.1";
  const root = document.body?.dataset.root || "";
  const rootUrl = new URL(root || "./", window.location.href);
  const supportsSW = "serviceWorker" in navigator;
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const reloadFlag = "diet-plan:pwa-reloading";
  if (sessionStorage.getItem(reloadFlag) === "1") {
    window.setTimeout(() => sessionStorage.removeItem(reloadFlag), 1500);
  }
  let deferredPrompt = null;
  let registration = null;

  const $all = (selector) => [...document.querySelectorAll(selector)];
  const show = (element, visible = true) => { if (element) element.hidden = !visible; };
  const icon = (name) => `<svg class="ui-icon" aria-hidden="true"><use href="${root}assets/icons.svg#icon-${name}"></use></svg>`;
  const formatBytes = (bytes) => {
    const value = Number(bytes || 0);
    if (!value) return "0 MB";
    if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
    return `${(value / 1024 / 1024).toFixed(value < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  };

  function setNetworkState() {
    const online = navigator.onLine;
    $all("[data-network-status]").forEach((element) => {
      element.classList.toggle("is-offline", !online);
      element.classList.toggle("is-online", online);
      element.innerHTML = `${icon(online ? "wifi" : "wifi-off")}<span>${online ? "Online" : "Offline"}</span>`;
      element.setAttribute("aria-label", online ? "Connessione disponibile" : "Modalità offline");
    });
    const banner = document.querySelector("[data-offline-banner]");
    show(banner, !online);
  }

  function setInstallState() {
    const canPrompt = Boolean(deferredPrompt) && !isStandalone;
    $all("[data-pwa-install]").forEach((button) => {
      show(button, canPrompt || (isIOS && !isStandalone));
      button.dataset.installMode = canPrompt ? "prompt" : (isIOS && !isStandalone ? "ios" : "none");
    });
    $all("[data-pwa-installed]").forEach((element) => show(element, isStandalone));
    $all("[data-pwa-ios-help]").forEach((element) => show(element, isIOS && !isStandalone && !deferredPrompt));
  }

  async function requestInstall(button) {
    if (button?.dataset.installMode === "ios") {
      document.querySelector("[data-pwa-ios-help]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => null);
    deferredPrompt = null;
    setInstallState();
  }

  function updateBanner(worker) {
    const banner = document.querySelector("[data-update-banner]");
    if (!banner || !worker) return;
    show(banner, true);
    banner.querySelector("[data-update-now]")?.addEventListener("click", () => worker.postMessage({ type: "SKIP_WAITING" }), { once: true });
    banner.querySelector("[data-update-dismiss]")?.addEventListener("click", () => show(banner, false), { once: true });
  }

  function watchRegistration(reg) {
    if (reg.waiting) updateBanner(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) updateBanner(worker);
      });
    });
  }

  async function activeWorker() {
    if (!supportsSW) return null;
    registration ||= await navigator.serviceWorker.ready.catch(() => null);
    return navigator.serviceWorker.controller || registration?.active || registration?.waiting || null;
  }

  async function send(message) {
    const worker = await activeWorker();
    if (!worker) throw new Error("Service worker non ancora disponibile");
    worker.postMessage(message);
  }

  function setPackProgress(payload) {
    const progress = document.querySelector("[data-offline-progress]");
    const bar = document.querySelector("[data-offline-progress-bar]");
    const label = document.querySelector("[data-offline-progress-label]");
    if (!progress || !bar || !label) return;
    const total = Math.max(1, Number(payload.total || 0));
    const done = Number(payload.done || 0);
    const percent = Math.min(100, Math.round((done / total) * 100));
    show(progress, payload.state !== "complete" || payload.failed > 0);
    bar.style.setProperty("--progress", `${percent}%`);
    bar.setAttribute("aria-valuenow", String(percent));
    label.textContent = payload.state === "complete"
      ? `Libreria offline pronta: ${done - Number(payload.failed || 0)} risorse memorizzate${payload.failed ? `, ${payload.failed} non disponibili` : ""}.`
      : `Download offline ${percent}% · ${done}/${payload.total} risorse`;
    if (payload.state === "complete") {
      document.querySelector("[data-offline-pack-status]")?.classList.add("is-ready");
      setTimeout(() => show(progress, false), 3500);
      requestCacheStatus();
    }
  }

  function renderCacheStatus(status) {
    const host = document.querySelector("[data-offline-pack-status]");
    if (!host) return;
    const ready = Number(status?.pack || 0) > 0;
    host.classList.toggle("is-ready", ready);
    host.innerHTML = `${icon(ready ? "check" : "cloud-download")}<div><strong>${ready ? "Libreria offline disponibile" : "Solo funzioni essenziali offline"}</strong><span>${Number(status?.total || 0)} risorse in cache${ready ? ` · ${Number(status.pack)} nella libreria completa` : ""}</span></div>`;
  }

  async function requestCacheStatus() {
    if (!supportsSW) return;
    try { await send({ type: "GET_CACHE_STATUS" }); } catch { /* primo caricamento */ }
  }

  function bindTools() {
    const download = document.querySelector("[data-download-offline-pack]");
    const clear = document.querySelector("[data-clear-offline-pack]");
    download?.addEventListener("click", async () => {
      download.disabled = true;
      download.dataset.originalLabel ||= download.textContent.trim();
      download.textContent = "Preparazione download…";
      try {
        await send({ type: "DOWNLOAD_OFFLINE_PACK" });
      } catch (error) {
        download.disabled = false;
        download.textContent = download.dataset.originalLabel;
        const label = document.querySelector("[data-offline-progress-label]");
        if (label) label.textContent = error.message;
      }
    });
    clear?.addEventListener("click", async () => {
      if (!window.confirm("Rimuovere la libreria offline e le pagine memorizzate durante la navigazione?")) return;
      try { await send({ type: "CLEAR_OFFLINE_PACK" }); }
      catch (error) { window.alert(error.message); }
    });

    fetch(new URL(`${root}data/offline-assets.json`, location.href))
      .then((response) => response.ok ? response.json() : null)
      .then((manifest) => {
        if (!manifest) return;
        $all("[data-offline-pack-size]").forEach((element) => { element.textContent = formatBytes(manifest.total_bytes); });
        $all("[data-offline-pack-count]").forEach((element) => { element.textContent = String(manifest.assets?.length || 0); });
      }).catch(() => null);
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredPrompt = event;
    setInstallState();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    setInstallState();
  });
  window.addEventListener("online", setNetworkState);
  window.addEventListener("offline", setNetworkState);
  $all("[data-pwa-install]").forEach((button) => button.addEventListener("click", () => requestInstall(button)));

  if (supportsSW) {
    const swUrl = new URL(`service-worker.js?v=${encodeURIComponent(VERSION)}`, rootUrl);
    navigator.serviceWorker.register(swUrl, { scope: rootUrl.pathname })
      .then((reg) => {
        registration = reg;
        watchRegistration(reg);
        requestCacheStatus();
      })
      .catch((error) => console.warn("PWA non registrata", error));

    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem(reloadFlag) === "1") return;
      sessionStorage.setItem(reloadFlag, "1");
      location.reload();
    });
    navigator.serviceWorker.addEventListener("message", (event) => {
      const data = event.data || {};
      if (data.type === "OFFLINE_PACK_PROGRESS") {
        setPackProgress(data);
        if (data.state === "complete") {
          $all("[data-download-offline-pack]").forEach((button) => {
            button.disabled = false;
            button.textContent = "Aggiorna libreria offline";
          });
        }
      }
      if (data.type === "CACHE_STATUS") renderCacheStatus(data.status);
      if (data.type === "OFFLINE_PACK_CLEARED") {
        renderCacheStatus({ total: 0, pack: 0 });
        $all("[data-download-offline-pack]").forEach((button) => {
          button.disabled = false;
          button.textContent = "Scarica libreria offline";
        });
      }
    });
  } else {
    $all("[data-pwa-unsupported]").forEach((element) => show(element, true));
  }

  setNetworkState();
  setInstallState();
  bindTools();

  window.DietPWA = { requestInstall, requestCacheStatus, send, isStandalone, isIOS };
})();
