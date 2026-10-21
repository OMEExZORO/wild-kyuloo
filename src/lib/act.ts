// Shape returned by GET /api/act (shared by the route and the form).

export interface ActMatch {
  id: string; // Qloo entity ID ("" when only a Wikipedia photo was found)
  name: string;
  type: string; // artist, person, ...
  description?: string;
  image?: string;
  imageCredit?: { label: string; url: string };
}

export interface ActLookup {
  match: ActMatch | null;
  candidates: { id: string; name: string; type: string; description?: string }[];
}
