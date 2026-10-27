# Tools reference

**~155+ typed MCP tools** + escape hatches that reach **100% of public store APIs**.

- iOS typed · Android typed · shared · **11 orchestrator** (incl. multi-project) · catalogs · first-launch
- Every Android Publisher v3 method → `google_list_api_catalog` / `google_api_call`
- Every ASC `/v1|/v2` path → `apple_list_api_catalog` / `apple_api_call`
- Multi-project: pass `project: "my-app"` on any tool — see [MULTI_PROJECT.md](./MULTI_PROJECT.md)

> Copy [`storepilot.example.yaml`](../storepilot.example.yaml) → `storepilot.yaml` in your app repo.  
> Golden path: [DEMO.md](./DEMO.md) · Compare: [COMPARISON.md](./COMPARISON.md)

> Use `MCP_TOOLSET=all` (default), `release`, or `readonly`. See [TOOLSETS.md](./TOOLSETS.md).

## Response format

Successful calls return:

```json
{
  "success": true,
  "data": { ... }
}
```

Failures return structured errors with `code`, `retryable`, and `suggestion`.

## Confirmation required

Destructive tools require `"confirm": true` when **`dryRun` is false** (or when the tool has no dry-run mode).

Workflow tools (`promote_release`, `configure_rollout`, `execute_release_intent`, `create_tester_group`) default to **`dryRun: true`** — preview without `confirm`.

Other destructive tools (no dry-run):

- `trigger_full_release`
- `apple_submit_for_review`, `apple_submit_for_beta_review`
- `apple_delete_*`, `apple_remove_*`, `apple_revoke_*`, `apple_disable_capability`
- `google_delete_*`, `google_halt_release`, upload tools without dry-run
- `google_set_data_safety`, `google_refund_order`, `google_create_user`, …

---

## Orchestrator / StorePilot

High-level release workflows. **`dryRun` defaults to `true`** where applicable.

| Tool | Category | Description |
|---|---|---|
| `load_project` | read | Load `storepilot.yaml` + memory; sets active session |
| `list_projects` | read | Multi-app registry (`STOREPILOT_PROJECTS`, `STOREPILOT_PROJECTS_DIR`, …) |
| `select_project` | read | Switch active app by slug / name / package / appId |
| `resolve_project` | read | Resolve without switching session |
| `get_active_project` | read | Show active project + registry |
| `get_release_snapshot` | read | Production vs candidate, blockers, next actions |
| `explain_release_blockers` | read | Human-readable release guidance |
| `execute_release_intent` | release | Unified intent: `rollout_production`, `promote_to_production`, `submit_for_review`, `configure_rollout` |
| `create_tester_group` | release | TestFlight group + Play track testers |
| `promote_release` | release | Android track promotion or iOS submit for review |
| `configure_rollout` | release | Staged rollout % (Android) or phased release (iOS) |

## Escape hatch, catalogs & first launch

| Tool | Category | Description |
|---|---|---|
| `apple_list_api_catalog` | read | ASC endpoints by category |
| `apple_get_first_launch_checklist` | read | First App Store submission guide |
| `google_list_api_catalog` | read | **Every** androidpublisher v3 method |
| `google_get_first_launch_checklist` | read | First Play deployment (API vs Console-only) |
| `apple_get_version_review_info` | read | Review submission + contact details for a version |
| `apple_list_version_review_info` | read | Review info for recent versions of an app |
| `apple_api_call` | admin | Raw ASC API (`GET` free; writes need `confirm: true`) |
| `google_upload_bundle` | release | Upload AAB (auto commit optional) |
| `google_upload_apk` | release | Upload APK to an edit |
| `google_upload_and_release` | release | Upload AAB + assign track + commit (one workflow) |
| `google_upload_deobfuscation_file` | release | ProGuard/R8 mapping upload |
| `google_list_subscriptions` | read | Play subscriptions catalog (v2 API) |
| `google_get_subscription` | read | Single subscription by product ID |
| `google_upload_internal_sharing_apk` | release | Internal App Sharing APK |
| `google_upload_internal_sharing_bundle` | release | Internal App Sharing AAB |
| `google_api_call` | admin | Raw Play API via dot notation (`get`/`list` free) |
| `google_set_data_safety` | admin | Data Safety / Safety Labels declaration |
| `google_get/refund_order` | admin | Orders + refunds |
| `google_list_voided_purchases` | read | Voided purchases |
| `google_upload_expansion_file` | admin | OBB expansion files |

## Apple — TestFlight & compliance (v1.0 highlights)

| Tool | Category | Description |
|---|---|---|
| `apple_set_beta_group_public_link` | release | Enable/disable TestFlight public link |
| `apple_get_submission_readiness` | read | Preflight checklist before submit |
| `apple_upload_screenshot` / `apple_upload_screenshots` | release | Screenshot binary upload flow |
| `apple_get/set_content_rights` | read/release | Content rights declaration |
| `apple_get/set_export_compliance` | read/release | Export compliance on version |

---

## Shared tools (4)

| Tool | Category | Description |
|---|---|---|
| `list_pending_webhooks` | read | List EAS/GitHub webhook events. Includes `mappedTargets` when `EAS_PROJECT_MAPPINGS` is set. |
| `mark_webhook_processed` | release | Mark a webhook event as handled |
| `get_release_status` | read | Unified release status (uses temporary Google edit, auto-cleaned) |
| `trigger_full_release` | release, destructive | Full iOS/Android release flow. Requires `confirm: true`. |

---

## Apple — Apps & builds (6)

| Tool | Category | Description |
|---|---|---|
| `apple_list_apps` | read | List apps (paginated). Filter by bundleId, name |
| `apple_get_app` | read | App details with App Store versions |
| `apple_list_builds` | read | List builds (paginated). Filter by version, processing state |
| `apple_get_build` | read | Build details |
| `apple_list_app_versions` | read | App Store versions with state/platform filters |
| `apple_get_review_status` | read | Review status for a version |

## Apple — Versions & releases (6)

| Tool | Category | Description |
|---|---|---|
| `apple_create_app_version` | release | Create App Store version (iOS, macOS, tvOS) |
| `apple_assign_build_to_version` | release | Link build to version |
| `apple_set_release_type` | release | Manual, after approval, or scheduled release |
| `apple_set_phased_release` | release | 7-day phased rollout |
| `apple_submit_for_review` | destructive | Submit to App Review. Requires `confirm: true` |
| `apple_set_app_pricing` | admin | Set pricing tier |

## Apple — TestFlight (5)

| Tool | Category | Description |
|---|---|---|
| `apple_create_beta_group` | admin | Create beta group |
| `apple_list_beta_groups` | read | List beta groups |
| `apple_add_build_to_beta_group` | admin | Assign build to group |
| `apple_add_beta_testers` | admin | Add testers by email |
| `apple_submit_for_beta_review` | destructive | External TestFlight review. Requires `confirm: true` |

## Apple — Metadata (4)

| Tool | Category | Description |
|---|---|---|
| `apple_update_app_localizations` | metadata | Update localized metadata |
| `apple_set_release_notes` | release | Set release notes for locales |
| `apple_get_app_info` | read | App info, categories, age rating |
| `apple_update_age_rating` | metadata | Update age rating |

## Apple — App info & categories (5)

| Tool | Category | Description |
|---|---|---|
| `apple_set_app_category` | metadata | Primary/secondary categories |
| `apple_list_app_categories` | read | Available categories |
| `apple_list_territories` | read | Available territories |
| `apple_get_app_availability` | read | Territory availability |
| `apple_get_price_tiers` | read | App price points by territory (requires `appId`) |

## Apple — Analytics (5)

| Tool | Category | Description |
|---|---|---|
| `apple_request_analytics_report` | read | Request analytics report |
| `apple_list_analytics_report_requests` | read | List report requests |
| `apple_get_analytics_reports` | read | Reports for a request |
| `apple_get_analytics_report_instances` | read | Date-specific snapshots |
| `apple_get_analytics_report_segments` | read | Downloadable segment URLs |

## Apple — IAP (5)

| Tool | Category | Description |
|---|---|---|
| `apple_list_in_app_purchases` | read | List IAPs |
| `apple_get_in_app_purchase` | read | IAP details |
| `apple_create_in_app_purchase` | admin | Create IAP |
| `apple_update_in_app_purchase` | admin | Update IAP |
| `apple_delete_in_app_purchase` | destructive | Delete IAP. Requires `confirm: true` |

## Apple — Subscriptions (4)

| Tool | Category | Description |
|---|---|---|
| `apple_list_subscription_groups` | read | List subscription groups |
| `apple_create_subscription_group` | admin | Create group |
| `apple_list_subscriptions` | read | Subscriptions in a group |
| `apple_create_subscription` | admin | Create auto-renewable subscription |

## Apple — Users (6)

| Tool | Category | Description |
|---|---|---|
| `apple_list_users` | read | Team members |
| `apple_get_user` | read | User details |
| `apple_update_user_roles` | admin | Update roles |
| `apple_remove_user` | destructive | Remove user. Requires `confirm: true` |
| `apple_invite_user` | admin | Invite user |
| `apple_list_user_invitations` | read | Pending invitations |

## Apple — Certificates & profiles (7)

| Tool | Category | Description |
|---|---|---|
| `apple_list_certificates` | read | Signing certificates |
| `apple_get_certificate` | read | Certificate details |
| `apple_revoke_certificate` | destructive | Revoke certificate. Requires `confirm: true` |
| `apple_list_profiles` | read | Provisioning profiles |
| `apple_get_profile` | read | Profile details |
| `apple_create_profile` | admin | Create profile |
| `apple_delete_profile` | destructive | Delete profile. Requires `confirm: true` |

## Apple — Devices (3)

| Tool | Category | Description |
|---|---|---|
| `apple_list_devices` | read | Registered devices |
| `apple_register_device` | admin | Register device |
| `apple_update_device_status` | admin | Enable/disable device |

## Apple — Bundle IDs (5)

| Tool | Category | Description |
|---|---|---|
| `apple_list_bundle_ids` | read | Bundle IDs |
| `apple_get_bundle_id` | read | Bundle ID with capabilities |
| `apple_register_bundle_id` | admin | Register bundle ID |
| `apple_enable_capability` | admin | Enable capability |
| `apple_disable_capability` | destructive | Disable capability. Requires `confirm: true` |

## Apple — Reviews (4)

| Tool | Category | Description |
|---|---|---|
| `apple_list_customer_reviews` | read | Customer reviews |
| `apple_get_customer_review` | read | Review with response |
| `apple_respond_to_review` | admin | Post developer response |
| `apple_delete_review_response` | destructive | Delete response. Requires `confirm: true` |

## Apple — Screenshots (4)

| Tool | Category | Description |
|---|---|---|
| `apple_list_screenshot_sets` | read | Screenshot sets for a version locale |
| `apple_list_screenshots` | read | Screenshots in a set |
| `apple_upload_screenshot` | release | Upload one screenshot (confirm required) |
| `apple_upload_screenshots` | release | Upload multiple screenshots (confirm required) |

## Apple — Compliance & preflight (5)

| Tool | Category | Description |
|---|---|---|
| `apple_get_content_rights` | read | Third-party content declaration |
| `apple_set_content_rights` | destructive | Set content rights (confirm required) |
| `apple_get_export_compliance` | read | Build encryption / export settings |
| `apple_set_export_compliance` | destructive | Declare usesNonExemptEncryption (confirm required) |
| `apple_get_submission_readiness` | read | Preflight before App Store submit |

---

## Google — Edits (3)

| Tool | Category | Description |
|---|---|---|
| `google_create_edit` | release | Start edit session |
| `google_commit_edit` | release | Commit changes |
| `google_validate_edit` | release | Validate without committing |

## Google — Tracks & releases (7)

| Tool | Category | Description |
|---|---|---|
| `google_list_tracks` | read | All tracks and releases |
| `google_update_track` | release | Update track with new release |
| `google_promote_release` | release | Promote between tracks |
| `google_set_rollout_fraction` | release | Staged rollout percentage |
| `google_halt_release` | destructive | Halt rollout. Requires `confirm: true` |
| `google_set_release_notes` | release | Set release notes |
| `google_create_release` | release | Create release (manages edits) |

## Google — Listings (5)

| Tool | Category | Description |
|---|---|---|
| `google_list_listings` | read | Store listings |
| `google_get_listing` | read | Listing for a language |
| `google_create_listing` | metadata | Create listing |
| `google_update_listing` | metadata | Update listing |
| `google_get_app_details` | read | App-level details |

## Google — App details (4)

| Tool | Category | Description |
|---|---|---|
| `google_update_app_details` | metadata | Contact info, default language |
| `google_list_bundles` | read | Uploaded AABs |
| `google_list_apks` | read | Uploaded APKs |
| `google_get_country_availability` | read | Country availability |

## Google — Images (3)

| Tool | Category | Description |
|---|---|---|
| `google_upload_image` | metadata | Upload screenshot/graphic |
| `google_list_images` | read | List images by type |
| `google_delete_all_images` | destructive | Delete all images of type. Requires `confirm: true` |

## Google — Reviews (3)

| Tool | Category | Description |
|---|---|---|
| `google_list_reviews` | read | User reviews |
| `google_get_review` | read | Specific review |
| `google_reply_to_review` | admin | Reply to review |

## Google — In-app products (5)

| Tool | Category | Description |
|---|---|---|
| `google_list_in_app_products` | read | List products |
| `google_get_in_app_product` | read | Product by SKU |
| `google_create_in_app_product` | admin | Create product |
| `google_update_in_app_product` | admin | Update product |
| `google_delete_in_app_product` | destructive | Delete product. Requires `confirm: true` |

## Google — Testers (2)

| Tool | Category | Description |
|---|---|---|
| `google_get_testers` | read | Track testers |
| `google_update_testers` | admin | Update tester groups |

---

## MCP resources

| URI | Description |
|---|---|
| `webhook://events` | All webhook events (from disk) |
| `webhook://pending` | Unprocessed webhook events |
