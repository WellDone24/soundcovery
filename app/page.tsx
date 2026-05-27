"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { track } from "@/lib/tracking";

type TimeFilter = "upcoming" | "all" | "today";

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

const TIME_FILTER_OPTIONS: { value: TimeFilter; label: string }[] = [
  { value: "upcoming", label: "Still to play" },
  { value: "all", label: "All days" },
  { value: "today", label: "Today" },
];

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

function getClientNowIso(): string {
  return new Date().toISOString();
}

function getResultsHeadline(timeFilter: TimeFilter): string {
  if (timeFilter === "upcoming") return "still to play";
  if (timeFilter === "today") return "playing today";
  return "check these out";
}

function getEmptyMessage(timeFilter: TimeFilter): string {
  if (timeFilter === "upcoming") {
    return "No strong matches still to play. Try all days.";
  }

  if (timeFilter === "today") {
    return "No strong matches today. Try still to play.";
  }

  return "Couldn’t find good matches for that search.";
}

function getUserFacingErrorMessage(error?: string): string {
  if (!error) {
    return "Could not load recommendations right now.";
  }

  const normalized = error.toLowerCase();

  if (
    normalized.includes("input artist not found") ||
    normalized.includes("not found in saem data")
  ) {
    return "That artist is not in the current dataset yet.";
  }

  if (
    normalized.includes("input artist is ambiguous") ||
    normalized.includes("ambiguous")
  ) {
    return "Multiple artists matched that name. Try a more specific search.";
  }

  if (
    normalized.includes("no input artists provided") ||
    normalized.includes("band is required")
  ) {
    return "Start with an artist you like.";
  }

  if (
    normalized.includes("no candidates with saem vectors") ||
    normalized.includes("no saem data") ||
    normalized.includes("artist_axis_vectors") ||
    normalized.includes("mbid")
  ) {
    return "No recommendations available right now.";
  }

  return "Could not load recommendations right now.";
}

export default function Home() {
  const [input, setInput] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [results, setResults] = useState<Recommendation[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [hasSearched, setHasSearched] = useState(false);

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
      setError("Start with an artist you like.");
      setResults([]);
      setHasSearched(false);
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl) {
      setError("API URL is not configured.");
      setResults([]);
      setHasSearched(false);
      return;
    }

    const trackingContext =
      trackingContextRef.current ?? getTrackingContext();

    const now = getClientNowIso();

    setError("");
    setResults([]);
    setLoading(true);
    setLastQuery(query);
    setHasSearched(true);

    await track("search_submitted", {
      band: query,
      time_filter: timeFilter,
      now,
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
        body: JSON.stringify({
          band: query,
          time_filter: timeFilter,
          now,
        }),
        signal: controller.signal,
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || data.error) {
        const rawMessage = data.error ?? "Something went wrong.";
        const userMessage = getUserFacingErrorMessage(rawMessage);

        setError(userMessage);

        await track("search_failed", {
          band: query,
          time_filter: timeFilter,
          now,
          error: rawMessage,
          user_error: userMessage,
          ...trackingContext,
        });

        return;
      }

      const recommendations = data.recommendations ?? [];
      setResults(recommendations);

      await track("recommendations_shown", {
        band: query,
        time_filter: timeFilter,
        now,
        count: recommendations.length,
        ...trackingContext,
      });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "This is taking a bit longer than expected."
          : "Could not load recommendations right now.";

      setError(message);

      await track("search_failed", {
        band: query,
        time_filter: timeFilter,
        now,
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

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 12,
          overflowX: "auto",
          paddingBottom: 2,
        }}
      >
        {TIME_FILTER_OPTIONS.map((option) => {
          const active = timeFilter === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTimeFilter(option.value)}
              disabled={loading}
              style={{
                flex: "0 0 auto",
                padding: "9px 13px",
                borderRadius: 999,
                border: active ? "1px solid #fff" : "1px solid #333",
                background: active ? "#fff" : "#111",
                color: active ? "#000" : "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

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

      {!loading && hasSearched && !error && results.length === 0 && (
        <p style={{ marginTop: 18, opacity: 0.75 }}>
          {getEmptyMessage(timeFilter)}
        </p>
      )}

      {results.length > 0 && (
        <section style={{ marginTop: 28 }}>
          <h2 style={{ fontSize: 20 }}>
            {getResultsHeadline(timeFilter)}
          </h2>

          {results.map((band) => (
            <article
              key={`${band.name}-${band.timetable?.date ?? ""}-${band.timetable?.start_time ?? ""}`}
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
                      time_filter: timeFilter,
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
        <a href="/imprint">Imprint</a>
      </footer>
    </main>
  );
}