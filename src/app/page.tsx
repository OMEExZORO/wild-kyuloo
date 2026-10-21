import { CrowdKit } from "@/components/CrowdKit";

export default function Home() {
  return (
    <>
      <CrowdKit />
      <footer className="no-print mx-auto w-full max-w-7xl px-4 pb-10 pt-6 text-xs text-muted sm:px-6">
        Built for the Qloo Agentic Hackathon. Qloo results describe audiences in aggregate, not individual attendees.
      </footer>
    </>
  );
}
