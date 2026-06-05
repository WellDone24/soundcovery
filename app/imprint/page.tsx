export default function imprint() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 24px 56px",
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>
        Legal Notice / Imprint
      </h1>

      <p style={{ opacity: 0.75, marginBottom: 32 }}>
        Information pursuant to Section 5 DDG (German Digital Services Act)
      </p>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Provider</h2>

        <p>
          Well Done Decisions GmbH
          <br />
          Pestalozzistraße 25
          <br />
          22305 Hamburg
          <br />
          Germany
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>
          Represented by
        </h2>

        <p>Heinrich Burlage</p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>Contact</h2>

        <p>
          Email:{" "}
          <a href="mailto:get.it.well.done@welldonedecisions.com">
            get.it.well.done@welldonedecisions.com
          </a>
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>
          Commercial Register
        </h2>

        <p>
          Registered in the Commercial Register
          <br />
          Register Court: Local Court Hamburg
          <br />
          Registration Number: HRB 185654
        </p>
      </section>

      <section style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>VAT ID</h2>

        <p>
          VAT identification number pursuant to Section 27a German VAT Act:
          <br />
          DE369011535
        </p>
      </section>

      <section style={{ marginBottom: 40 }}>
        <h2 style={{ fontSize: 20, marginBottom: 8 }}>
          Responsible for Content
        </h2>

        <p>
          Heinrich Burlage
          <br />
          Address as stated above
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
        <h1 style={{ fontSize: 28, marginBottom: 8 }}>
          Privacy Notice
        </h1>

        <p>
          Soundcovery uses minimal technical event tracking in order to
          understand how the service is used and how it can be improved.
        </p>

        <p>
          This may include a randomly generated session ID, the traffic source
          of the visit such as QR code, Instagram or organic access, submitted
          search queries, displayed recommendations, Spotify link clicks and
          timestamps.
        </p>

        <p>
          No user accounts, names, email addresses, payment information or
          precise location data are collected. No advertising pixels such as
          Meta Pixel or Google Analytics are used and no data is sold.
        </p>

        <p>
          The processing is carried out solely for technical analysis,
          improvement and evaluation of the product. If you have any questions
          regarding privacy or data processing, please contact{" "}
          <a href="mailto:get.it.well.done@welldonedecisions.com">
            get.it.well.done@welldonedecisions.com
          </a>
          .
        </p>
      </section>
    </main>
  );
}