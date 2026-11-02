# DroneComp Manager — Sistema de Gestión de Competencia de Drones y Ranking en Tiempo Real

Aplicación web completa desarrollada con **React 19, TypeScript, Tailwind CSS v4 y Firebase (Authentication, Cloud Firestore y Hosting)** para operar competencias de drones con múltiples pistas simultáneas, desde la acreditación en terreno hasta la proyección del ranking en vivo en pantalla gigante 16:9.

---

## 1. Características Implementadas

- **Tres Perfiles con Control de Acceso Real (UI + Reglas de Firestore):**
  - **Administrador (`admin`):** Configura eventos independientes, pruebas, pistas y reglas; importa/edita participantes por CSV; gestiona usuarios del staff; corrige o anula resultados publicados con motivo; autoriza repeticiones extraordinarias y excepciones; aplica o levanta Descalificación General (`DQ`); resuelve empates persistentes; cierra/reabre pruebas y exporta resultados.
  - **Staff (`staff`):** Busca y acredita participantes; actualiza el turno en pista; registra borradores y publica resultados nuevos. No puede modificar reglas ni sobrescribir resultados publicados.
  - **Pantalla Pública (`16:9`):** No requiere inicio de sesión (`?vista=ranking`). Consume exclusivamente las colecciones proyectadas públicas (`public_participants` y `public_results`), sin acceso a observaciones internas (`internalNotes`) ni controles administrativos.
- **Motor de Puntuación Exacto (Precisión en Milisegundos Enteros):**
  - **Método A (Puntaje Manual — *Habilidades y Obstáculos* 33,33 pts / *Destreza* 33,34 pts):**
    $$\text{puntaje\_neto} = \max(0, \text{puntaje\_bruto} - \text{penalización\_puntos})$$
    $$\text{aporte} = \left(\frac{\text{puntaje\_neto}}{\text{puntaje\_base\_máximo}}\right) \times \text{aporte\_máximo}$$
  - **Método B (Calculado por Tiempo — *Velocidad* 33,33 pts):**
    $$\text{tiempo\_efectivo} = \text{tiempo\_registrado} + \text{penalización\_segundos}$$
    $$\text{puntaje\_base} = \text{puntaje\_base\_máximo} \times \left(\frac{\text{mejor\_tiempo\_efectivo\_válido}}{\text{tiempo\_efectivo}}\right)$$
    $$\text{puntaje\_neto} = \max(0, \text{puntaje\_base} - \text{penalización\_puntos})$$
    $$\text{aporte} = \left(\frac{\text{puntaje\_neto}}{\text{puntaje\_base\_máximo}}\right) \times \text{aporte\_máximo}$$
  - **Recálculo Consistente:** Al publicar, corregir o anular un resultado que cambie el mejor tiempo válido de referencia en una prueba por tiempo, se recalculan automáticamente todos los aportes de esa prueba.
- **Concurrencia para 4 Operadores Simultáneos y Modo Sin Conexión:**
  - Control de concurrencia optimista mediante transacciones (`runTransaction`) y número de versión incremental (`version`) en cada resultado (`${participantId}__${testId}`).
  - Borradores locales aislados estrictamente por `userUid` y `eventId` en `localStorage`.
  - Confirmación real del servidor antes de mostrar estado `PUBLICADO` y resolución explícita de conflictos al reconectar.

---

## 2. Requisitos e Instalación Local

```bash
# 1. Instalar dependencias
npm install

# 2. Ejecutar suite de pruebas automatizadas (Vitest)
npm test

# 3. Iniciar servidor de desarrollo
npm run dev

# 4. Compilar versión de producción
npm run build
```

---

## 3. Configuración de Firebase y Publicación

### 3.1Variables de Entorno (`.env.local`)

Copie el archivo `.env.example` a `.env.local` y complete las credenciales reales de su proyecto Firebase:

```env
VITE_FIREBASE_API_KEY=su_api_key
VITE_FIREBASE_AUTH_DOMAIN=su_proyecto.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=su_proyecto_id
VITE_FIREBASE_STORAGE_BUCKET=su_proyecto.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:abcdef
VITE_FIREBASE_DATABASE_ID=(default)
VITE_USE_FIREBASE_EMULATOR=false
```

> **Modo Demostración Local Transparente:** Si no se definen credenciales en `.env.local`, la aplicación inicia automáticamente en **Modo Demostración Local Claramente Identificado**, precargado con **35 participantes ficticios, 4 pistas operativas y las 3 pruebas oficiales**, sincronizando pestañas simultáneas mediante `BroadcastChannel`.

### 3.2 Despliegue de Reglas de Seguridad (`firestore.rules`) y Hosting

```bash
# Iniciar sesión en Firebase CLI
npx firebase-tools login

# Seleccionar proyecto Firebase
npx firebase-tools use <SU_PROJECT_ID>

# Desplegar reglas de seguridad e índices de Cloud Firestore
npx firebase-tools deploy --only firestore:rules,firestore:indexes

# Compilar y publicar en Firebase Hosting
npm run build
npx firebase-tools deploy --only hosting
```

### 3.3 Despliegue en Vercel

```bash
npx vercel --prod
```

---

## 4. Lista Explícita de Configuraciones Externas Pendientes para Producción con Firebase Real

Para pasar del Modo Demostración Local a un entorno productivo conectado a Firebase en la nube, el administrador del proyecto debe realizar estas configuraciones externas en [Firebase Console](https://console.firebase.google.com/):

1. **Crear un proyecto en Firebase Console** y registrar una aplicación Web para obtener las variables `VITE_FIREBASE_*`.
2. **Habilitar Firebase Authentication:** Activar el proveedor **Correo electrónico/Contraseña (Email/Password)** y crear las cuentas para el Administrador y los 4 operadores de Staff.
3. **Habilitar Cloud Firestore:** Crear la base de datos `(default)` en modo producción y desplegar el archivo [`firestore.rules`](./firestore.rules) incluido en este repositorio.
4. **Crear documentos de rol en la colección `/users/{uid}`:** Para cada usuario creado en Firebase Auth, registrar su documento en `/users/{uid}` con `{ role: "admin" | "staff", active: true, email: "...", displayName: "..." }`.
5. **Configurar Variables de Entorno en Vercel / Hosting:** Cargar las variables `VITE_FIREBASE_*` en el panel de Environment Variables de Vercel o en `.env.production` antes de compilar.
