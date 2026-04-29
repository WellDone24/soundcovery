"use client";

import { useState } from "react";

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
        setResults([]);
        return;
      }

      setResults(data.recommendations ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("This is taking longer than expected. Please try again.");
      } else {
        setError("Could not reach the recommendation service.");
      }

      setResults([]);
    } finally {
      window.clearTimeout(timeoutId);
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
          if (e.key === "Enter" && !loading) handleSubmit();
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
    <footer style={{ marginTop: 40, fontSize: 13 }}>
      <a href="/impressum">Impressum</a>
    </footer>
    </main>
  );
}