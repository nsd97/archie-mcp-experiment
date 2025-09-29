## Extending the app: add a new task template

Goal: Define a new task that renders outputs using the Tasks & Screens system under `src/lib/tasks` and flows through the mock data.

### Before you start

- Do not change identifiers, file locations, or runtime logic.
- Test against the mock server only.

### Steps

1) Add a template entry in `shared/category-templates.json` under a category (e.g., `SALES_LISTING_ACTIVE`). Keep `key`, `title`, `defaultType`, and optional `resources` and `outputs`.
2) The frontend ingests templates via `src/components/operations-center/templates.ts`.
3) `src/lib/tasks/definitions.ts` builds `DefinedTask` screens from templates.
4) Open a listing with that category. You should see the new task.

### Minimal example (JSON template)

```json
{
  "SALES_LISTING_ACTIVE": [
    {
      "key": "sale-active-publish-listing",
      "title": "Publish Listing",
      "defaultType": "PUBLISH",
      "outputs": [
        { "key": "publish_url", "label": "Publish URL", "kind": "text" },
        { "key": "legal_confirm", "label": "Legal Approved", "kind": "checkbox" }
      ]
    }
  ]
}
```

### Realistic example (with resources)

```json
{
  "SALES_LISTING_ACTIVE": [
    {
      "key": "sale-active-draft-mls",
      "title": "Draft MLS Copy",
      "defaultType": "COPYWRITING",
      "resources": ["Brand voice guide", "Address details"],
      "outputs": [
        { "key": "mls_headline", "label": "MLS Headline", "kind": "text" },
        { "key": "mls_copy", "label": "MLS Description", "kind": "text" }
      ]
    }
  ]
}
```

This will render:

- A Resources section (markdown) auto-populated from `resources`.
- Inputs for each output field.
- A Notes field appended by `definitions.ts`.

### Safety checks

- Keep `key` stable; it is used to link outputs.
- Do not rename existing keys; add new ones instead.
- Verify you can claim the new task and update outputs without errors.
- Revert changes if the UI or mock server fails to load.
