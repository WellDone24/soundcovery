"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { track } from "@/lib/tracking";

type Timetable = {
  festival?: string | null;
  day?: string | null;
  weekday?: string | null;
  date?: string | null;
  stage?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  artist_url?: string | null;
  source_artist_name?: string | null;
  matched_artist_name?: string | null;
  match_status?: string | null;
};

type Recommendation = {
  name: string;
  reason: string;
  spotify_url?: string | null;
  timetable?: Timetable | null;
};

type ApiResponse = {
  recommendations?: Recommendation[];
  error?: string;
};

type TrackingContext = {
  traffic_source: string;
  utm_source: string | null;
  path: string;
  search: string;
  referrer: string | null;
};

function getTrackingContext(): TrackingContext {
  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source");

  return {
    traffic_source: utmSource ?? "organic",
    utm_source: utmSource,
    path: window.location.pathname,
    search: window.location.search,
    referrer: document.referrer || null,
  };
}

export default function Home() {
  const [input, setInput] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [results, setResults] = useState<Recommendation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const trackingContextRef = useRef<TrackingContext | null>(null);

  useEffect(() => {
    const context = getTrackingContext();
    trackingContextRef.current = context;

    track("page_view", context);
  }, []);

  async function handleSubmit() {
    inputRef.current?.blur();

    const query = input.trim();

    if (!query) {
      setError("Please enter a band.");
      setResults([]);
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl) {
      setError("API URL is not configured.");
      setResults([]);
      return;
    }

    const trackingContext =
      trackingContextRef.current ?? getTrackingContext();

    setError("");
    setResults([]);
    setLoading(true);
    setLastQuery(query);

    await track("search_submitted", {
      band: query,
      ...trackingContext,
    });

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`${apiUrl}/recommend`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ band: query }),
        signal: controller.signal,
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || data.error) {
        const message = data.error ?? "Something went wrong.";

        setError(message);

        await track("search_failed", {
          band: query,
          error: message,
          ...trackingContext,
        });

        return;
      }

      const recommendations = data.recommendations ?? [];
      setResults(recommendations);

      await track("recommendations_shown", {
        band: query,
        count: recommendations.length,
        ...trackingContext,
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "This is taking longer than expected. Please try again."
          : "Could not reach the recommendation service.";

      setError(message);

      await track("search_failed", {
        band: query,
        error: message,
        ...trackingContext,
      });
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "16px 24px 24px",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: 24 }}>
        <Image
          src="/HeroLogoSVG.svg"
          alt="Soundcovery"
          width={300}
          height={150}
          style={{
            objectFit: "contain",
            margin: "0 auto",
          }}
          priority
        />

        <h1 style={{ marginTop: 10, fontSize: 22 }}>
          find the acts you shouldn’t miss
        </h1>

        <p style={{ marginTop: 6, opacity: 0.7 }}>
          Rock for People 2026
        </p>
      </header>

      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !loading) {
            handleSubmit();
          }
        }}
        placeholder="Try: Bring Me The Horizon, Spiritbox, Sleep Token"
        style={{
          width: "100%",
          padding: "16px 18px",
          borderRadius: 16,
          border: "1px solid #444",
          background: "#111",
          color: "#fff",
          fontSize: 16,
          outline: "none",
          boxSizing: "border-box",
          caretColor: "#fff",
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{
          marginTop: 14,
          width: "100%",
          padding: "15px 18px",
          borderRadius: 16,
          border: "none",
          background: "#fff",
          color: "#000",
          fontSize: 16,
          fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? "Finding..." : "Find festival acts"}
      </button>

      {error && (
        <p style={{ color: "#ff6b6b", marginTop: 12 }}>
          {error}
        </p>
      )}

      {results.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 20 }}>check these out</h2>

          {results.map((band) => (
            <article
              key={band.name}
              style={{
                marginTop: 16,
                padding: 16,
                border: "1px solid #333",
                borderRadius: 16,
                background: "#0f0f0f",
              }}
            >
              <strong>{band.name}</strong>

              <p>{band.reason}</p>

              {band.timetable?.start_time && (
                <p
                  style={{
                    marginTop: 8,
                    fontSize: 14,
                    opacity: 0.75,
                  }}
                >
                  {band.timetable.weekday && `${band.timetable.weekday} · `}
                  {band.timetable.start_time.slice(0, 5)}
                  {band.timetable.end_time &&
                    `–${band.timetable.end_time.slice(0, 5)}`}
                  {band.timetable.stage && ` · ${band.timetable.stage}`}
                </p>
              )}

              {band.spotify_url && (
                <a
                  href={band.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    const trackingContext =
                      trackingContextRef.current ?? getTrackingContext();

                    track("spotify_clicked", {
                      query_band: lastQuery,
                      recommended_band: band.name,
                      ...trackingContext,
                    });
                  }}
                  style={{
                    display: "inline-block",
                    marginTop: 6,
                    padding: "6px 12px",
                    background: "#1DB954",
                    color: "white",
                    borderRadius: 999,
                    textDecoration: "none",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  ▶ Open in Spotify
                </a>
              )}
            </article>
          ))}
        </section>
      )}

      <footer style={{ marginTop: 40, fontSize: 12 }}>
        <a href="/impressum">Impressum</a>
      </footer>
    </main>
  );
}