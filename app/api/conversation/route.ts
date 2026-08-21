const BACKEND_URL = process.env.LOCAL_BACKEND_URL ?? "http://127.0.0.1:8787";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type");
    if (!contentType?.startsWith("multipart/form-data")) {
      return Response.json({ detail: "Audio form data is required." }, { status: 400 });
    }

    const upstream = await fetch(`${BACKEND_URL}/api/conversation`, {
      method: "POST",
      headers: { "content-type": contentType },
      body: await request.arrayBuffer(),
      signal: AbortSignal.timeout(120_000),
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
      { detail: "The local voice backend could not process this turn." },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
