"use client";

import { useState } from "react";

type Recommendation = {
  name: string;
  reason: string;
  spotify_url?: string | null;
};

export default function Home() {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<Recommendation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!input.trim()) {
      setError("Please enter a band.");
      setResults([]);
      return;
    }

    setError("");
    setLoading(true);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch("http://127.0.0.1:8000/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ band: input }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong.");
        setResults([]);
        return;
      }

      setResults(data.recommendations);
    } catch {
      setError("This is taking longer than expected. Please try again.");
      setResults([]);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h1>Soundcovery</h1>
      <p>Type a band you like. We'll suggest similar artists.</p>

      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
        }}
        placeholder="e.g. Bring Me The Horizon"
        style={{ width: "100%", padding: 10, marginTop: 10 }}
      />

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{ marginTop: 10, padding: "10px 16px" }}
      >
        {loading ? "Finding..." : "Find bands"}
      </button>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {results.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <h3>Recommendations</h3>

          {results.map((band) => (
            <div key={band.name} style={{ marginBottom: 16 }}>
              <strong>{band.name}</strong>
              <p>{band.reason}</p>

              {band.spotify_url && (
                <a
                  href={band.spotify_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: "6px",
                    padding: "6px 12px",
                    background: "#1DB954",
                    color: "white",
                    borderRadius: "999px",
                    textDecoration: "none",
                    fontSize: "13px",
                    fontWeight: 600,
                  }}
                >
                  ▶ Open in Spotify
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}