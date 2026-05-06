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