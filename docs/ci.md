# CI

There is no remote and no hosted CI service. This is the whole pipeline: one command that runs
every gate across both repos.

```
cd kit-backend
npm run ci
```

**That is the authoritative entry point.** It works from PowerShell, cmd and Git Bash alike, and it
is the same command the pre-push hook runs.

---

## What runs, in what order

| # | Step | What it catches | Time |
|---|---|---|---|
| 1 | `check:seeds` | stray text or invalid statements in `src/db/**/*.sql`; seeds dry-run against the live schema and rolled back | ~1–2s |
| 2 | `sync:reference -- --check` | `docs/frontend-reference/` mirrors gone stale against `../kit-frontend`, and a hand-edited `countries.js` | ~1–2s |
| 3 | backend `npm test` | 111 vitest tests against `kitworld_test` | ~8–9s |
| 4 | frontend `npm test` | 95 vitest tests under jsdom | ~23–24s |
|  | **total** |  | **~33–37s** |

**Cheapest first, and that ordering is not cosmetic.** A stale mirror or a corrupted seed file is a
two-second answer; finding it only after 33 seconds of tests wastes most of a run.

The frontend suite is roughly two thirds of the wall clock — jsdom startup, not test count. The
timings are printed on every run precisely so anyone notices this creeping toward a minute, which
is the point at which people quietly stop running it.

## Prerequisites

- **MySQL up, with `kitworld_test`.** The backend suite cannot run without it.
- **Both repos side by side** — `kit-backend/` and `kit-frontend/` in the same parent folder.

Both are checked in a **pre-flight** before any step runs, and both are hard failures. Without
MySQL, the backend suite would otherwise fail nine seconds in with a connection stack trace that
looks like a code defect; the pre-flight says so in one line instead, up front.

The database is checked against **`DB_NAME_TEST`** specifically, not `DB_NAME`. This script runs
outside `NODE_ENV=test`, where `env.DB_NAME` resolves to the *dev* database — and a reachable
`kitworld` proves nothing about the one the suite actually uses.

> Note the deliberate inconsistency with `check:seeds` run standalone: that warns and passes when
> the database is unreachable, because its static checks are still worth running. CI has no such
> excuse. "Could not run" is a failure here, never a silence — a suite that reports `no tests` must
> never be mistakable for a green one. See the entry in `known-gaps.md` about the suite aborting
> before any test runs.

## Flags

| Flag | Effect |
|---|---|
| *(none)* | Run all four steps, stream their output, print a summary |
| `--bail` | Stop at the first failure; remaining steps are reported as `skipped` |
| `--quiet` | Suppress per-step output; reprint it only for steps that failed |

```
npm run ci -- --bail
npm run ci -- --quiet
```

**Default is run-everything, not fail-fast.** At ~35s the whole run is cheap, and one invocation
that tells you everything that is broken beats three round trips. `--bail` is there for when you
already know you are iterating on one thing.

## Reading the output

```
CI — kit-backend + kit-frontend

  kit-backend   master @ 12d3357  (clean)
  kit-frontend  main @ f21d7df    (2 file(s) uncommitted)
  database      kitworld_test reachable
```

The commit hash is printed so a green run is attributable to something.

**"N file(s) uncommitted" is a warning, never a failure.** CI runs against the *working tree*, and
running it before committing is the intended use — failing on a dirty tree would forbid the main
use case. It is reported so a green run on a dirty tree is not later mistaken for a green run on
the commit named beside it.

```
══════════════════════════════════════════════════════════════════════
SUMMARY
══════════════════════════════════════════════════════════════════════
  PASS  check:seeds               1.2s
  PASS  sync:reference --check    0.9s
  PASS  backend tests             7.7s
  PASS  frontend tests           22.6s

  32.4s total
```

Exit code is 0 only if every step passed.

## Running one step alone

The runner composes existing scripts and adds nothing to them, so each is still available on its
own — useful while iterating:

```
cd kit-backend   && npm run check:seeds
cd kit-backend   && npm run sync:reference -- --check
cd kit-backend   && npm test
cd kit-frontend  && npm test          # or: npm run ci — an alias, kept for symmetry
```

## The convenience shim

`run-ci.cmd`, in the folder that holds both repos, is a two-line wrapper around `npm run ci`.

> **It is not version-controlled.** That folder is not a git repository — it is a plain directory
> holding two independent ones — so nothing tracks, reviews or clones a file placed there. It exists
> only on the machine where someone created it, and it will not survive a fresh checkout.
>
> Treat it as disposable. It holds no logic: if it and the runner ever disagree, the runner is
> right. Recreate it with `echo @cd /d "%~dp0kit-backend" ^&^& npm run ci %*` if you want it back.

## Git hooks

Both repos install hooks via `core.hooksPath` (the `prepare` script in `package.json`), so they
survive a clone and need no install step.

### pre-commit — fast checks only

Unchanged by this phase, and deliberately so.

- **kit-backend**: validates staged SQL under `src/db/`, and regenerates-checks `countries.js`.
- **kit-frontend**: blocks a commit that would leave the backend's reference mirrors stale.

**Tests are NOT run at commit time.** Charging ~35s to every commit teaches people to reach for
`--no-verify`, which would also disable the SQL and mirror checks that hook exists for. Commits
stay fast; the gate sits at the push.

### pre-push — the full gate

Runs `npm run ci` and blocks the push if it fails. Both repos have one, and they are deliberately
parallel — a gate on one side only is how the mirrors drifted through two phases in the first place.

**Dormant today.** There is no remote, so an ordinary `git push` has nothing to push to and the
hook never fires. It is in place so the gate exists the day a remote is added, rather than being
remembered then. It *does* fire today for a push to a local path or bare repo.

Two behaviours worth knowing:

**Direct pushes to `main` or `master` are refused.** Push a branch and merge it once CI is green.
Both names are protected because the two repos disagree about which they use — kit-backend is on
`master`, kit-frontend on `main` — and both are that repo's integration branch.

```
ALLOW_PROTECTED_PUSH=1 git push ...    # deliberate override, CI still runs
git push --no-verify ...               # skips the branch guard AND the CI run
```

> This is an explicit opt-out rather than a `--force` check because **git tells a pre-push hook
> nothing about `--force`** — no flag, no environment variable, no stdin field. A forced push and
> an ordinary one are indistinguishable from inside the hook. An opt-out that is honest about what
> it is beats a check that looks like it detects force and silently does not.

**A missing sibling repo degrades the gate, it does not brick the push.** Cloned only one repo?
The hook runs that repo's own tests, prints exactly which gates it had to skip, and lets the push
through. A hook that blocks a valid setup is worse than no hook — the same rule the pre-commit
hooks already follow. The output says `PARTIAL gate` when this happens; do not read it as a full
green.
