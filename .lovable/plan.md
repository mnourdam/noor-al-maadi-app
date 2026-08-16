# Plan: Who Am I Assistance System

Implementation of the "Reveal Word" and "Reveal Letter" assistance for the "Who Am I" game mode, with persistent local-first storage and Arabic-aware balancing.

## User Review Required

> [!IMPORTANT]
> The assistance system uses a deterministic word selection algorithm that prioritizes informative words over functional ones (like "بن" or "ابن"). For single-word answers, it scales from 1 to 2 letters based on length, ensuring the answer remains a challenge.

- **Reveal Word Cost**: 20 Dinars (multiple uses allowed, leaving at least 1 word hidden).
- **Single-Word Reveal**: 20 Dinars for 1 or 2 letters (length-dependent).
- **Persistence**: Saved to `irth.games.whoami.help.v1` in IndexedDB, partitioned by identity.
- **Offline**: Fully functional offline with immediate local deduction and background sync.

## Proposed Changes

### Logic & Content Handling
- Create `src/lib/games/who-am-i-help.ts` to house the help resolution logic.
- Implement `getRevealSequence` for multi-word answers:
    - Filters out functional words (`بن`, `ابن`, `بنت`, `آل`, `أبو`, `أم`, `ذو`) for the first reveal.
    - Deterministic order (based on word weight + original position).
    - Prevents revealing the final word.
- Implement `getLetterRevealCount` for single-word answers:
    - Length <= 4: 1 letter.
    - Length > 4: 2 letters.
    - Uses `letterClass` from `answer-normalize.ts` to ensure compatibility.

### Storage & Persistence
- Implement `WhoAmIHelpStore` in the same file:
    - Key: `irth.games.whoami.help.v1`.
    - Data: `Record<gameId, { revealedWords: string[], revealedLetters: string[] }>`.
    - Automatically wiped when the game is completed or a new attempt starts (detected via `nonce`).
    - Uses the standard identity partition (`::owner=...`).

### UI Components
- Update `WhoAmIRenderer.tsx`:
    - Register help options via `useRegisterHelpOption`.
    - Display revealed words/letters as a visual hint above the input field.
    - Ensure input validation remains unchanged (visual help only).

### Integration
- Update `RendererCommonProps` in `GameStageRenderer.tsx` to pass necessary context (like `gameId` or `retryNonce`).
- Update `GamePlayPage` in `src/routes/games.$mode.$slug.tsx` to provide the game ID to the renderer.

## Technical Details

- **Word Weights**: A simple map assigns lower weight to functional words to push them to the end of the reveal queue.
- **Deduction Flow**: `GameHelpDialog` calls `pay()`, which triggers `spendDinars` in `useProfile`. The help state is updated and persisted to `localStorage` (mapped to physical owner-scoped key) immediately.
- **Normalization**: The reveal logic respects `normalizeArabicGameAnswer` to ensure consistency between authored content and player input.

## Verification Plan

### Automated Tests
- Run `vitest` on the new `who-am-i-help.ts` logic.
- Verify production build with `bun run build`.

### Manual Verification
1.  **Multi-word**: "صلاح الدين الأيوبي" -> Reveal Word -> "صلاح" (informant) -> Reveal Word -> "الدين" (balanced).
2.  **Functional word**: "خالد بن الوليد" -> First reveal should be "خالد" or "الوليد", NOT "بن".
3.  **Single-word**: "دمشق" (4 chars) -> Reveal 1 letter. "الخوارزمي" (9 chars) -> Reveal 2 letters.
4.  **Persistence**: Reveal word -> Refresh page -> Word remains visible.
5.  **Isolation**: User A reveals word -> Logout -> Guest -> No revealed words visible.
6.  **Offline**: Toggle offline in dev tools -> Purchase help -> Success.
