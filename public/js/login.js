function login() {

  const user = document.getElementById("user").value;
  const pass = document.getElementById("pass").value;

  fetch("/api/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ user, pass })
  })
  .then(res => res.json())
  .then(data => {

    if (data.ok) {

      // 🔐 AQUÍ VA (guardar usuario en navegador)
      localStorage.setItem("usuario", JSON.stringify(data.user));

      alert("Bienvenido " + data.user.nombre);

      // 👉 redirección profesional
      window.location.href = "/dashboard";

    } else {
      alert("Error: " + data.message);
    }

  })
  .catch(err => {
    console.error(err);
    alert("Error conectando con el servidor");
  });
}

// Google Sign-In: inicializar el botón oficial de Google cuando la librería y la configuración estén listas.
let googleClientId = '';
let googleInitialized = false;

function setGoogleStatus(text, type = 'muted') {
  const status = document.getElementById('googleStatus');
  if (!status) return;
  status.textContent = text;
  status.className = `text-${type} small mb-4`;
}

function decodeJwtResponse(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const base64Padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  const jsonPayload = decodeURIComponent(atob(base64Padded).split('').map(function(c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));
  return JSON.parse(jsonPayload);
}

function handleGoogleCredentialResponse(response) {
  if (!response || !response.credential) {
    setGoogleStatus('Google no devolvió una credencial. Intenta nuevamente.', 'danger');
    return;
  }

  try {
    const payload = decodeJwtResponse(response.credential);
    handleGoogleAuthData({
      google_id: payload.sub,
      email: payload.email,
      nombre: payload.name,
      avatar: payload.picture
    });
  } catch (error) {
    console.error('No se pudo procesar la respuesta de Google:', error);
    setGoogleStatus('No se pudo procesar la respuesta de Google.', 'danger');
  }
}

async function initGoogleSignIn() {
  const container = document.getElementById('googleSignInButton');
  if (!container) return;

  try {
    // La librería GIS puede cargarse de forma asíncrona; esperar sin bloquear el formulario normal.
    const started = Date.now();
    while (!(window.google && window.google.accounts && window.google.accounts.id)) {
      if (Date.now() - started > 10000) {
        throw new Error('Google Identity Services no se cargó a tiempo');
      }
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const response = await fetch('/api/google/config', { cache: 'no-store' });
    if (!response.ok) throw new Error('No se pudo obtener la configuración de Google');
    const config = await response.json();

    if (!config.ok || !config.clientId) {
      setGoogleStatus('Acceso con Google no configurado. Revisa GOOGLE_CLIENT_ID.', 'warning');
      return;
    }

    googleClientId = config.clientId;
    google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });

    google.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: Math.min(Math.floor(container.getBoundingClientRect().width || 340), 360)
    });

    googleInitialized = true;
    setGoogleStatus(''); 
  } catch (error) {
    console.error('Error inicializando Google Sign-In:', error);
    setGoogleStatus('No se pudo cargar Google. Puedes ingresar con usuario y contraseña.', 'warning');
  }
}

window.loginWithGoogle = function() {
  // Compatibilidad con llamadas antiguas: el usuario debe pulsar el botón oficial renderizado por Google.
  if (!googleInitialized) setGoogleStatus('Google todavía se está preparando. Intenta nuevamente en unos segundos.', 'warning');
};

async function handleGoogleAuthData(googleUser) {
  try {
    const loginResponse = await fetch("/api/auth/google", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(googleUser)
    });

    const data = await loginResponse.json();

    if (data.ok) {
      localStorage.setItem("usuario", JSON.stringify(data.user));
      alert("Bienvenido " + data.user.nombre);
      window.location.href = "/dashboard";
    } else {
      alert("Error: " + data.message);
    }
  } catch (error) {
    console.error("Error en autenticación con Google:", error);
    alert("Error conectando con Google. Inténtalo de nuevo.");
  } finally {
    // El botón oficial de Google gestiona su propio estado; no requiere restauración manual.
  }
}


document.addEventListener('DOMContentLoaded', initGoogleSignIn);