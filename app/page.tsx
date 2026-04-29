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
        headers: {
          "Content-Type": "application/json",
        },
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
      {/* HEADER */}
      <header style={{ textAlign: "center", marginBottom: 32 }}>
        <Image
          src="/logo.png"
          alt="Soundcovery"
          width={200}
          height={100}
          style={{ objectFit: "contain", margin: "0 auto" }}
          priority
        />

        <h1 style={{ marginTop: 16, fontSize: 22 }}>
          Find the acts you shouldn’t miss
        </h1>

        <p style={{ marginTop: 6, opacity: 0.7 }}>
          Rock for People 2026
        </p>
      </header>

      {/* INPUT */}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !loading) {
            handleSubmit();
          }
        }}
        placeholder="e.g. Bring Me The Horizon; Metallica"
        style={{ width: "100%", padding: 12 }}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{ marginTop: 12, padding: "10px 16px" }}
      >
        {loading ? "Finding..." : "Find festival acts"}
      </button>

      {/* ERROR */}
      {error && <p style={{ color: "red" }}>{error}</p>}

      {/* RESULTS */}
      {results.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 20 }}>
            Recommended festival acts
          </h2>

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

      {/* FOOTER */}
      <footer style={{ marginTop: 40, fontSize: 13 }}>
        <a href="/impressum">Impressum</a>
      </footer>
    </main>
  );
}