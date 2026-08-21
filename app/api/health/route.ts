const BACKEND_URL = process.env.LOCAL_BACKEND_URL ?? "http://127.0.0.1:8787";

export async function GET() {
  try {
    const upstream = await fetch(`${BACKEND_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { detail: "The local voice backend is unavailable." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
