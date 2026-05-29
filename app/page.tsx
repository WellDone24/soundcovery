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
  match_quality?: string | null;
  spotify_url?: string | null;
  timetable?: Timetable | null;
};

type InputArtistMatch = {
  input: string;
  matched_name?: string | null;
  score?: number | null;
  used_fuzzy?: boolean;
};

type ApiResponse = {
  recommendations?: Recommendation[];
  input_artist_matches?: InputArtistMatch[];
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
  if (!error) return "Could not load recommendations right now.";

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

function getMatchedArtistLabel(
  matches: InputArtistMatch[],
  fallback: string,
): string {
  const names = matches
    .map((match) => match.matched_name || match.input)
    .filter(Boolean);

  if (names.length === 0) return fallback;

  return names.join(", ");
}

function getMatchBadge(matchQuality?: string | null): string {
  if (matchQuality === "strong") return "🟢 Strong match";
  if (matchQuality === "decent") return "🟡 Worth a try";
  return "🔵 Discovery pick";
}

export default function Home() {
  const [input, setInput] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [results, setResults] = useState<Recommendation[]>([]);
  const [matchedArtists, setMatchedArtists] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLElement | null>(null);
  const trackingContextRef = useRef<TrackingContext | null>(null);
  const scrollAfterSearchRef = useRef(false);

  useEffect(() => {
    const context = getTrackingContext();
    trackingContextRef.current = context;
    track("page_view", context);
  }, []);

  useEffect(() => {
    if (
      scrollAfterSearchRef.current &&
      !loading &&
      hasSearched &&
      !error
    ) {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      scrollAfterSearchRef.current = false;
    }
  }, [loading, hasSearched, error]);

  async function runSearch(filter: TimeFilter, shouldScroll = false) {
    scrollAfterSearchRef.current = shouldScroll;
    inputRef.current?.blur();

    const query = input.trim();

    if (!query) {
      setError("Start with an artist you like.");
      setResults([]);
      setMatchedArtists("");
      setHasSearched(false);
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl) {
      setError("API URL is not configured.");
      setResults([]);
      setMatchedArtists("");
      setHasSearched(false);
      return;
    }

    const trackingContext = trackingContextRef.current ?? getTrackingContext();
    const now = getClientNowIso();

    setError("");
    setLoading(true);
    setLastQuery(query);
    setHasSearched(true);

    await track("search_submitted", {
      band: query,
      time_filter: filter,
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
          time_filter: filter,
          now,
        }),
        signal: controller.signal,
      });

      const data: ApiResponse = await response.json();

      if (!response.ok || data.error) {
        const rawMessage = data.error ?? "Something went wrong.";
        const userMessage = getUserFacingErrorMessage(rawMessage);

        setError(userMessage);
        setResults([]);

        await track("search_failed", {
          band: query,
          time_filter: filter,
          now,
          error: rawMessage,
          user_error: userMessage,
          ...trackingContext,
        });

        return;
      }

      const recommendations = data.recommendations ?? [];
      const matchedArtistLabel = getMatchedArtistLabel(
        data.input_artist_matches ?? [],
        query,
      );

      setMatchedArtists(matchedArtistLabel);
      setResults(recommendations);

      await track("recommendations_shown", {
        band: query,
        matched_artists: matchedArtistLabel,
        time_filter: filter,
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
      setResults([]);

      await track("search_failed", {
        band: query,
        time_filter: filter,
        now,
        error: message,
        ...trackingContext,
      });
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  async function handleSubmit() {
    await runSearch(timeFilter, true);
  }

  function handleTimeFilterChange(nextFilter: TimeFilter) {
    setTimeFilter(nextFilter);

    if (hasSearched && !loading) {
      runSearch(nextFilter, false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "12px 24px 24px",
      }}
    >
      <header style={{ textAlign: "center", marginBottom: 18 }}>
        <Image
          src="/HeroLogoSVG.svg"
          alt="Soundcovery"
          width={285}
          height={143}
          style={{
            objectFit: "contain",
            margin: "0 auto",
          }}
          priority
        />

        <h1 style={{ marginTop: 4, fontSize: 22 }}>
          find the acts you shouldn’t miss
        </h1>

        <p style={{ marginTop: 4, opacity: 0.7 }}>
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
              onClick={() => handleTimeFilterChange(option.value)}
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

      {hasSearched && !error && (
        <section ref={resultsRef} style={{ marginTop: 28 }}>
          <h2 style={{ margin: 0, fontSize: 21, lineHeight: 1.2 }}>
            Recommended for you
          </h2>

          <p
            style={{
              margin: "6px 0 0",
              opacity: 0.85,
              fontSize: 16,
              lineHeight: 1.3,
            }}
          >
            based on{" "}
            <strong style={{ color: "#fff", opacity: 1 }}>
              {matchedArtists || lastQuery}
            </strong>
          </p>

          {!loading && results.length === 0 && (
            <p style={{ marginTop: 18, opacity: 0.75 }}>
              {getEmptyMessage(timeFilter)}
            </p>
          )}

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
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 13,
                  fontWeight: 700,
                  opacity: 0.9,
                }}
              >
                {getMatchBadge(band.match_quality)}
              </p>

              <strong
                style={{
                  display: "block",
                  fontSize: 18,
                  lineHeight: 1.2,
                  marginBottom: 6,
                }}
              >
                {band.name}
              </strong>

              {band.timetable?.start_time && (
                <p
                  style={{
                    marginTop: 0,
                    marginBottom: 10,
                    fontSize: 14,
                    opacity: 0.75,
                  }}
                >
                  {band.timetable.weekday && (
                    <strong style={{ opacity: 0.95 }}>
                      {band.timetable.weekday} ·{" "}
                    </strong>
                  )}
                  {band.timetable.start_time.slice(0, 5)}
                  {band.timetable.end_time &&
                    `–${band.timetable.end_time.slice(0, 5)}`}
                  {band.timetable.stage && ` · ${band.timetable.stage}`}
                </p>
              )}

              <p style={{ marginTop: 0 }}>
                {band.reason}
              </p>

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
                      match_quality: band.match_quality,
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
                  ▶ Listen on Spotify
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