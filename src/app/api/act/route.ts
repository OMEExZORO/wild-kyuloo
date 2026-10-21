import type { ActLookup } from "@/lib/act";
import { cached } from "@/lib/cache";
import { lookupAct } from "@/lib/tools/qloo";

// GET /api/act?q=Phoebe%20Bridgers[&type=artist]
// Resolves the act on Qloo for the form's "Find artist" button: the match
// (with Qloo's photo, or a Wikipedia photo as fallback) plus other candidates.

const UA = "CrowdKit/0.1 (Qloo Agentic Hackathon; github.com/inslot2525-ctrl/wild-kyuloo)";

async function wikipediaPhoto(name: string): Promise<{ image: string; credit: { label: string; url: string } } | null> {
  const { value } = await cached("wiki-photo", name.toLowerCase(), async () => {
    const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name.replace(/ /g, "_"))}`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) return null;
    const page = (await res.json()) as { type?: string; originalimage?: { source: string }; thumbnail?: { source: string }; content_urls?: { desktop?: { page?: string } } };
    const image = page.originalimage?.source ?? page.thumbnail?.source;
    if (page.type === "disambiguation" || !image) return null;
    return { image, credit: { label: "Wikipedia", url: page.content_urls?.desktop?.page ?? "https://en.wikipedia.org" } };
  });
  return value;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const type = url.searchParams.get("type") ?? undefined;
  if (q.length < 2) return Response.json({ error: "Enter an act name" }, { status: 400 });

  try {
    const { match, candidates } = await lookupAct(q, type);
    const result: ActLookup = { match: match ? { ...match } : null, candidates };

    if (result.match?.image) {
      result.match.imageCredit = { label: "Qloo", url: "https://www.qloo.com" };
    } else {
      // No Qloo photo (or Qloo unavailable): try Wikipedia by the resolved or typed name.
      const wiki = await wikipediaPhoto(result.match?.name ?? q).catch(() => null);
      if (wiki) {
        result.match = result.match ?? { id: "", name: q, type: "" };
        result.match.image = wiki.image;
        result.match.imageCredit = wiki.credit;
      }
    }
    return Response.json(result);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Lookup failed" }, { status: 502 });
  }
}
