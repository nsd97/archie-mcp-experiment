## Component diagram (Mermaid)

```mermaid
flowchart LR
  Browser[React Frontend (Vite)] -->|GET /v1/operations/state| MockAPI[[Express Mock API]]
  Browser --> UIComp[Tasks & Screens Renderer]
  UIComp --> Templates[[shared/category-templates.json]]
  MockAPI --> Store[(In-memory Store)]
  Browser -->|POST /v1/operations/tasks/:id/claim| MockAPI
  Browser -->|POST /v1/operations/tasks/:id/outputs| MockAPI
  Browser -->|POST /v1/operations/tasks/:id/done| MockAPI
```
