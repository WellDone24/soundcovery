"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { track } from "@/lib/tracking";

type TimeFilter = "upcoming" | "all" | "today";

type Festival = {
  festival_slug: string;
  display_name: string;
  set_name?: string;
  set_version?: string;
  is_default?: boolean;
  sort_order?: number;
  starts_on?: string | null;
  ends_on?: string | null;
  has_timetable?: boolean;
};

type FestivalsResponse = {
  festivals?: Festival[];
  default_festival_slug?: string | null;
  error?: string;
};

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
  multi_support_artists?: string[];
  multi_support_count?: number;
  multi_support_bonus?: number;
};

type InputArtistMatch = {
  input: string;
  matched_name?: string | null;
  score?: number | null;
  used_fuzzy?: boolean;
};

type ApiResponse = {
  festival?: Festival;
  recommendations?: Recommendation[];
  input_artist_matches?: InputArtistMatch[];
  found_artists?: string[];
  not_found_artists?: string[];
  recommendation_basis?: string;
  error?: string;
  time_filter_applied?: boolean;
  effective_time_filter?: string;
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

function getFestivalBySlug(
  festivals: Festival[],
  slug?: string | null,
): Festival | null {
  if (!slug) return null;
  return festivals.find((festival) => festival.festival_slug === slug) ?? null;
}

function getEmptyMessage(
  timeFilter: TimeFilter,
  selectedFestival?: Festival | null,
): string {
  if (selectedFestival?.has_timetable === false) {
    return "Couldn’t find good matches for that lineup.";
  }

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
    normalized.includes("not found in saem data") ||
    normalized.includes("none of the input artists were found") ||
    normalized.includes("current dataset") ||
    normalized.includes("python exited with code 1")
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
    normalized.includes("unknown or inactive festival") ||
    normalized.includes("unknown festival")
  ) {
    return "That festival is not available right now.";
  }

  if (
    normalized.includes("no input artists provided") ||
    normalized.includes("band is required")
  ) {
    return "Start with an artist you like.";
  }

  if (
    normalized.includes("no candidates with saem vectors") ||
    normalized.includes("no candidate artists found") ||
    normalized.includes("no saem data") ||
    normalized.includes("artist_axis_vectors") ||
    normalized.includes("mbid")
  ) {
    return "No recommendations available right now.";
  }

  return "Could not load recommendations right now.";
}

async function readApiJson<T>(response: Response): Promise<T> {
  const responseText = await response.text();

  if (!responseText.trim()) {
    throw new Error(`Empty API response. HTTP ${response.status}`);
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(
      `Invalid API response. HTTP ${response.status}: ${responseText.slice(0, 300)}`,
    );
  }
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
  const [notFoundArtists, setNotFoundArtists] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("upcoming");
  const [hasSearched, setHasSearched] = useState(false);

  const [festivals, setFestivals] = useState<Festival[]>([]);
  const [selectedFestivalSlug, setSelectedFestivalSlug] = useState<string | null>(null);
  const [festivalLoading, setFestivalLoading] = useState(true);
  const [festivalError, setFestivalError] = useState("");
  const [showFestivalSwitch, setShowFestivalSwitch] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement | null>(null);
  const trackingContextRef = useRef<TrackingContext | null>(null);
  const scrollAfterSearchRef = useRef(false);

  const selectedFestival = getFestivalBySlug(festivals, selectedFestivalSlug);
  const selectedFestivalHasTimetable = selectedFestival?.has_timetable !== false;

  useEffect(() => {
    const context = getTrackingContext();
    trackingContextRef.current = context;
    track("page_view", context);
  }, []);

  useEffect(() => {
    async function loadFestivals() {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;

      if (!apiUrl) {
        setFestivalError("API URL is not configured.");
        setFestivalLoading(false);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/festivals`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await readApiJson<FestivalsResponse>(response);

        if (!response.ok || data.error) {
          throw new Error(data.error ?? "Could not load festivals.");
        }

        const loadedFestivals = data.festivals ?? [];

        setFestivals(loadedFestivals);

        const defaultSlug =
          data.default_festival_slug ??
          loadedFestivals.find((festival) => festival.is_default)?.festival_slug ??
          loadedFestivals[0]?.festival_slug ??
          null;

        setSelectedFestivalSlug(defaultSlug);

        if (!defaultSlug) {
          setFestivalError("No festival available right now.");
        }
      } catch (err) {
        setFestivalError(
          err instanceof Error ? err.message : "Could not load festivals.",
        );
      } finally {
        setFestivalLoading(false);
      }
    }

    loadFestivals();
  }, []);

  useEffect(() => {
    if (
      scrollAfterSearchRef.current &&
      !loading &&
      hasSearched &&
      !error
    ) {
      filterRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });

      scrollAfterSearchRef.current = false;
    }
  }, [loading, hasSearched, error]);

  async function runSearch(
    filter: TimeFilter,
    shouldScroll = false,
    festivalSlugOverride?: string,
  ) {
    scrollAfterSearchRef.current = shouldScroll;
    inputRef.current?.blur();

    const query = input.trim();

    if (!query) {
      setError("Start with an artist you like.");
      setResults([]);
      setMatchedArtists("");
      setNotFoundArtists([]);
      setHasSearched(false);
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;

    if (!apiUrl) {
      setError("API URL is not configured.");
      setResults([]);
      setMatchedArtists("");
      setNotFoundArtists([]);
      setHasSearched(false);
      return;
    }

    const festivalSlug = festivalSlugOverride ?? selectedFestivalSlug;
    const festival = getFestivalBySlug(festivals, festivalSlug);

    if (!festivalSlug) {
      setError("No festival selected.");
      setResults([]);
      setMatchedArtists("");
      setNotFoundArtists([]);
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
      festival_slug: festivalSlug,
      festival_name: festival?.display_name ?? null,
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
          festival: festivalSlug,
          time_filter: filter,
          now,
        }),
        signal: controller.signal,
      });

      const data = await readApiJson<ApiResponse>(response);

      if (!response.ok || data.error) {
        const rawMessage = data.error ?? "Something went wrong.";
        const userMessage = getUserFacingErrorMessage(rawMessage);

        setError(userMessage);
        setResults([]);
        setNotFoundArtists([]);

        await track("search_failed", {
          band: query,
          festival_slug: festivalSlug,
          festival_name: festival?.display_name ?? null,
          time_filter: filter,
          now,
          error: rawMessage,
          user_error: userMessage,
          ...trackingContext,
        });

        return;
      }

      const recommendations = data.recommendations ?? [];
      const matchedArtistLabel =
        data.recommendation_basis ||
        getMatchedArtistLabel(data.input_artist_matches ?? [], query);

      setMatchedArtists(matchedArtistLabel);
      setNotFoundArtists(data.not_found_artists ?? []);
      setResults(recommendations);

      await track("recommendations_shown", {
        band: query,
        matched_artists: matchedArtistLabel,
        found_artists: data.found_artists ?? [],
        not_found_artists: data.not_found_artists ?? [],
        festival_slug: festivalSlug,
        festival_name:
          data.festival?.display_name ??
          festival?.display_name ??
          null,
        time_filter: filter,
        effective_time_filter: data.effective_time_filter ?? null,
        time_filter_applied: data.time_filter_applied ?? null,
        now,
        count: recommendations.length,
        ...trackingContext,
      });
    } catch (err) {
      const rawMessage =
        err instanceof Error ? err.message : "Unknown recommendation error";

      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "This is taking a bit longer than expected."
          : getUserFacingErrorMessage(rawMessage);

      setError(message);
      setResults([]);
      setNotFoundArtists([]);

      await track("search_failed", {
        band: query,
        festival_slug: festivalSlug,
        festival_name: festival?.display_name ?? null,
        time_filter: filter,
        now,
        error: rawMessage,
        user_error: message,
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
      runSearch(nextFilter, true);
    }
  }

  function handleFestivalChange(nextSlug: string) {
    if (nextSlug === selectedFestivalSlug) {
      setShowFestivalSwitch(false);
      return;
    }

    const previousSlug = selectedFestivalSlug;
    const nextFestival = getFestivalBySlug(festivals, nextSlug);

    setSelectedFestivalSlug(nextSlug);
    setShowFestivalSwitch(false);

    const trackingContext = trackingContextRef.current ?? getTrackingContext();

    track("festival_changed", {
      previous_festival_slug: previousSlug,
      next_festival_slug: nextSlug,
      next_festival_name: nextFestival?.display_name ?? null,
      ...trackingContext,
    });

    if (hasSearched && !loading) {
      runSearch(timeFilter, true, nextSlug);
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

        <div style={{ marginTop: 8 }}>
          <p style={{ margin: 0, opacity: 0.7 }}>
            {festivalLoading
              ? "Loading festivals..."
              : selectedFestival?.display_name ?? "No festival selected"}
          </p>

          {selectedFestival?.has_timetable === false && (
            <p style={{ margin: "4px 0 0", opacity: 0.55, fontSize: 13 }}>
              Lineup mode · timetable not available yet
            </p>
          )}

          {festivalError && (
            <p style={{ margin: "6px 0 0", color: "#ff6b6b", fontSize: 13 }}>
              {festivalError}
            </p>
          )}

          {festivals.length > 1 && (
            <button
              type="button"
              onClick={() => setShowFestivalSwitch((value) => !value)}
              disabled={loading || festivalLoading}
              style={{
                marginTop: 8,
                padding: "7px 11px",
                borderRadius: 999,
                border: "1px solid #333",
                background: "#111",
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                cursor: loading || festivalLoading ? "not-allowed" : "pointer",
                opacity: loading || festivalLoading ? 0.7 : 1,
              }}
            >
              Switch festival
            </button>
          )}

          {showFestivalSwitch && festivals.length > 1 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 8,
                marginTop: 10,
              }}
            >
              {festivals.map((festival) => {
                const active =
                  festival.festival_slug === selectedFestivalSlug;

                return (
                  <button
                    key={festival.festival_slug}
                    type="button"
                    onClick={() => handleFestivalChange(festival.festival_slug)}
                    disabled={loading}
                    style={{
                      padding: "8px 12px",
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
                    {festival.display_name}
                    {festival.has_timetable === false ? " · lineup" : ""}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </header>

      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !loading && !festivalLoading) {
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
        disabled={loading || festivalLoading || !selectedFestivalSlug}
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
          cursor:
            loading || festivalLoading || !selectedFestivalSlug
              ? "not-allowed"
              : "pointer",
          opacity: loading || festivalLoading || !selectedFestivalSlug ? 0.7 : 1,
        }}
      >
        {loading ? "Finding..." : "Find festival acts"}
      </button>

      {selectedFestivalHasTimetable && (
        <div
          ref={filterRef}
          style={{
            display: "flex",
            gap: 8,
            marginTop: 14,
            overflowX: "auto",
            paddingBottom: 2,
            scrollMarginTop: 12,
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
      )}

      {!selectedFestivalHasTimetable && (
        <div
          ref={filterRef}
          style={{
            marginTop: 14,
            padding: "10px 12px",
            border: "1px solid #333",
            borderRadius: 14,
            background: "#0f0f0f",
            color: "#fff",
            opacity: 0.7,
            fontSize: 13,
            scrollMarginTop: 12,
          }}
        >
          Showing lineup recommendations. Time filters will appear once the
          timetable is available.
        </div>
      )}

      {error && (
        <p style={{ color: "#ff6b6b", marginTop: 12 }}>
          {error}
        </p>
      )}

      {hasSearched && !error && (
        <section style={{ marginTop: 22 }}>
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
            {selectedFestival && (
              <>
                {" "}
                at{" "}
                <strong style={{ color: "#fff", opacity: 1 }}>
                  {selectedFestival.display_name}
                </strong>
              </>
            )}
          </p>

          {notFoundArtists.length > 0 && (
            <p
              style={{
                margin: "8px 0 0",
                opacity: 0.7,
                fontSize: 13,
                lineHeight: 1.35,
              }}
            >
              Not found: {notFoundArtists.join(", ")}. Results are based on{" "}
              <strong style={{ color: "#fff", opacity: 1 }}>
                {matchedArtists}
              </strong>
              .
            </p>
          )}

          {!loading && results.length === 0 && (
            <p style={{ marginTop: 18, opacity: 0.75 }}>
              {getEmptyMessage(timeFilter, selectedFestival)}
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

              {band.multi_support_count && band.multi_support_count > 1 && (
                <p
                  style={{
                    margin: "8px 0 10px",
                    opacity: 0.72,
                    fontSize: 13,
                    lineHeight: 1.35,
                  }}
                >
                  Matches multiple artists you entered: {" "}
                  <strong style={{ color: "#fff", opacity: 1 }}>
                    {band.multi_support_artists?.join(", ")}
                  </strong>
                  .
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
                      festival_slug: selectedFestivalSlug,
                      festival_name: selectedFestival?.display_name ?? null,
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

      <footer
        style={{
          marginTop: 40,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 13,
        }}
      >
        <a
          href="https://www.instagram.com/soundcovery?igsh=MW90ZDh1N201N3I3dQ=="
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            color: "#fff",
            opacity: 0.85,
            textDecoration: "none",
          }}
        >
          {/* Instagram SVG */}
          <span>@soundcovery</span>
        </a>

        <a
          href="/about"
          style={{
            color: "#fff",
            opacity: 0.85,
            textDecoration: "none",
          }}
        >
          About
        </a>

        <a
          href="/imprint"
          style={{
            color: "#fff",
            opacity: 0.85,
            textDecoration: "none",
          }}
        >
          Imprint
        </a>
      </footer>
    </main>
  );
}
