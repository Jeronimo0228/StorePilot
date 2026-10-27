# API gap analysis

Prioritized gaps vs. full App Store Connect + Google Play Developer API coverage.

**As of v1.2.0:** every Android Publisher v3 method is reachable via `google_api_call` +
`google_list_api_catalog`. Every ASC `/v1|/v2` path is reachable via `apple_api_call` +
`apple_list_api_catalog`. Typed tools cover the golden path + first-launch + monetization extras.

**Legend**

| Priority | Meaning |
|---|---|
| P0 | Blocks common release flows — implement as typed tool next |
| P1 | High value for agents — typed tool or orchestrator workflow |
| P2 | Admin/monetization — typed tool in admin toolset |
| P3 | Long tail — use `apple_api_call` / `google_api_call` |

**Implementation**

| Strategy | When |
|---|---|
| **Typed tool** | Frequent, needs validation, part of golden path |
| **Workflow** | Multi-step (upload + release + commit) |
| **Escape hatch** | Rare, new API fields, long tail |

---

## Current coverage (v1.2.0)

| Area | Apple | Google | Notes |
|---|---|---|---|
| Release & tracks | ~90% | ~90% | Orchestrator + upload-and-release |
| TestFlight / testers | ~80% | ~70% | Public link + groups |
| Metadata & listings | ~70% | ~75% | Screenshots + contact/privacy URL |
| First launch / policy | Partial | Partial | Checklists; Console-only forms documented |
| Data Safety | N/A | ✅ typed | `google_set_data_safety` |
| Reviews | ~50% | ~70% | List/reply + review info |
| IAP / subscriptions | ~50% | ~70% | One-time products + offers + purchases |
| Orders / refunds | N/A | ✅ typed | get / batch / refund / voided |
| Signing / devices | ~60% | N/A | Apple certs/profiles/devices |
| Analytics / vitals | ~30% | Escape | Play Reporting is a separate API product |
| Escape hatch | ✅ | ✅ | Full surface |
| Multi-project | ✅ | ✅ | `select_project` + `project` arg |
| Orchestrator | ✅ | ✅ | Snapshot, intents, plugins |

---

## Console-only (cannot be 100% API)

These remain Play Console / ASC UI (no public API). Documented by
`google_get_first_launch_checklist` / `apple_get_first_launch_checklist`:

- Google: content rating (IARC), ads declaration, target audience, news/COVID/gov apps, app access credentials, financial features
- Apple: IPA binary upload (Transporter/EAS), agreements/tax/banking, full App Privacy nutrition labels (partial API)

---

## Remaining typed-tool backlog (P2 — escape already works)

| # | Platform | Gap | Strategy |
|---|---|---|---|
| 1 | Google | Play Developer Reporting (crashes/ANR) | Separate client + scope |
| 2 | Apple | Subscription pricing / localizations | Typed |
| 3 | Apple | Custom Product Pages / In-App Events | Typed or escape |
| 4 | Apple | Game Center / App Clips | Escape/plugin |
| 5 | Apple | Finance / sales reports | Toolset + role warning |
| 6 | Both | Video preview upload | Workflow + storage |

---

## Escape hatch safety

### `apple_api_call`

- Path must match `^/v[12]/[\w./-]+$`
- `GET` allowed without confirm
- `POST`, `PATCH`, `DELETE` require `confirm: true`

### `google_api_call`

- Resource path like `edits.tracks.list` or `applications.dataSafety`
- `get` / `list` / `batchget` allowed without confirm
- Mutating methods require `confirm: true`

---

## What “100%” means here

1. **Every public Android Publisher v3 method** → typed OR `google_api_call`
2. **Every ASC REST path** → typed OR `apple_api_call`
3. **Honest Console-only list** for first-launch policy forms with no API
