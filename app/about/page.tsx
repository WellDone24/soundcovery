import Link from "next/link";

export default function About() {
  return (
    <main className="text-page">
      <header className="text-page-header">
        <Link href="/" className="wordmark">
          soundcovery
        </Link>
        <Link href="/" className="secondary-link compact-link">
          Back to recommender
        </Link>
      </header>

      <article className="text-article">
        <p className="eyebrow">About Soundcovery</p>
        <h1>Music discovery without popularity as the default answer.</h1>

        <p className="lead">
          Soundcovery started with a simple question: how do you find the artist
          you would love before everyone already knows them?
        </p>

        <h2>The problem</h2>
        <p>
          Most recommendation systems are influenced by what is already popular,
          what similar listeners already play, or what has enough behavioural
          data to be easy to recommend. Those signals can be useful, but they
          also reinforce existing listening bubbles.
        </p>

        <h2>The approach</h2>
        <p>
          Soundcovery builds structured profiles of artists and compares them
          across multiple musical and aesthetic dimensions. The goal is not to
          reduce an artist to one genre label. It is to identify meaningful
          neighbours: artists that share enough musical character to be worth
          hearing, including smaller or less obvious names.
        </p>

        <p>
          The current festival recommender applies that approach to a finite
          lineup. You enter artists you already like; Soundcovery looks for the
          strongest relevant connections among the acts you could actually see.
        </p>

        <h2>What it is not</h2>
        <p>
          Soundcovery is not a popularity chart with a conversational interface,
          and it is not an attempt to make generated text the product. Models
          and automation can help create and maintain the underlying structured
          data, but the product is the discovery and analysis layer built on top
          of it.
        </p>

        <h2>Where this goes</h2>
        <p>
          The same underlying artist profiles can support festival discovery,
          artist analysis, comparable-artist research and integrations for teams
          that need a richer view of musical positioning.
        </p>

        <div className="text-page-contact">
          <p>
            Festival partnerships, artist reports or feedback:
            {" "}
            <a href="mailto:info@soundcovery.com">info@soundcovery.com</a>
          </p>
        </div>
      </article>
    </main>
  );
}
