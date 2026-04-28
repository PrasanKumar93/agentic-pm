# Action Feedback Spec

Status: Draft v0.1
Date: 2026-04-29

## 1. Purpose

Dashboard operators need clear confirmation after they click a queue or dispatch control. This slice adds a server-rendered feedback banner for successful and failed actions.

## 2. Scope

Covered:

- Work item actions submitted from the work board.
- Dispatch actions submitted from the top toolbar.
- Success and error feedback after the server action calls the API.
- A dismiss affordance that clears feedback query parameters.

Not covered:

- Client-side optimistic updates.
- Toast stacking.
- Long-lived notification history.

## 3. Contract

Server actions redirect back to `/` with query parameters:

```txt
/?feedback=success&message=Paused%20ENG-1%20%28paused%29.
/?feedback=error&message=Cannot%20retry%20a%20running%20work%20item.
```

Allowed `feedback` values:

- `success`
- `error`

The dashboard ignores unknown feedback values and empty messages.

## 4. Behavior

### Success

When the API returns a `2xx` response, the server action:

- Reads the JSON response when present.
- Creates a concise message with the issue identifier and resulting status.
- Revalidates `/`.
- Redirects to `/` with `feedback=success`.

### Failure

When the API returns a non-`2xx` response, the server action:

- Reads `error` from the API response when present.
- Falls back to the HTTP status.
- Revalidates `/`.
- Redirects to `/` with `feedback=error`.

Network or request exceptions use a prefixed failure message.

## 5. UI

The banner renders below the live-data notice and above metrics:

- Success uses the existing green system tone.
- Error uses the existing red system tone.
- The dismiss icon links back to `/`.
- Messages are capped and wrap inside the banner.

## 6. Validation

Required checks:

- `pnpm typecheck`
- `pnpm build`
- API health smoke test
- Feedback query smoke test at `http://localhost:3000`
