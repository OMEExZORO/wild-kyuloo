import { CrowdKit } from "@/components/CrowdKit";

export default function Home() {
  return (
    <>
      <header className="no-print border-b border-hair bg-surface/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-2 font-semibold tracking-tight text-ink">
            <span className="grid size-7 place-items-center rounded-lg bg-ink text-xs font-bold text-page">CK</span>
            Crowd Kit
          </span>
          <a
            href="https://github.com/inslot2525-ctrl/wild-kyuloo"
            target="_blank"
            rel="noreferrer"
            className="text-sm text-ink-2 hover:text-ink"
          >
            GitHub
          </a>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 sm:py-14">
        <CrowdKit />
      </main>
      <footer className="no-print mx-auto w-full max-w-7xl px-4 pb-10 text-xs text-muted sm:px-6">
        Built for the Qloo Agentic Hackathon. Qloo results describe audiences in aggregate, not individual attendees.
      </footer>
    </>
  );
}
