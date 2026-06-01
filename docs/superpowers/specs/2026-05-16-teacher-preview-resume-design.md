# Design: Teacher preview generation — resume, history, and soft regenerate

**Status:** Draft for review  
**Date:** 2026-05-16  
**Related:** `docs/superpowers/specs/2026-05-15-teacher-preview-generation-design.md` (unified preview pipeline)

## 1. Goal

When a teacher opens the chapter **「生成课件」** preview flow (`/teacher/projects/:id/preview`):

1. **Detect prior work:** local draft progress and/or a **completed** server-published classroom linked to the project.
2. **If generation was interrupted:** offer **Continue generation** (resume from last persisted client state).
3. **On refresh or re-entry from the same entry:** if draft or published artifacts exist, show **existing content + progress**, and allow **Continue** or **Regenerate** (soft regenerate — see §4).

## 2. Non-goals

- Cross-device sync of in-progress drafts (IndexedDB remains **this browser only**).
- **Hard regenerate:** deleting or invalidating the server classroom record when the user chooses「重新生成」. Adopted decision: **option 1 — soft regenerate only** (§4.2).

## 3. Definitions

| Term | Meaning |
|------|---------|
| **Preview draft** | Client-side `useStageStore` state persisted to **IndexedDB** under a stable `stage.id`, plus minimal **sessionStorage** to re-bind `projectId` (+ optional `chapterId`) to that `stage.id` after navigation/refresh. |
| **Published classroom** | `CourseProject.publishedClassroomId` points to server storage; full `stage` + `scenes` retrievable via existing `GET /api/classroom?id=...` (same as classroom page fallback). |
| **Soft regenerate** | Clear **local** preview draft (IndexedDB keys for that `stage.id`, sessionStorage binding, reset store), then run the pipeline from outline stream again. **Does not** delete or PATCH the server classroom until a **new** successful `publish-classroom` overwrites `publishedClassroomId`. |

## 4. Behaviour

### 4.1 Entry resolution order

On `TeacherPreviewShell` mount (after `project` is available from the server page):

1. **Read binding** from `sessionStorage` key e.g. `teacherPreviewBinding` JSON: `{ projectId, chapterId?, stageId }`. If `projectId` mismatches current route, ignore binding.
2. **If `stageId` present:** `await loadFromStorage(stageId)`.
3. **Classify state** (mutually exclusive priority for **UI mode**, details combinable in copy):
   - **A — Resumable draft:** `stage` exists, `outlines.length > 0`, and ∃ outline order without a matching `scene.order`, OR `generationStatus` is `paused` / `generating` with pending outlines.
   - **B — Draft complete, publish pending / failed:** all outline orders have scenes, `generationStatus === 'completed'`, but user has not navigated away after publish success (optional sub-state); or last run failed at publish (surface error + retry publish if idempotent safe — follow existing publish-classroom behaviour).
   - **C — Published product:** `project.publishedClassroomId` set AND `GET /api/classroom?id=publishedClassroomId` returns success with `scenes.length` consistent with expectations (≥1; optional: compare to teacher outline count if we store expected count in binding).
   - **D — Fresh:** no usable binding or `loadFromStorage` empty and no published classroom (or empty fetch).

Default auto-start pipeline only in **D**. For **A/B/C** show a **gate screen** (see §5) instead of immediately running `runPipeline`.

### 4.2 Soft regenerate (user choice「重新生成」)

1. `stop()` any in-flight generation.
2. Clear **sessionStorage** binding for this `(projectId, chapterId)`.
3. Remove IndexedDB records for the **current draft** `stageId` (use existing store/database helpers where possible; may need `db` clear by `stageId` pattern — implementation plan will name exact APIs).
4. Reset `useStageStore` to a clean slate for a **new** `stageId` (`nanoid()`), **without** mutating `CourseProject.publishedClassroomId` on the server.
5. User confirms (single modal) then transitions to **D** and starts outline → scenes → publish from scratch.

### 4.3 Continue generation

1. If **A:** ensure `generationParams`-equivalent payload exists (see §6); call `generateRemaining` with same pattern as `app/classroom/[id]/page.tsx` (after `loadImageMapping` if PDF images ever apply — teacher preview currently has no PDF; keep extension point).
2. If interrupted at **outline stream** only: no scenes yet — either re-run SSE only or full pipeline; spec prefers **re-run outline stream** if outlines empty, else **resume scenes** if outlines already in store.

### 4.4 Published + draft coexistence

If both **C** and **A** could appear (e.g. published exists user starts new draft): UI should prefer **showing draft resume** with a secondary link「已发布版本在 Studio」. Exact copy in i18n during implementation.

## 5. UI (gate screen)

When not in **D**:

- **Title / body:** short summary — outline count, scene count / total, published badge if **C**.
- **Primary actions:**
  - **Continue generation** — visible for **A** (and **B** if publish retry needed, wording differs).
  - **重新生成（软）** — confirm modal explaining「仅清除本机草稿，已发布课堂不受影响直到再次发布」.
  - **进入 Studio** — when **C** (navigate `buildTeacherStudioPath`).
- **Secondary:** Back to design workbench (existing control).

Auto-run `runPipeline` **only** when gate resolves to **D** or user taps **Continue** after **A**.

## 6. Persistence contract

### 6.1 Stable `stage.id`

- On **first** start of a preview for `(projectId, chapterId)`: allocate `stageId = nanoid()`, write binding to `sessionStorage`, persist store with `saveToStorage` after meaningful mutations (at minimum: after `setStage` init, after outline list committed, after each `addScene` — align with debounced save in `stage` store).
- **Do not** reuse `publishedClassroomId` as the draft `stage.id` while draft is incomplete — avoids overwriting server-linked id in confusing ways. **Published** id remains server authority; draft id is separate until publish returns new id and project is updated (existing publish flow).

### 6.2 `generationParams` (teacher preview)

Mirror `sessionStorage.generationParams` shape used by classroom page minimally:

- `languageDirective`
- `agents` (array; if preview uses preset agents only, persist what `useSceneGenerator` needs)
- `userProfile` optional
- `pdfImages` / image mapping: optional for future parity; omit if empty

Write this JSON when committing outlines to store (before first `generateRemaining`), update if agents change mid-flight (unlikely).

### 6.3 `chapterId` consistency

Binding key must include `chapterId ?? '__all__'` so single-chapter vs full-course drafts do not collide.

## 7. API / server

- No new endpoints required for **soft regenerate** or resume.
- Optional future: `PATCH` project to store `previewDraftStageId` for discoverability across tabs — **out of scope** for v1.

## 8. Testing strategy

- Unit: binding key helpers read/write; state classifier pure function given mock `StageState`.
- Integration: Vitest or Playwright stub `loadFromStorage` / IndexedDB where feasible; manual checklist for refresh mid-scene-gen.

## 9. i18n

All new user-visible strings under `teacher.preview.*` (or extend existing `teacher.preview` keys), run `pnpm check:i18n-keys`.

## 10. Open points (implementation plan)

- Exact Dexie delete-by-`stageId` API reuse from existing classroom reset patterns.
- Whether gate screen replaces entire shell or is a modal overlay — prefer **full-card gate** matching current preview layout.

---

**Approved product decision captured:** 「重新生成」= **option 1 / soft regenerate** (§3, §4.2).
