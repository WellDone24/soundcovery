import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

function tryParseJson(value: string): any | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function runPythonRecommendation(band: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "scripts", "recommend.py");

    const python = spawn("python", [scriptPath, band]);

    let stdout = "";
    let stderr = "";

    python.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    python.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    python.on("close", (code) => {
      const parsed = tryParseJson(stdout);

      // Python hat verwertbares JSON geliefert
      // (auch wenn Exit Code != 0)
      if (parsed) {
        resolve(parsed);
        return;
      }

      // Echter technischer Fehler
      if (code !== 0) {
        reject(
          new Error(
            stderr.trim() || `Python exited with code ${code}`
          )
        );
        return;
      }

      reject(
        new Error(
          `Invalid JSON from Python: ${stdout.slice(0, 500)}`
        )
      );
    });
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const band = body.band;

    if (!band || typeof band !== "string") {
      return NextResponse.json(
        {
          error: "Band is required",
        },
        {
          status: 400,
        }
      );
    }

    const result = await runPythonRecommendation(band);

    // Fachlicher Fehler aus Python
    // (z.B. Artist nicht gefunden)
    if (result?.error) {
      return NextResponse.json(result, {
        status: 200,
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Recommendation API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown server error",
      },
      {
        status: 500,
      }
    );
  }
}