/* Firebase setup for multi-teacher cloud sync.
   These keys are NOT secret — they are meant to live in public client code.
   Real protection comes from Google sign-in + Firestore security rules.

   This file initialises Firebase defensively: if the SDK failed to load
   (e.g. the very first visit happened with no internet), the app must keep
   working as a normal offline, device-only tracker. So everything here is
   wrapped so a failure never breaks the rest of the app. */
(function () {
  window.CLOUD = { ready: false, auth: null, user: null };

  if (typeof firebase === "undefined" || !firebase.initializeApp) {
    // SDK not present (offline first load, or the single-file build) — stay local-only.
    return;
  }

  try {
    firebase.initializeApp({
      apiKey: "AIzaSyBbSkSl9KA8k0qjyj2qjQanAJVLJDD_a_k",
      authDomain: "hifz-madrasa.firebaseapp.com",
      projectId: "hifz-madrasa",
      storageBucket: "hifz-madrasa.firebasestorage.app",
      messagingSenderId: "275243672947",
      appId: "1:275243672947:web:787474447ef01457885106"
    });
    window.CLOUD.auth = firebase.auth();
    window.CLOUD.ready = true;
  } catch (e) {
    console.warn("Firebase init skipped:", e && e.message);
  }
})();
