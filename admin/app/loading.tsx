// Shown the moment a link is clicked, while the server reads the project
// store and GitHub. Without it the old page sits still until the new one is ready.
export default function Loading() {
  return (
    <div className="flex flex-col gap-10 animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="border-b border-line pb-6">
        <div className="h-9 w-56 bg-[rgba(139,115,85,0.12)] mb-3" />
        <div className="h-3 w-full max-w-xl bg-[rgba(139,115,85,0.08)]" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="h-4 w-40 bg-[rgba(139,115,85,0.12)]" />
          <div className="h-16 w-full border border-line bg-[rgba(139,115,85,0.04)]" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
