import { NextResponse } from "next/server";

const HN_URL =
  "https://hn.algolia.com/api/v1/search_by_date?tags=story&hitsPerPage=25&numericFilters=points>10";

export async function GET() {
  try {
    const res = await fetch(HN_URL, { next: { revalidate: 180 } });
    if (!res.ok) throw new Error(`HN API ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err), hits: [] }, { status: 502 });
  }
}
