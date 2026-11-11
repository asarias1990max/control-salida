(() => {
  "use strict";

  const INACTIVITY_LIMIT = 15 * 60 * 1000;
  const WARNING_AT = 14 * 60 * 1000;
  const HEARTBEAT_MIN_INTERVAL = 20 * 1000;
  const ACTIVITY_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel", "scroll"];

  let lastActivityAt = Date.now();
  let lastHeartbeatAt = 0;
  let warningVisible = false;
  let expired = false;
  let timerId = null;
  let warningElement = null;
  let warningCountdownId = null;

  const nativeFetch = window.fetch.bind(window);

  function crearAviso() {
    if (warningElement) return warningElement;
    const overlay = document.createElement("div");
    overlay.id = "sessionTimeoutOverlay";
    overlay.style.cssText = "position:fixed;inset:0;z-index:20000;display:none;align-items:center;justify-content:center;padding:20px;background:rgba(10,20,40,.58);backdrop-filter:blur(4px)";
    const panel = document.createElement("section");
    panel.setAttribute("role", "alertdialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "sessionTimeoutTitle");
    panel.style.cssText = "width:min(100%,430px);padding:28px;border-radius:18px;background:#fff;color:#17243b;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.25)";
    const icon = document.createElement("div");
    icon.innerHTML = '<i class="bi bi-clock-history" style="font-size:38px;color:#d97706"></i>';
    const title = document.createElement("h4");
    title.id = "sessionTimeoutTitle";
    title.textContent = "Tu sesión está por expirar";
    title.style.cssText = "font-weight:750;margin:12px 0 8px";
    const message = document.createElement("p");
    message.style.cssText = "color:#64748b;margin-bottom:18px";
    message.textContent = "Llevas 14 minutos sin actividad. Por seguridad, cerraremos tu sesión en:";
    const countdown = document.createElement("div");
    countdown.id = "sessionTimeoutCountdown";
    countdown.style.cssText = "font-size:32px;font-weight:800;color:#b45309;margin-bottom:20px";
    countdown.textContent = "01:00";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-primary px-4";
    button.innerHTML = '<i class="bi bi-check-circle me-2"></i>Continuar trabajando';
    button.addEventListener("click", () => registrarActividad(true));
    panel.append(icon, title, message, countdown, button);
    overlay.append(panel);
    document.body.append(overlay);
    warningElement = overlay;
    return overlay;
  }

  function mostrarAviso() {
    if (warningVisible || expired) return;
    warningVisible = true;
    crearAviso().style.display = "flex";
    actualizarCuentaRegresiva();
    warningCountdownId = window.setInterval(actualizarCuentaRegresiva, 250);
  }

  function ocultarAviso() {
    warningVisible = false;
    if (warningElement) warningElement.style.display = "none";
    if (warningCountdownId) window.clearInterval(warningCountdownId);
    warningCountdownId = null;
  }

  function actualizarCuentaRegresiva() {
    const restante = Math.max(0, INACTIVITY_LIMIT - (Date.now() - lastActivityAt));
    const segundos = Math.ceil(restante / 1000);
    const display = document.getElementById("sessionTimeoutCountdown");
    if (display) display.textContent = String(Math.floor(segundos / 60)).padStart(2, "0") + ":" + String(segundos % 60).padStart(2, "0");
    if (restante <= 0) void cerrarPorInactividad();
  }

  async function registrarActividad(forzar = false) {
    if (expired) return;
    lastActivityAt = Date.now();
    ocultarAviso();
    programarTemporizador();
    const ahora = Date.now();
    if (!forzar && ahora - lastHeartbeatAt < HEARTBEAT_MIN_INTERVAL) return;
    lastHeartbeatAt = ahora;
    try {
      const response = await nativeFetch("/api/auth/activity", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: "{}"
      });
      if (response.status === 401) await cerrarPorInactividad(false);
    } catch (error) {
      console.error("No se pudo renovar la sesión:", error);
    }
  }

  function programarTemporizador() {
    if (timerId) window.clearTimeout(timerId);
    const transcurrido = Date.now() - lastActivityAt;
    const siguiente = transcurrido < WARNING_AT ? WARNING_AT - transcurrido : INACTIVITY_LIMIT - transcurrido;
    timerId = window.setTimeout(() => {
      const inactivo = Date.now() - lastActivityAt;
      if (inactivo >= INACTIVITY_LIMIT) void cerrarPorInactividad();
      else if (inactivo >= WARNING_AT) {
        mostrarAviso();
        programarTemporizador();
      } else programarTemporizador();
    }, Math.max(50, siguiente));
  }

  async function cerrarPorInactividad(notificar = true) {
    if (expired) return;
    expired = true;
    if (timerId) window.clearTimeout(timerId);
    if (warningCountdownId) window.clearInterval(warningCountdownId);
    ocultarAviso();
    try {
      await nativeFetch("/api/auth/logout", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" }, body: "{}", keepalive: true
      });
    } catch (error) {
      console.warn("La sesión ya no estaba disponible en el servidor:", error);
    }
    localStorage.removeItem("usuario");
    if (notificar) sessionStorage.setItem("sessionExpiredNotice", "1");
    window.location.replace("/");
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    if (response.status === 401 && !expired) {
      try {
        const body = await response.clone().json();
        if (body?.code === "SESSION_EXPIRED") void cerrarPorInactividad(true);
      } catch (_) {}
    }
    return response;
  };

  ACTIVITY_EVENTS.forEach(eventName => {
    document.addEventListener(eventName, () => registrarActividad(false), { passive: true });
  });
  document.addEventListener("mousemove", () => registrarActividad(false), { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      const inactivo = Date.now() - lastActivityAt;
      if (inactivo >= INACTIVITY_LIMIT) void cerrarPorInactividad();
      else if (inactivo >= WARNING_AT) mostrarAviso();
    }
  });

  if (sessionStorage.getItem("sessionExpiredNotice") === "1") {
    sessionStorage.removeItem("sessionExpiredNotice");
    window.setTimeout(() => alert("Tu sesión se cerró por 15 minutos de inactividad. Ingresa nuevamente."), 150);
  }
  programarTemporizador();
})();