# Micro-Chordbot Issue #3 failure feedback

## Goal

Make the existing Micro-Chordbot storage, import, and WebAudio failure paths visible and recoverable without changing project data semantics, tuning behavior, or the historical security boundary.

## Scope

1. Add a small pure feedback contract for persistence, import, and audio failures.
2. Show autosave state in the existing management status area and keep dirty state on failure.
3. Add explicit persistence and audio retry actions.
4. Wrap both project and progression imports in `try/finally`, reset file inputs on every path, validate the document before mutation, and keep the last-good state on malformed input.
5. Route all WebAudio start paths through one failure boundary while preserving the current state/tuning and allowing a later retry.

## Verification

- Run the new Node test contract in RED before implementation and GREEN after implementation.
- Run syntax checks for changed JavaScript.
- Perform a browser manual smoke check for malformed import, persistence failure/retry, and audio failure/retry where the platform permits; keep any unavailable native/browser boundary explicit.

## Out of scope

- No redesign of the editor or persistence format.
- No changes to tuning algorithms, Undo/Redo semantics, authentication, credentials, or historical security decisions.
- No deployment or merge from this task.
