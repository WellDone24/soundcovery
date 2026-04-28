import { NextResponse } from "next/server";
import { spawn } from "child_process";
import path from "path";

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
      if (code !== 0) {
        reject(new Error(stderr || `Python exited with code ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`Invalid JSON from Python: ${stdout}`));
      }
    });
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const band = body.band;

    if (!band || typeof band !== "string") {
      return NextResponse.json(
        { error: "Band is required" },
        { status: 400 }
      );
    }

    const result = await runPythonRecommendation(band);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
      },
      { status: 500 }
    );
  }
}