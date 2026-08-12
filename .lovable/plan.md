# Tablet Responsive Fix: Daily Challenges Section

Refactor the Home screen Daily Challenges and Daily Mission sections to correctly utilize tablet real estate, moving away from compressed asymmetric grids to a fluid, balanced layout that scales from 600px to 1280px without breaking mobile.

## User Review Required

> [!IMPORTANT]
> - This fix standardizes the Daily Challenges section to a balanced 2-column layout on tablets and a 3-column layout on wide landscapes, replacing the asymmetric 3/2 split which was causing compression.
> - Mobile layout remains strictly identical to current approved design.

## Proposed Changes

### 1. Home Components (Responsive Hardening)

#### `src/components/home/DailyChallengesSection.tsx`
- Remove the `sm:grid-cols-5` + `col-span-3`/`col-span-2` asymmetric layout which causes severe compression on mid-sized viewports.
- Implement a fluid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` pattern.
- Ensure the "Primary" vs "Secondary" variants maintain visual hierarchy while allowing equal width distribution.

#### `src/components/home/DailyQuestCard.tsx`
- Add a `max-w-4xl` and `mx-auto` (optional, based on design balance) or ensure it matches the width constraints of the challenge section below it to maintain vertical alignment.

### 2. Global Styles / Layout

#### `src/routes/index.tsx`
- Audit `Recent Discoveries` and `Worlds` sections to ensure they share the same fluid breakpoints (`sm`, `md`, `lg`).

## Technical Details

- **Breakpoints:**
  - `sm` (640px+): Switch to 2 columns for challenges.
  - `lg` (1024px+): Switch to 3 columns if 3+ items exist, or keep 2 larger columns.
- **Grid Strategy:**
  - Use `grid-cols-1 sm:grid-cols-2` for the two main challenges.
  - Remove `sm:col-span-3` and `sm:col-span-2` which were the root cause of the "stuck to the right" and "compressed" behavior.
- **Container Strategy:**
  - Ensure `px-5 sm:px-6 md:px-8` matches across all Home sections.
  - Use `max-w-screen-2xl mx-auto` for the parent `AppShell` or main `Home` content to prevent extreme stretching on ultra-wide desktop while fixing the "tablet gap" by allowing content to grow naturally to that max.
