import { Button } from '@/components/ui/button';

const pipeline = [
  {
    title: 'Planner',
    label: 'Deterministic fail-first planning',
    description:
      'Ranks sessions by difficulty with constraint pressure so the most difficult placements are solved first instead of being left to the end.',
  },
  {
    title: 'Scheduler',
    label: 'Deterministic conflict-free placement',
    description:
      'Uses teacher, room, batch, and slot occupancy maps to place one session at a time with hard constraints enforced before confirmation.',
  },
  {
    title: 'Validator',
    label: 'Pure JS cross-check',
    description:
      'Re-audits the full draft timetable for clashes, capacity problems, and lab-room mismatches before any publish step.',
  },
  {
    title: 'Scorer',
    label: 'Quality and human-like balance',
    description:
      'Scores the schedule for spread, load balance, and realism so the output stays close to how a strong timetable clerk would work.',
  },
];

const principles = [
  'No hard conflicts in teacher, room, or batch occupancy.',
  'Labs are placed before easy theory sessions when space is tight.',
  'High-credit subjects are distributed instead of clustered.',
  'MongoDB persistence keeps the generated run auditable.',
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(24,150,113,0.22),_transparent_38%),linear-gradient(180deg,_#101413_0%,_#111111_48%,_#0b0b0b_100%)] px-6 py-10 text-stone-100 sm:px-8 lg:px-12">
      <div className="absolute inset-x-0 top-0 h-80 bg-[radial-gradient(circle,_rgba(94,239,170,0.22),_transparent_50%)] blur-3xl" />
      <div className="relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-7xl flex-col gap-10">
        <section className="grid gap-8 rounded-[2rem] border border-white/10 bg-black/25 p-8 shadow-2xl shadow-emerald-950/20 backdrop-blur xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-sm text-emerald-200">
              Agentic timetable generation pipeline
            </div>
            <div className="space-y-4">
              <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Human-like timetable scheduling with advanced deterministic search.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-stone-300 sm:text-lg">
                Time-Gen uses a fully server-side scheduler with fail-first ordering, beam candidate exploration, and strict hard-constraint enforcement for conflict-free timetables.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button className="bg-emerald-500 text-slate-950 hover:bg-emerald-400">Generate timetable</Button>
              <Button variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">
                Review architecture
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {principles.map((principle) => (
                <div key={principle} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-stone-300">
                  {principle}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-white/10 bg-stone-950/60 p-5">
            <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-sm uppercase tracking-[0.25em] text-emerald-200/80">Execution flow</p>
              <div className="space-y-3">
                {pipeline.map((step, index) => (
                  <div key={step.title} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="text-lg font-medium text-white">
                        {index + 1}. {step.title}
                      </h2>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-200">
                        {step.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-stone-300">{step.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-6 text-emerald-50 md:col-span-2">
            <p className="text-sm uppercase tracking-[0.25em] text-emerald-200/80">Production strategy</p>
            <p className="mt-3 max-w-3xl text-lg leading-8 text-emerald-50/90">
              The schedule builder is fully deterministic and combines fail-first search, beam-ranked placements, and fairness-aware scoring. That keeps the output stable at scale and avoids model-rate-limit failure paths.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.25em] text-stone-400">Search policy</p>
            <p className="mt-3 text-base leading-7 text-stone-200">
              Hard constraints (teacher, room, batch, availability) are always enforced before placement. Soft objectives then optimize spread, daily balance, and practical slot quality.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
