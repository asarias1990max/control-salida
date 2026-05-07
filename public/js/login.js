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

// Google Sign-In
let googleClientId = '';

async function waitForGoogleAccounts(timeout = 5000) {
  const step = 100;
  let elapsed = 0;

  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        clearInterval(timer);
        resolve();
        return;
      }

      elapsed += step;
      if (elapsed >= timeout) {
        clearInterval(timer);
        reject(new Error('Google Identity Services no se cargó a tiempo'));
      }
    }, step);
  });
}

async function initGoogleSignIn() {
  try {
    await waitForGoogleAccounts();

    const response = await fetch('/api/google/config');
    const config = await response.json();

    if (config.ok && config.clientId) {
      googleClientId = config.clientId;

      google.accounts.id.initialize({
        client_id: googleClientId,
        callback: handleGoogleCredentialResponse
      });

      google.accounts.id.disableAutoSelect();
      setGoogleStatus('Google Sign-In listo.');
    } else {
      console.warn('Google Client ID no configurado');
      setGoogleStatus('Google Sign-In no configurado. Revisa GOOGLE_CLIENT_ID en .env.');
    }
  } catch (error) {
    console.error('Error inicializando Google Sign-In:', error);
    setGoogleStatus('Error cargando Google Sign-In. Revisa la consola del navegador.');
  }
}

function setGoogleStatus(text, type = 'muted') {
  const status = document.getElementById('googleStatus');
  if (!status) return;
  status.textContent = text;
  status.className = `text-${type} small mb-4`;
}

function handleGoogleCredentialResponse(response) {
  if (!response || !response.credential) {
    console.error('Respuesta de Google inválida', response);
    return;
  }

  const responsePayload = decodeJwtResponse(response.credential);

  handleGoogleAuthData({
    google_id: responsePayload.sub,
    email: responsePayload.email,
    nombre: responsePayload.name,
    avatar: responsePayload.picture
  });
}

function decodeJwtResponse(token) {
  const base64Url = token.split('.')[1];
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
    return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
  }).join(''));

  return JSON.parse(jsonPayload);
}

function loginWithGoogle() {
  const btn = document.getElementById("googleBtn");
  const originalText = btn ? btn.innerHTML : 'Iniciar con Google';

  if (!googleClientId || !window.google || !window.google.accounts || !window.google.accounts.id) {
    alert('Google Sign-In no está listo. Recarga la página e inténtalo de nuevo.');
    if (btn) btn.innerHTML = originalText;
    if (btn) btn.disabled = false;
    return;
  }

  if (btn) {
    btn.innerHTML = '<i class="bi bi-hourglass-split me-2"></i> Conectando...';
    btn.disabled = true;
  }

  try {
    google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        if (btn) {
          btn.innerHTML = originalText;
          btn.disabled = false;
        }
      }
    });
  } catch (error) {
    console.error('Error iniciando Google Sign-In:', error);
    setGoogleStatus('Error iniciando Google Sign-In. Revisa el client_id y el origen.');
    alert('Error conectando con Google. Revisa la consola del navegador y la configuración de Google Cloud.');
    if (btn) {
      btn.innerHTML = originalText;
      btn.disabled = false;
    }
  }
}

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
    const btn = document.getElementById("googleBtn");
    if (btn) {
      btn.innerHTML = '<i class="bi bi-google me-2"></i> Iniciar con Google';
      btn.disabled = false;
    }
  }
}

window.loginWithGoogle = loginWithGoogle;

document.addEventListener('DOMContentLoaded', initGoogleSignIn);