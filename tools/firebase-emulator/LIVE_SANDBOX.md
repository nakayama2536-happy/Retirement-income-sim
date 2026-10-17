# Firebase sandbox-only live test

This browser page only targets the separate, user-owned **Spark** Firebase project `lifeplan-sync-sandbox`. It never accesses `lifeplan-private-sync`, user planning values, backups or public GitHub Pages runtime.

Prerequisites: the separate project's Firestore Standard `(default)`, email/password test user, deployed `docs/firebase-sync-sandbox.rules.example` with that TEST user's private UID, and registered `lifeplan-sandbox-web` Web app. Do not paste credentials or UID to public GitHub or ChatGPT.

Run this HTML locally using a Python localhost-only server, `python -m http.server 8766 --bind 127.0.0.1`, then visit `http://127.0.0.1:8766/live-sandbox.html`. Use the test web app's Config (`apiKey`, `authDomain`, `projectId`, `appId`) and test account login **only on the local PC**.

The page does not use realistic financial data or the app's state. It writes a **format-only fictional ciphertext stub** (not proof of AES-GCM roundtrip) to the disposable test document, verifies server read, SDK CAS update and stale writer rejection, and deletes the test document. If cleanup fails, stop and check the document in sandbox Console.

Success indication: 7/7 and confirmed absence of the trial document. Error indication is generic to avoid exposing account details. Signing in is interactive; it cannot be performed from ChatGPT without user access. Real-life sync still requires separate testing before any production release.
