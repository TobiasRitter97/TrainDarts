import "../shared.css";
import "./PrivacyScreen.css";

// /privacy - erreichbar unabhaengig vom Anmeldezustand (siehe
// App.tsx: die Pfadpruefung liegt VOR dem Login-Gate). Beschreibt nur
// Dienste und Daten, die im Code tatsaechlich vorkommen:
//   - Firebase Authentication (E-Mail/Passwort)
//   - Firebase Firestore (Profile, Spieldaten)
//   - Firebase Realtime Database (nur waehrend einer laufenden
//     Online-Partie, siehe online/roomDb.ts)
//   - Vercel als Hosting
//   - Geraetelokaler Speicher (localStorage) fuer Board-IP, Favoriten,
//     zuletzt genutztes Profil und den vollstaendigen Gast-Modus
// Kein Analytics, kein Tracking, keine weiteren Dienste - siehe
// Zusammenfassung im Gespraech fuer den Code-Befund dahinter.
export function PrivacyScreen() {
  return (
    <div className="privacy-screen">
      <a className="btn-secondary back-btn privacy-back-link" href="/">
        ← Back
      </a>
      <h1 className="screen-title">Privacy Policy</h1>
      <p className="screen-note">
        TrainDarts is a private, free, non-commercial hobby project. This page explains, in plain language, what data
        it processes and why.
      </p>

      <div className="panel privacy-panel">
        <h2 className="section-title">Who is responsible</h2>
        <p>
          Tobias Ritter
          <br />
          Email: <a href="mailto:tobi.ritter@web.de">tobi.ritter@web.de</a>
        </p>
        <p className="privacy-muted">
          Use this address for any question about your data, or to request that your account be deleted.
        </p>
      </div>

      <div className="panel privacy-panel">
        <h2 className="section-title">What data is processed</h2>
        <ul className="privacy-list">
          <li>
            <b>Email address</b> — used to create and secure your account (Firebase Authentication).
          </li>
          <li>
            <b>A technical user ID</b> assigned by Firebase Authentication, used internally to keep your data
            separate from everyone else's.
          </li>
          <li>
            <b>Login and authentication data</b> — your password itself is handled entirely by Firebase
            Authentication; TrainDarts never sees or stores it.
          </li>
          <li>
            <b>Player profiles</b> you create (name, initials, a display color).
          </li>
          <li>
            <b>Training data and match results</b> — the games you play, including individual throws, so that
            "resume game" and your history work.
          </li>
          <li>
            <b>Statistics</b> — these are calculated from your stored matches whenever you open the Statistics tab;
            they are not stored separately.
          </li>
          <li>
            <b>Device-local settings</b> — your dartboard's network address, favourite games, and which profile you
            used last. These stay in your browser's local storage and are never sent to a server.
          </li>
          <li>
            <b>Guest mode</b> — if you play without an account, none of the above leaves your device at all; it is
            kept only in your browser's local storage.
          </li>
        </ul>
      </div>

      <div className="panel privacy-panel">
        <h2 className="section-title">Why it's processed</h2>
        <ul className="privacy-list">
          <li>To provide and secure your user account.</li>
          <li>To log you in and keep you logged in.</li>
          <li>To store your training progress and statistics and make them available on any device you sign in on.</li>
          <li>
            To run a shared online match when you use "Play Online" — the current dart-by-dart state of that match is
            temporarily shared with the other participant(s) you're playing against.
          </li>
        </ul>
      </div>

      <div className="panel privacy-panel">
        <h2 className="section-title">Services this app uses</h2>
        <ul className="privacy-list">
          <li>
            <b>Firebase Authentication</b> (Google) — manages your account and login.
          </li>
          <li>
            <b>Firebase Firestore</b> (Google) — stores your profiles and match data.
          </li>
          <li>
            <b>Firebase Realtime Database</b> (Google) — used only for the "Play Online" feature, to relay the
            current match state between participants while a game is running. The room is deleted once the game ends.
          </li>
          <li>
            <b>Vercel</b> — hosts this web application.
          </li>
        </ul>
        <p className="privacy-muted">
          These providers process technically necessary connection data (such as your IP address) as part of
          delivering their service — this happens automatically with any web request and is not something TrainDarts
          adds on top.
        </p>
      </div>

      <div className="panel privacy-panel">
        <h2 className="section-title">No tracking, no cookie banner</h2>
        <p>
          TrainDarts does not use analytics, advertising, or any marketing tracking — there is nothing here to opt
          out of. Local storage is used exclusively for the technical purposes listed above, which is why there is no
          cookie consent banner.
        </p>
      </div>

      <div className="panel privacy-panel">
        <h2 className="section-title">How long data is kept, and deletion</h2>
        <p>Your data is kept for as long as your account exists.</p>
        <p>
          You can delete your account at any time from the <b>Profiles</b> tab. This permanently removes your
          profiles and match history from Firestore and then deletes your login. If Firebase asks you to sign in
          again first, follow that prompt and try once more — this is a Firebase security requirement, not something
          TrainDarts can skip.
        </p>
        <p>
          If anything doesn't delete the way it should, write to{" "}
          <a href="mailto:tobi.ritter@web.de">tobi.ritter@web.de</a> and it will be removed manually.
        </p>
      </div>

      <div className="panel privacy-panel">
        <h2 className="section-title">Your rights</h2>
        <p>Under the GDPR, you can ask for:</p>
        <ul className="privacy-list">
          <li>access to the data stored about you,</li>
          <li>correction of inaccurate data,</li>
          <li>deletion of your data,</li>
          <li>restriction of processing, and</li>
          <li>a copy of your data in a portable format.</li>
        </ul>
        <p>
          You can also object to processing, and you have the right to complain to a data protection supervisory
          authority. For any of this, contact{" "}
          <a href="mailto:tobi.ritter@web.de">tobi.ritter@web.de</a>.
        </p>
      </div>

      <div className="panel privacy-panel">
        <h2 className="section-title">Data transfers outside the EU/EEA</h2>
        <p>
          Firebase (Google) and Vercel may process data on servers located outside the EU/EEA, including in the
          United States. Where that is the case, these providers rely on standard contractual clauses and/or the
          EU-U.S. Data Privacy Framework as a legal safeguard for that transfer.
        </p>
      </div>

      <p className="screen-note privacy-footnote">This policy may be updated as the app changes. Last updated: September 2026.</p>
    </div>
  );
}
