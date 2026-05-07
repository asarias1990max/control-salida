# Configuración de Google OAuth

## Pasos para configurar Google Sign-In

### 1. Crear proyecto en Google Cloud Console

1. Ve a [Google Cloud Console](https://console.cloud.google.com/)
2. Crea un nuevo proyecto o selecciona uno existente
3. Habilita la Google+ API (si no está habilitada)

### 2. Configurar OAuth 2.0

1. Ve a "APIs y servicios" > "Credenciales"
2. Haz clic en "Crear credenciales" > "ID de cliente de OAuth"
3. Selecciona "Aplicación web"
4. Agrega los siguientes orígenes autorizados:
   - `http://localhost:3000` (para desarrollo)
   - Tu dominio de producción
5. Agrega los siguientes URI de redireccionamiento autorizados:
   - `http://localhost:3000` (para desarrollo)
   - Tu dominio de producción

### 3. Obtener credenciales

1. Copia el "ID de cliente" (Client ID)
2. Copia el "Secreto de cliente" (Client Secret) - aunque no se usa en el frontend

### 4. Configurar variables de entorno

Edita el archivo `.env` y agrega:

```
GOOGLE_CLIENT_ID=tu_client_id_aqui
GOOGLE_CLIENT_SECRET=tu_client_secret_aqui
```

### 5. Agregar dominio autorizado

En Google Cloud Console, ve a "APIs y servicios" > "Credenciales" > Tu cliente OAuth > "Editar"

En la sección "Restricciones", agrega tu dominio en "Dominios autorizados" si es necesario.

### 6. Probar

1. Reinicia el servidor
2. Ve a la página de login
3. Haz clic en "Iniciar con Google"
4. Selecciona una cuenta de Google

## Notas importantes

- Los usuarios nuevos que inicien sesión con Google recibirán automáticamente todos los permisos disponibles
- Los usuarios existentes pueden seguir usando el login tradicional
- Los usuarios de Google se identifican por su `google_id` único
- Se recomienda configurar restricciones de dominio en Google Cloud Console para mayor seguridad