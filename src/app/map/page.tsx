import { SharedMap } from "@/components/SharedMap";

export const metadata = { title: "Site map · Crowd Kit" };

// Opened from "Share with team": the layout and event basics live in the URL hash.
export default function MapPage() {
  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-10 sm:px-6">
      <SharedMap />
    </main>
  );
}
