// firebase-config.js — ÚNICO punto de configuración de la infraestructura Firebase.
// Entorno nuevo: proyecto Firebase "contabilidadmeapp".
// GitHub Pages: https://controlgestionlc.github.io/contabilidadme/
//
// Nota: esta configuración Web de Firebase identifica el proyecto cliente; no
// contiene una clave privada de Service Account. La seguridad efectiva queda
// en Firebase Authentication + firestore.rules.
const FIREBASE_CONFIG={
  apiKey:"AIzaSyCX_Rkw9aZnMNUB6nI-uweQeUvMU7aDDzg",
  authDomain:"contabilidadmeapp.firebaseapp.com",
  projectId:"contabilidadmeapp",
  storageBucket:"contabilidadmeapp.firebasestorage.app",
  messagingSenderId:"346917993666",
  appId:"1:346917993666:web:eab89cdb2f809d5c2f0f5b"
};

const FIREBASE_ENV={
  nombre:'contabilidadmeapp',
  schemaVersion:4,
  migrado:true,
  sitio:'https://controlgestionlc.github.io/contabilidadme/'
};

export {FIREBASE_CONFIG,FIREBASE_ENV};
