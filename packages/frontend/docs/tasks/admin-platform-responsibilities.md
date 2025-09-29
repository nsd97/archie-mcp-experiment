## Admin and Platform Responsibilities (ArchieOS)

This document lists what the platform does for users and what admins do for users, derived strictly from the referenced specification of ArchieOS.

### What the Platform Does for Users (System Behaviors)

- **Understands context**: Knows clients, teammates, properties, and statuses without being told.
- **Catches intent**: Natural-language directives (e.g., “Tell Sarah to call the new client”) become fully formed tasks that are assigned, briefed, tracked, and confirmed in plain English.
- **Runs playbooks**: Detects when a listing is in motion and proposes kicking off the listing checklist; on approval, launches predefined steps with due dates and owners.
- **Keeps a living CRM**: Continuously updates contacts, notes, and history in the background; syncs with Apple Contacts (names, numbers, emails), using Notes as an append-only narrative log while the internal database remains source of truth.
- **Speaks human**: Uses natural, concise, conversational language; no training required.
- **Proactive operations**: Listens across channels and moves first, then asks for quick confirmation via SMS/iMessage.

Channels and ingestion (unified event stream):
> Important consent note: ArchieOS does not monitor all iMessages or texts. It only ingests conversations where the agent has explicitly added ArchieOS to the group chat with the client, messages sent directly to the dedicated ArchieOS number, and designated emails. Call recordings are transcribed only for numbers within that invited scope.
- **Email** via server-side ingestion.
- **SMS/iMessage** via a single provider (SendBlue) to a dedicated ArchieOS number; group chats are the front door and adding ArchieOS enables listening across channels for that contact.
- **Chat screencaps** via attachment (processed directly by the orchestrator).
- **Call recordings** via carrier API; transcribed only for numbers explicitly included with ArchieOS in group chats (same consent rule applies to email).
- Events flow through an **API Gateway** to ingestion functions (Messaging/Email/Call Ingest) and into a **Unified Event Bus (SQS)**.

Understanding and decisioning:
- **LLM understanding layer** classifies each event as: task, note, contact update, playbook trigger, or FYI.
- **Context extraction** (people, companies, properties, dates, commitments) writes to a background CRM synchronized with Apple Contacts via CloudKit.
- **Human-in-the-loop approvals**: quick confirms with agents via SMS/iMessage for tasks and triggers; lightweight admin review on sensitive updates.

Acting with clarity:
- **Tasking**: Creates and routes tasks to the Operations Center with auto-generated briefs (who/what/why/when/context).
- **Status back to agents**: Sends short, human updates via SMS/iMessage (never jargon).
- **Logging and auditability**: Mirrors events to Matrix (Synapse) so admins can view in Element as a short-term backup; all actions are auditable.

Sync and data services:
- **Live sync with Apple Contacts** (two-way via CloudKit): Contacts are the friendly window; the platform remains the source of truth.
- **Storage and retrieval**: Postgres + pgvector for data and embeddings; Redis for caching; Embedding service for semantic operations.

Outbound and delivery controls:
- **Single messaging provider (SendBlue)** for all outbound; no direct device messaging.
- **Delivery/read/typing** are controlled via provider webhooks; backend manages typing indicators and receipt acknowledgments.

Non‑negotiables and guardrails:
- **Natural language in/out**; default to **proactive**. Ask for permission, not instructions. Reduce steps, eliminate clicks.
- **Privacy and consent by design** with clear on/off scope per channel; no personal message monitoring. ArchieOS only ingests chats where it is explicitly invited, messages to the dedicated ArchieOS number, and designated emails.
- If a feature adds cognitive load, it is cut.

Metrics that matter (for system performance and quality):
- Time‑to‑acknowledge (seconds)
- Time‑to‑first‑action (minutes)
- Percentage of intents auto‑detected and confirmed
- Agent sentiment: “in control,” “clear,” “handled,” “wow.”

Admin-facing surfaces (system-provided):
- **Operations Center** (Admin Frontend) for task queues, briefs, and actions.
- **Element (Matrix client)** for mirrored event logs as a short-term backup/audit trail.

### What Admins Do for Users (Operational Duties)

- **Triage and manage the Operations Center queue**: review auto-generated briefs, prioritize, claim/assign, and ensure owners/due dates are clear.
- **Approve sensitive updates**: perform lightweight reviews before committing sensitive CRM/context changes.
- **Confirm/adjust system-proposed tasks**: respond to quick confirms and refine task details when necessary.
- **Trigger and oversee playbooks**: approve proposed checklist launches (e.g., listings) and monitor step execution to completion.
- **Monitor logs for trust and traceability**: use Element (Matrix) to review mirrored events when needed for audit/backup.
- **Enforce privacy and consent boundaries**: ensure only channels and contacts explicitly enabled (e.g., group chats including ArchieOS) are ingested; manage on/off scopes per channel.
- **Shepherd clean data sync**: watch for and resolve contact sync issues with Apple Contacts; keep Notes as the narrative log aligned with reality.
- **Communicate clearly with agents**: when manual intervention occurs, provide short, human updates (consistent tone; no jargon).
- **Help uphold non‑negotiables**: keep workflows natural-language, proactive, and low‑friction; cut steps that add cognitive load.
- **Support the metrics that matter**: operate to minimize time‑to‑acknowledge and time‑to‑first‑action, and maximize auto‑detection/confirmation and agent “handled” sentiment.

Scope notes and constraints (admin awareness):
- Listening and transcription apply only where ArchieOS is explicitly included (e.g., group chats, designated numbers/emails) to honor consent.
- All messaging to/from agents routes through SendBlue; delivery/read/typing are mediated by backend‑controlled webhooks.
- Attachments/audio/screenshots may go directly to the LLM orchestrator; outcomes are still logged and auditable.

### Recommended Landing Page Cards and Demo Modules (10)

1. **Think It. Text It. Done.**
   - *Demo:* A simple iMessage screen. You text: “Tell Sarah to get the keys for Main St.” A single checkmark appears. Done. No clutter, no confirmation. It just works.

2. **Your Next Listing, On Autopilot.**
   - *Demo:* Archie sends a single text: “Looks like 123 Main St is ready. Start the listing plan?” A single “Yes” button kicks off a clean, visual timeline of every step.

3. **Your Private Co-pilot.**
   - *Demo:* Show a group chat. When Archie is added, a simple, elegant ‘Listening’ indicator glows. You are always in control. Tap it, and it’s off. Simple.

4. **No New Apps. Ever.**
   - *Demo:* Your work happens where you already are: iMessage, Email and contacts. Show a split screen. An email comes in on the left, a task instantly appears on the right. Zero effort.

5. **The Invisible CRM.**
   - *Demo:* Show a standard Apple Contact card. As you text with a client, the Notes field automatically builds a perfect timeline of your relationship. You do nothing. It’s just there.

6. **Your Team, In Sync.**
   - *Demo:* A beautifully simple board shows every task for a listing. When a task is done, it smoothly animates to ‘Complete.’ Everyone sees it. No meetings, no questions.

7. **It Speaks Human.**
   - *Demo:* Archie sends a text: “All set. Photos are booked for Tuesday at 10am.” Clean, simple, and exactly what you’d say. No corporate jargon.

8. **Proactive, Not Reactive.**
   - *Demo:* An alert pops up: “The Robinson inspection is tomorrow. Need me to confirm with the agent?” It’s already thinking ahead for you.

9. **Zero Training.**
   - *Demo:* Just talk to it. Text it like you would a person. There are no commands to learn. It’s completely intuitive.

10. **The Feeling of ‘Handled’.**
    - *Demo:* A montage of quick texts and instant checkmarks. The feeling is calm, in control, and confident. This isn't software. It's peace of mind.


