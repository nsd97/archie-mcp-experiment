## Operations Center — Developer Docs

Welcome. This repo is a small, self-contained prototype of an Operations Center. It is a React (Vite) frontend that talks to a local Express mock API and shows listings and tasks in simple boards and queues.

- For a 5-minute setup, read [setup.md](./setup.md)
- For the big picture, read [architecture.md](./architecture.md)
- Take the guided [code tour](./code-tour.md)
- See the API contract in [api.md](./api.md)
- Learn how to extend the task screens in [extending.md](./extending.md)

### TL;DR quickstart

```bash
npm install
npm run mock-server     # starts Express mock API on :8080
npm run dev             # starts Vite dev server (default :5173)
```

Then open the app at `http://localhost:5173` (or the URL Vite prints). The mock API runs at `http://localhost:8080`.

### Architecture diagram

See [docs/diagrams/component.md](./diagrams/component.md) or the embedded version in [architecture.md](./architecture.md#diagrams).

### Onboarding path

- Day 0: read this README and run the quickstart
- Day 1: follow the [code tour](./code-tour.md)
- Day 2: complete the hands-on exercise in [extending.md](./extending.md)

More references:

- [Glossary](./glossary.md)
- [FAQ](./faq.md)
