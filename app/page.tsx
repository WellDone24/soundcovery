import Link from "next/link";
import Recommender from "./components/Recommender";

type HomeProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstString(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Home({ searchParams }: HomeProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const initialFestivalSlug =
    firstString(resolvedSearchParams.festival) ??
    firstString(resolvedSearchParams.lineup) ??
    null;

  return (
    <main className="site-shell">
      <header className="site-header">
        <Link href="/" className="wordmark" aria-label="Soundcovery home">
          soundcovery
        </Link>

        <nav className="site-nav" aria-label="Primary">
          <a href="#recommender">Recommender</a>
          <a href="#reports">Artist reports</a>
          <a href="#festival">Festival / API</a>
        </nav>
      </header>

      <section className="hero">
        <p className="eyebrow">Music discovery, built around similarity</p>
        <h1>Find the artists you should not miss.</h1>
        <p className="hero-copy">
          Soundcovery matches the music you already care about with artists
          worth discovering — across festival lineups and beyond.
        </p>
        <a className="hero-link" href="#recommender">
          Try the recommender
        </a>
      </section>

      <Recommender initialFestivalSlug={initialFestivalSlug} />

      <section className="product-section" id="reports">
        <div className="section-number">02</div>
        <div className="section-copy">
          <p className="eyebrow">Artist analysis / reports</p>
          <h2>A clearer picture of where an artist sits.</h2>
          <p>
            Structured artist analysis for teams that need more than genre
            labels or audience metrics. Reports map musical character,
            positioning and relevant peers in a format that can support A&amp;R,
            strategy, partnerships and artist development.
          </p>

          <div className="report-points">
            <span>Similarity profile</span>
            <span>Comparable artists</span>
            <span>Positioning signals</span>
            <span>Updateable snapshots</span>
          </div>

          <div className="pricing-grid" aria-label="Working pricing">
            <div>
              <strong>€35</strong>
              <span>Snapshot</span>
            </div>
            <div>
              <strong>€99</strong>
              <span>Snapshot + 2 updates</span>
            </div>
            <div>
              <strong>€399</strong>
              <span>5 artists</span>
            </div>
            <div>
              <strong>from €599</strong>
              <span>10 artists</span>
            </div>
          </div>

          <p className="small-print">
            Working pilot pricing. Batch scopes can be tailored.
          </p>

          <a className="secondary-link" href="mailto:info@soundcovery.com?subject=Artist%20report">
            Ask about a report
          </a>
        </div>
      </section>

      <section className="product-section" id="festival">
        <div className="section-number">03</div>
        <div className="section-copy">
          <p className="eyebrow">Festival / API integration</p>
          <h2>Discovery can live inside the festival experience.</h2>
          <p>
            Festival-specific recommender views can be linked directly from QR
            codes, programme pages or partner integrations. The lineup becomes
            the search space; the visitor starts with artists they already
            know.
          </p>

          <div className="integration-example">
            <span>QR / programme</span>
            <span aria-hidden="true">→</span>
            <span>festival view</span>
            <span aria-hidden="true">→</span>
            <span>personal recommendations</span>
          </div>

          <p>
            For deeper integrations, the same recommendation layer can be
            exposed through an API or adapted to a festival's own interface.
          </p>

          <a className="secondary-link" href="mailto:info@soundcovery.com?subject=Festival%20integration">
            Discuss a festival integration
          </a>
        </div>
      </section>

      <section className="principle-section">
        <p className="eyebrow">Why Soundcovery</p>
        <blockquote>
          Popularity is useful context. It should not decide what deserves to
          be discovered.
        </blockquote>
        <p>
          Soundcovery is built to surface musically relevant connections,
          including artists that are easy to miss because they are smaller,
          newer or outside an established listening bubble.
        </p>
        <Link href="/about" className="secondary-link">
          How it works
        </Link>
      </section>

      <footer className="site-footer">
        <span>Soundcovery</span>
        <div>
          <a href="mailto:info@soundcovery.com">info@soundcovery.com</a>
          <Link href="/about">About</Link>
          <Link href="/imprint">Imprint</Link>
        </div>
      </footer>
    </main>
  );
}
