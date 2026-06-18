export default function About() {
  const paragraphStyle = {
    marginBottom: 24,
  };

  return (
    <main
      style={{
        maxWidth: 760,
        margin: "0 auto",
        padding: "32px 24px 56px",
        lineHeight: 1.6,
      }}
    >
      <h1
        style={{
          fontSize: 32,
          marginBottom: 32,
        }}
      >
        About soundcovery
      </h1>

      <p style={paragraphStyle}>
        Most music recommendation systems are heavily influenced by popularity
        and listening bubbles.
      </p>

      <p style={paragraphStyle}>
        soundcovery explores a different idea: helping people discover artists
        based on what they love, not simply on what everyone else is listening
        to.
      </p>

      <p style={paragraphStyle}>
        The project was inspired by a simple question:
      </p>

      <p
        style={{
          fontStyle: "italic",
          marginBottom: 32,
        }}
      >
        "How did I miss that band?"
      </p>

      <p style={paragraphStyle}>
        Festival lineups are full of artists that many visitors never get
        around to discovering. Years later, you sometimes look back and wonder
        how you missed a band you would go on to love — especially when they
        were still playing the smallest stages and some of the hungriest shows
        of their career. soundcovery tries to make those discoveries happen a
        little earlier.
      </p>

      <p style={paragraphStyle}>
        Recommendations are generated from available artist information and
        similarity signals. This means they are not perfect, especially for
        artists with very limited public information.
      </p>

      <p style={paragraphStyle}>
        At the same time, lesser-known artists are not automatically ranked
        lower simply because they have fewer listeners, followers or streams.
      </p>

      <p style={paragraphStyle}>
        Sometimes that leads to unexpected recommendations.
      </p>

      <p style={paragraphStyle}>
        Hopefully, some of them become great discoveries for you.
      </p>

      <div
        style={{
          marginTop: 40,
          paddingTop: 24,
          borderTop: "1px solid rgba(255, 255, 255, 0.15)",
        }}
      >
        <p style={{ margin: 0 }}>
          For festival partnerships, feedback or other enquiries, contact{" "}
          <a
            href="mailto:info@soundcovery.com"
            style={{
              color: "inherit",
              fontWeight: 600,
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            info@soundcovery.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}