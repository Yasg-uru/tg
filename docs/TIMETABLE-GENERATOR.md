# Timetable Generator — Design & Operation

This document explains how the timetable generator in this repo works: inputs, core algorithm, constraints, scoring, validation, and extension points.

**Files to inspect**
- Service implementation: [src/lib/services/timetable-generation.service.ts](src/lib/services/timetable-generation.service.ts)
- Types / output shapes: [src/lib/types/timetable.ts](src/lib/types/timetable.ts)
- Persisted model: [src/lib/db/generated-timetable.model.ts](src/lib/db/generated-timetable.model.ts)

**Goals**
- Produce high-quality, human-like weekly timetables for one or more batches
- Enforce hard constraints (no double-bookings, lab room requirements)
- Prefer human-friendly placements (spread subjects, morning theory, afternoon labs)
- Provide a validation & scoring report for review before publishing

---

## 1. High-level Flow

1. `generateTimetable(request)` (entry point)
   - Connects to DB and loads all relevant data (batches, subjects, teachers, rooms, timeslots, mappings, academic calendar, constraints, lab batches).
2. Build scheduling requirements using `buildRequirements(...)`.
   - Each requirement describes: batch, subject, teacher, sessionType (lab/theory/tutorial/elective), sessions needed, session length, weight/priority, preferred rooms.
3. Create or obtain a `TimetablePlan`:
   - A fallback deterministic plan is built by `buildFallbackPlan(...)`.
   - Optionally ask an AI planner via `generateStructuredJson` using `createPlanPrompt(...)` to produce a plan (subject ordering, preferred slots/days). If AI fails, fallback plan is used.
4. Reorder requirements according to the plan and priority.
5. Place sessions greedily using `buildAssignments(...)`:
   - Iterates requirements in order, searches candidate day/slot/room combinations, scores candidates with `scoreCandidate(...)`, and selects the best.
   - Labs require two consecutive slots and both slots are reserved when assigned.
   - Occupancy is tracked in an `AvailabilityState` to prevent teacher/room/batch double-booking.
6. Validate the resulting assignments via `validateTimetable(...)`.
   - Detects hard errors (room/teacher/batch double-bookings, lab-room mismatch), warns on soft issues (teacher daily/weekly load, poor subject spread).
7. Score the timetable with `scoreTimetable(...)` and produce a `TimetableGenerationResult`.
8. Persist result to the `GeneratedTimetable` collection unless `request.persist` is false.

---

## 2. Data Inputs (what the algorithm expects)
- Batches (students grouped by program/year/semester)
- Subjects (type, credits, hours per week, teacher assignment)
- Teachers (max hours per day/week, unavailabilities, preferred slots)
- Rooms (type, capacity, availability, lab/computer capability)
- Timeslots (ordered periods per day with flags `allowLab`, `allowTheory`, break/lunch)
- Subject-room mappings (preferred rooms / required equipment)
- Academic calendar (holidays/exams to mark excluded days)
- Optional: Constraints and LabBatch info (for advanced behaviors)

---

## 3. Key Functions & Responsibilities

- `buildRequirements(batches, subjects, teachers, mappings, labBatches)`
  - Produces an array of `SchedulingRequirement` items with `minSpread` and `priority` computed.

- `buildFallbackPlan(requirements)`
  - Deterministic plan used when AI plan isn't available. Prioritizes labs and high-credit/critical subjects.

- `createPlanPrompt(requirements, weekDays, excludedDays)`
  - Builds an AI prompt describing available days/requirements and the desired output shape and rules.

- `scoreCandidate(params)`
  - Returns numeric score for a candidate placement; enforces hard constraints by heavy penalties and rewards desirable placements (preferred slots, room fit, spread).

- `buildAssignments({ requirements, plan, batches, teachers, rooms, timeslots })`
  - The greedy placer: for each requirement, it evaluates day/slot/room candidates and commits the best valid choice; ensures labs take two consecutive slots and marks both occupied.
  - Tracks availability sets: `teacherSlotKey`, `roomSlotKey`, `batchSlotKey`, daily & weekly loads, and subject session counts for spread enforcement.

- `validateTimetable(assignments, requirements, teachers, rooms)`
  - Two-pass validation: detect hard errors (conflicts, missing rooms, wrong lab rooms) and produce soft warnings (teacher day/week overload, poor spread).

- `scoreTimetable(assignments, unplaced, validation)`
  - Converts validation and unplaced counts into a human-friendly `TimetableScore` (label + improvements).

- `generateTimetable(request)`
  - Orchestrates the whole process and persists the result.

---

## 4. Constraints and Assumptions
- Labs require two consecutive slots; the algorithm enforces this explicitly.
- Teacher unavailability is read from `teacher.notAvailable` and supports both `slotId` and `day-slotId` forms.
- Academic calendar marks full weekdays as excluded; the generator avoids placing sessions on those weekdays.
- Room capacity is matched approximately (capacity ratio used in scoring) — very large mismatches are penalized strongly.
- Hard constraint violations (e.g., teacher over daily limit at candidate evaluation) are rejected via large penalties.
- The current placer is greedy (no backtracking). This is efficient and deterministic but may leave some sessions unplaced; a constraint-solver/backtracking optimizer is a recommended future improvement.

---

## 5. Output Shape
See types in: [src/lib/types/timetable.ts](src/lib/types/timetable.ts)
Main pieces:
- `TimetablePlan` — subject order, preferred slots/days, notes
- `TimetableAssignment[]` — final assignments with `day`, `slotId`, `roomId`, `teacherId`, `slotCount`, and `score`
- `validation` — `conflictFree`, `issues` (errors/warnings)
- `score` — overall quality summary

Example: the service returns a `TimetableGenerationResult` that contains `assignments`, `plan`, `validation`, `score`, and `summary`.

---

## 6. How to run locally
From project root (assuming env/database configured):

```bash
# run a quick node script or use the API route that calls generateTimetable
node -e "require('./dist').generateTimetable({ publish: false })"
```

(Preferably run through the app API: generation endpoint is implemented under `src/app/api/generate/route.ts`.)

---

## 7. Extension Points & Next Improvements
- Replace greedy placer with a constraint-satisfaction solver (e.g., OR-Tools, custom backtracking) to reduce unplaced sessions.
- Add explicit lab-batch splitting: use `LabBatch` details to create separate smaller lab requirements when room capacity is insufficient.
- Improve AI plan integration: validate AI suggestions before trusting them.
- Add heuristics that consider teacher commute/adjacent day patterns if such data is available.
- Add caching and incremental re-generation for small changes (publish delta updates only).

---

## 8. Limitations
- Greedy approach can be suboptimal; some schedules may remain unplaced even if a valid global arrangement exists.
- Advanced institutional constraints (complex appliesTo rules) are read but not fully enforced — constraint map exists for future enforcement.

---

## 9. Where to look in code
- Core logic & orchestration: [src/lib/services/timetable-generation.service.ts](src/lib/services/timetable-generation.service.ts)
- Type definitions: [src/lib/types/timetable.ts](src/lib/types/timetable.ts)
- DB model storing results: [src/lib/db/generated-timetable.model.ts](src/lib/db/generated-timetable.model.ts)

---

If you want, I can:
- Add a small example JSON output for a toy dataset.
- Create a short test harness to run generation against a seeded in-memory DB.
- Start an RFC for migrating to a constraint-solver and outline required changes.

