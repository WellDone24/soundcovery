"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/tracking";

type TimeFilter = "upcoming" | "all" | "today";

type Festival = {
  festival_slug: string;
  display_name: string;
  is_default?: boolean;
  has_timetable?: boolean;
};

type FestivalsResponse = {
  festivals?: Festival[];
  default_festival_slug?: string | null;
  error?: string;
};

type Appearance = {
  date?: string | null;
  stage?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type Recommendation = {
  name: string;
  reason: string;
  match_quality?: string | null;
  spotify_url?: string | null;
  artist_url?: string | null;
  appearances?: Appearance[];
  timetable?: Appearance | null;
  multi_support_artists?: string[];
  multi_support_count?: number;
};

type InputArtistMatch = {
  input: string;
  matched_name?: string | null;
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

function getFestivalBySlug(festivals: Festival[], slug?: string | null) {
  if (!slug) return null;
  return festivals.find((festival) => festival.festival_slug === slug) ?? null;
}

function getUserFacingErrorMessage(error?: string) {
  if (!error) return "Could not load recommendations right now.";

  const normalized = error.toLowerCase();

  if (
    normalized.includes("input artist not found") ||
    normalized.includes("not found in saem data") ||
    normalized.includes("none of the input artists were found") ||
    normalized.includes("current dataset")
  ) {
    return "That artist is not in the current dataset yet.";
  }

  if (normalized.includes("ambiguous")) {
    return "Multiple artists matched that name. Try a more specific search.";
  }

  if (normalized.includes("unknown") && normalized.includes("festival")) {
    return "That festival is not available right now.";
  }

  if (
    normalized.includes("no input artists provided") ||
    normalized.includes("band is required")
  ) {
    return "Start with an artist you like.";
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
    throw new Error(`Invalid API response. HTTP ${response.status}`);
  }
}

function getMatchedArtistLabel(matches: InputArtistMatch[], fallback: string) {
  const names = matches
    .map((match) => match.matched_name || match.input)
    .filter(Boolean);

  return names.length > 0 ? names.join(", ") : fallback;
}

function getMatchBadge(matchQuality?: string | null) {
  if (matchQuality === "strong") return "Strong match";
  if (matchQuality === "decent") return "Worth a try";
  return "Discovery pick";
}

function getAppearanceDateLabel(date?: string | null) {
  if (!date) return null;

  const parsed = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;

  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function getEmptyMessage(
  timeFilter: TimeFilter,
  selectedFestival?: Festival | null,
) {
  if (selectedFestival?.has_timetable === false) {
    return "No strong matches found for that lineup.";
  }

  if (timeFilter === "upcoming") {
    return "No strong matches still to play. Try all days.";
  }

  if (timeFilter === "today") {
    return "No strong matches today. Try still to play.";
  }

  return "No strong matches found for that search.";
}

export default function Recommender({
  initialFestivalSlug,
}: {
  initialFestivalSlug?: string | null;
}) {
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
  const [selectedFestivalSlug, setSelectedFestivalSlug] = useState<string | null>(
    null,
  );
  const [festivalLoading, setFestivalLoading] = useState(true);
  const [festivalError, setFestivalError] = useState("");
  const [showFestivalSwitch, setShowFestivalSwitch] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement | null>(null);
  const trackingContextRef = useRef<TrackingContext | null>(null);

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
        setFestivalError("Festival data is not available right now.");
        setFestivalLoading(false);
        return;
      }

      try {
        const response = await fetch(`${apiUrl}/festivals`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        const data = await readApiJson<FestivalsResponse>(response);

        if (!response.ok || data.error) {
          throw new Error(data.error ?? "Could not load festivals.");
        }

        const loadedFestivals = data.festivals ?? [];
        setFestivals(loadedFestivals);

        const requestedFestival =
          getFestivalBySlug(loadedFestivals, initialFestivalSlug)?.festival_slug ??
          null;

        const defaultSlug =
          requestedFestival ??
          data.default_festival_slug ??
          loadedFestivals.find((festival) => festival.is_default)?.festival_slug ??
          loadedFestivals[0]?.festival_slug ??
          null;

        setSelectedFestivalSlug(defaultSlug);

        if (!defaultSlug) {
          setFestivalError("No festival is available right now.");
        }
      } catch {
        setFestivalError("Festival data is not available right now.");
      } finally {
        setFestivalLoading(false);
      }
    }

    loadFestivals();
  }, [initialFestivalSlug]);

  async function runSearch(
    filter: TimeFilter,
    festivalSlugOverride?: string,
  ) {
    inputRef.current?.blur();

    const query = input.trim();

    if (!query) {
      setError("Start with an artist you like.");
      setResults([]);
      setHasSearched(false);
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    const festivalSlug = festivalSlugOverride ?? selectedFestivalSlug;
    const festival = getFestivalBySlug(festivals, festivalSlug);

    if (!apiUrl || !festivalSlug) {
      setError("Recommendations are not available right now.");
      return;
    }

    const trackingContext = trackingContextRef.current ?? getTrackingContext();
    const now = new Date().toISOString();

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
        headers: { "Content-Type": "application/json" },
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
        throw new Error(data.error ?? "Recommendation request failed.");
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
          data.festival?.display_name ?? festival?.display_name ?? null,
        time_filter: filter,
        effective_time_filter: data.effective_time_filter ?? null,
        time_filter_applied: data.time_filter_applied ?? null,
        now,
        count: recommendations.length,
        ...trackingContext,
      });

      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (err) {
      const rawMessage =
        err instanceof Error ? err.message : "Unknown recommendation error";

      const message =
        err instanceof DOMException && err.name === "AbortError"
          ? "This is taking longer than expected. Try again."
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

  function handleTimeFilterChange(nextFilter: TimeFilter) {
    setTimeFilter(nextFilter);

    if (hasSearched && !loading) {
      void runSearch(nextFilter);
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

    void track("festival_changed", {
      previous_festival_slug: previousSlug,
      next_festival_slug: nextSlug,
      next_festival_name: nextFestival?.display_name ?? null,
      ...trackingContext,
    });

    if (hasSearched && !loading) {
      void runSearch(timeFilter, nextSlug);
    }
  }

  return (
    <section className="recommender" id="recommender" aria-labelledby="recommender-title">
      <div className="tool-heading">
        <div>
          <p className="eyebrow">Festival recommender</p>
          <h2 id="recommender-title">Start with music you already love.</h2>
        </div>

        <div className="festival-context">
          <span className="festival-label">Lineup</span>
          <strong>
            {festivalLoading
              ? "Loading…"
              : selectedFestival?.display_name ?? "No festival selected"}
          </strong>

          {festivals.length > 1 && (
            <button
              className="text-button"
              type="button"
              onClick={() => setShowFestivalSwitch((value) => !value)}
              disabled={loading || festivalLoading}
            >
              Change
            </button>
          )}
        </div>
      </div>

      {showFestivalSwitch && festivals.length > 1 && (
        <div className="festival-switch" aria-label="Choose festival">
          {festivals.map((festival) => (
            <button
              key={festival.festival_slug}
              type="button"
              className={
                festival.festival_slug === selectedFestivalSlug
                  ? "filter-button active"
                  : "filter-button"
              }
              onClick={() => handleFestivalChange(festival.festival_slug)}
              disabled={loading}
            >
              {festival.display_name}
            </button>
          ))}
        </div>
      )}

      <div className="search-row">
        <input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !loading && !festivalLoading) {
              void runSearch(timeFilter);
            }
          }}
          placeholder="Try: The 1975, Medium Build"
          aria-label="Artists you like"
        />
        <button
          className="primary-button"
          type="button"
          onClick={() => void runSearch(timeFilter)}
          disabled={loading || festivalLoading || !selectedFestivalSlug}
        >
          {loading ? "Finding…" : "Find artists"}
        </button>
      </div>

      <p className="tool-note">
        Enter one or several artists. Soundcovery looks for musically relevant
        acts in the selected lineup — not simply the biggest names.
      </p>

      {selectedFestivalHasTimetable ? (
        <div className="filter-row" aria-label="Time filter">
          {TIME_FILTER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={
                timeFilter === option.value
                  ? "filter-button active"
                  : "filter-button"
              }
              onClick={() => handleTimeFilterChange(option.value)}
              disabled={loading}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <p className="lineup-note">
          Lineup mode. Time filters appear when timetable data is available.
        </p>
      )}

      {festivalError && <p className="error-message">{festivalError}</p>}
      {error && <p className="error-message">{error}</p>}

      {hasSearched && !error && (
        <div className="results" ref={resultRef}>
          <div className="results-heading">
            <p className="eyebrow">Recommendations</p>
            <h3>
              Based on <span>{matchedArtists || lastQuery}</span>
            </h3>
            {selectedFestival && <p>{selectedFestival.display_name}</p>}
          </div>

          {notFoundArtists.length > 0 && (
            <p className="not-found">
              Not found: {notFoundArtists.join(", ")}. The results use the
              artists that could be matched.
            </p>
          )}

          {!loading && results.length === 0 && (
            <p className="empty-message">
              {getEmptyMessage(timeFilter, selectedFestival)}
            </p>
          )}

          <div className="result-list">
            {results.map((band) => {
              const appearances =
                band.appearances && band.appearances.length > 0
                  ? band.appearances
                  : band.timetable
                    ? [band.timetable]
                    : [];

              return (
                <article className="result-item" key={band.name}>
                  <div className="result-topline">
                    <span className="match-label">
                      {getMatchBadge(band.match_quality)}
                    </span>
                    <h4>{band.name}</h4>
                  </div>

                  {appearances.length > 0 && (
                    <div className="appearance-list">
                      {appearances.map((appearance, index) => {
                        const dateLabel = getAppearanceDateLabel(appearance.date);
                        const start = appearance.start_time?.slice(0, 5);
                        const end = appearance.end_time?.slice(0, 5);

                        return (
                          <p
                            key={`${appearance.date ?? ""}-${appearance.start_time ?? ""}-${appearance.stage ?? ""}-${index}`}
                          >
                            {dateLabel && <strong>{dateLabel} · </strong>}
                            {start ?? "Time TBA"}
                            {end && `–${end}`}
                            {appearance.stage && ` · ${appearance.stage}`}
                          </p>
                        );
                      })}
                    </div>
                  )}

                  <p className="result-reason">{band.reason}</p>

                  {band.multi_support_count && band.multi_support_count > 1 ? (
                    <p className="multi-match">
                      Also supported by: {band.multi_support_artists?.join(", ")}.
                    </p>
                  ) : null}

                  {(band.spotify_url || band.artist_url) && (
                    <div className="result-links">
                      {band.spotify_url && (
                        <a
                          href={band.spotify_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            const trackingContext =
                              trackingContextRef.current ?? getTrackingContext();

                            void track("spotify_clicked", {
                              query_band: lastQuery,
                              recommended_band: band.name,
                              festival_slug: selectedFestivalSlug,
                              festival_name: selectedFestival?.display_name ?? null,
                              time_filter: timeFilter,
                              match_quality: band.match_quality,
                              ...trackingContext,
                            });
                          }}
                        >
                          Listen on Spotify
                        </a>
                      )}

                      {band.artist_url && (
                        <a
                          href={band.artist_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            const trackingContext =
                              trackingContextRef.current ?? getTrackingContext();

                            void track("artist_page_clicked", {
                              query_band: lastQuery,
                              recommended_band: band.name,
                              festival_slug: selectedFestivalSlug,
                              festival_name: selectedFestival?.display_name ?? null,
                              time_filter: timeFilter,
                              match_quality: band.match_quality,
                              ...trackingContext,
                            });
                          }}
                        >
                          Festival artist page
                        </a>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
