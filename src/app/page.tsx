import { CrowdKit } from "@/components/CrowdKit";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Crowd Kit</h1>
        <p className="mt-1 text-zinc-600 dark:text-zinc-400">
          Tell us about your event. We research who is coming and where they are going, then plan food, sponsors,
          merch and volunteers around them.
        </p>
      </header>
      <CrowdKit />
    </main>
  );
}
