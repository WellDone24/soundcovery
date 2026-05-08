const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function getSessionId() {
  if (typeof window === "undefined") return null;

  let sessionId = localStorage.getItem("soundcovery_session_id");

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem("soundcovery_session_id", sessionId);
  }

  return sessionId;
}

export async function track(
  event_type: string,
  payload: Record<string, unknown> = {}
) {
  try {
    if (!API_BASE_URL) return;

    await fetch(`${API_BASE_URL}/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        session_id: getSessionId(),
        event_type,
        payload,
      }),
    });
  } catch (error) {
    console.warn("Tracking failed", error);
  }
}