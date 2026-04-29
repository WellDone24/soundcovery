"use client";

import { useState } from "react";
import Image from "next/image";

type Recommendation = {
  name: string;
  reason: string;
  spotify_url?: string | null;
};

type ApiResponse = {
  recommendations?: Recommendation[];
  error?: string;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<Recommendation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
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

    setError("");
    setResults([]);
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(`${apiUrl}/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ band: query }),
        signal: controller.signal,
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || data.error) {
        setError(data.error ?? "Something went wrong.");
        return;
      }

      setResults(data.recommendations ?? []);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "AbortError"
          ? "This is taking longer than expected. Please try again."
          : "Could not reach the recommendation service."
      );
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: 24 }}>
      <header style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Image
            src="/logo.png"
            alt="Soundcovery"
            width={48}
            height={48}
            style={{ objectFit: "contain" }}
            priority
          />
          <div>
            <h1 style={{ margin: 0, fontSize: 22 }}>
              Your guide to Rock for People 2026
            </h1>
        
          
          </div>
        </div>

        <p style={{ marginTop: 18 }}>
          Enter bands you like. We&apos;ll show you the best matches from the
          Rock for People 2026 lineup.
        </p>
      </header>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !loading) handleSubmit();
        }}
        placeholder="e.g. Bring Me The Horizon; Metallica"
        style={{ width: "100%", padding: 12, marginTop: 8 }}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{ marginTop: 12, padding: "10px 16px" }}
      >
        {loading ? "Finding..." : "Find festival acts"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {results.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 20 }}>Recommended festival acts</h2>

          {results.map((band) => (
            <article
              key={band.name}
              style={{
                marginTop: 16,
                padding: 16,
                border: "1px solid #ddd",
                borderRadius: 12,
              }}
            >
              <strong>{band.name}</strong>
              <p>{band.reason}</p>

              {band.spotify_url && (
                <a
                  href={band.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
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

      <footer style={{ marginTop: 40, fontSize: 13 }}>
        <a href="/impressum">Impressum</a>
      </footer>
    </main>
  );
}