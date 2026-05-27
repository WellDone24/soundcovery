export default function Impressum() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 24px 56px",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Impressum</h1>

      <p style={{ opacity: 0.75, marginBottom: 32 }}>
        Angaben gemäß § 5 DDG
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Anbieter</h2>
        <p>
          Well Done Decisions GmbH
          <br />
          Pestalozzistraße 25
          <br />
          22305 Hamburg
          <br />
          Deutschland
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Vertreten durch</h2>
        <p>Heinrich Burlage</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Kontakt</h2>
        <p>
          E-Mail:{" "}
          <a href="mailto:get.it.well.done@welldonedecisions.com">
            get.it.well.done@welldonedecisions.com
          </a>
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Registereintrag</h2>
        <p>
          Eintragung im Handelsregister
          <br />
          Registergericht: Amtsgericht Hamburg
          <br />
          Registernummer: HRB 185654
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Umsatzsteuer-ID</h2>
        <p>
          Umsatzsteuer-Identifikationsnummer gemäß § 27 a Umsatzsteuergesetz:
          <br />
          DE369011535
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>
          Verantwortlich für den Inhalt
        </h2>
        <p>
          Heinrich Burlage
          <br />
          Anschrift wie oben
        </p>
      </section>

      <hr
        style={{
          border: "none",
          borderTop: "1px solid #333",
          margin: "36px 0",
        }}
      />

      <section>
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>Datenschutzhinweis</h1>

        <p>
          Soundcovery verwendet ein minimales technisches Event-Tracking, um zu
          verstehen, ob der Dienst funktioniert und verbessert werden kann.
        </p>

        <p>
          Dabei können eine zufällig erzeugte Session-ID, die Herkunft des
          Aufrufs, zum Beispiel QR-Code, Instagram oder organischer Aufruf,
          eingegebene Suchanfragen, angezeigte Empfehlungen, Klicks auf
          Spotify-Links sowie Zeitstempel gespeichert werden.
        </p>

        <p>
          Es werden keine Nutzerkonten, Namen, E-Mail-Adressen,
          Zahlungsinformationen oder präzisen Standortdaten erhoben. Es werden
          keine Werbe-Pixel wie Meta Pixel oder Google Analytics eingesetzt und
          die Daten werden nicht verkauft.
        </p>

        <p>
          Die Verarbeitung erfolgt ausschließlich zur technischen Analyse,
          Verbesserung und Bewertung des Produktes. Bei Fragen zum Datenschutz genügt
          eine E-Mail an{" "}
          <a href="mailto:get.it.well.done@welldonedecisions.com">
            get.it.well.done@welldonedecisions.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}