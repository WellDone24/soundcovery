export default function About() {
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
          marginBottom: 8,
        }}
      >
        About soundcovery
      </h1>

      <p>
        Most music recommendation systems are heavily influenced by popularity
        and listening bubbles.
      </p>

      <p>
        soundcovery explores a different idea: helping people discover artists
        based on what they love, not simply on what everyone else is listening
        to.
      </p>

      <p>The project was inspired by a simple question:</p>

      <p>
        <em>"How did I miss that band?"</em>
      </p>

      <p>
        Festival lineups are full of artists that many visitors never get
        around to discovering. Years later, you sometimes look back and wonder
        how you missed a band you would go on to love — especially when they
        were still playing the smallest stages and some of the hungriest shows
        of their career. soundcovery tries to make those discoveries happen a
        little earlier.
      </p>

      <p>
        Recommendations are generated from available artist information and
        similarity signals. This means they are not perfect, especially for
        artists with very limited public information.
      </p>

      <p>
        At the same time, lesser-known artists are not automatically ranked
        lower simply because they have fewer listeners, followers or streams.
      </p>

      <p>
        Sometimes that leads to unexpected recommendations.
      </p>

      <p>
        Hopefully, some of them become great discoveries for you.
      </p>
    </main>
  );
}