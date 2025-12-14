# Jazz.tools LLM Playbook — Correct-by-Construction Reference

**Audience:** a code-generating LLM. **Goal:** emit *only* idiomatic Jazz code and architecture. **Assumption:** you tend to revert to web/REST conventions. This guide rewrites those instincts.

---

## Ground Rules (Never Violate)

1. **Single source of truth = CoValues.** Do not introduce Redux/Zustand, client caches, or custom stores. Subscribe to CoValues; update via `$jazz` methods.
2. **No REST or `fetch` for app data.** Use Jazz providers, hooks, and workers. HTTP exists *only* as a transport to a **Server Worker** defined by `experimental_defineRequest`.
3. **Direct mutation uses `$jazz`.** Use `$jazz.set`, `$jazz.applyDiff`, and list helpers like `$jazz.push` / `$jazz.splice` / `$jazz.remove` / `$jazz.retain`; do not invent `PATCH`/`PUT` APIs.
4. **Tri-state semantics are mandatory:** `undefined` = loading; `null` = not found/forbidden; instance = ready. Always branch on these before access.
5. **Pass IDs down; subscribe locally.** Never pass live CoValue objects through props.
6. **Permissions live in Groups.** To share, change group membership; don’t write ad‑hoc ACLs or client-side authorization.
7. **Resolve depth explicitly.** Request only what you need via `resolve` / deep loading; never assume transitive availability.
8. **SSR is read-only unless you create an agent.** With `enableSSR`, hooks return `null`. Use `createSSRJazzAgent` when you must load on the server.
9. **One Worker instance per server recommended.** Treat the worker like `me` on the server; keep credentials secret; avoid multi-instance state races.
10. **Environment constraints:** Node ≥ 20; keep provider names correct per runtime; don’t mix packages across web/RN/Expo.

---

## Canonical Project Shapes

### React (Web)

* Wrap the app in `<JazzReactProvider sync={{ peer: "wss://cloud.jazz.tools/?key=..." }} AccountSchema={MyAccount} />` from `jazz-tools/react`.
* Use `useAccount(MyAccount)` for the signed-in user and personal root; use `useCoState(Schema, id, { resolve })` for shared/public data.
* In components: branch on loading/not-found states before reading; mutate via `$jazz`; subscribe shallow by default, deepen with `resolve` as needed.

**Minimal composition pattern**

```tsx
// schema.ts
export const Task = co.map({
  title: z.string(),
  status: z.enum(["todo","doing","done"]),
});
export const Root = co.map({ tasks: co.list(Task) });
export const Account = co.account({ root: Root, profile: co.profile() });

// app boot (React)
import { JazzReactProvider } from "jazz-tools/react";
createRoot(document.getElementById("root")!).render(
  <JazzReactProvider sync={{ peer: PEER }} AccountSchema={Account}>
    <App />
  </JazzReactProvider>
);

// usage
function TaskView({ id }: { id: string }) {
  const task = useCoState(Task, id); // shallow
  if (task === undefined) return <Spinner/>;
  if (task === null) return <NotFound/>;
  return (
    <input value={task.title} onChange={(e) => task.$jazz.set("title", e.target.value)} />
  );
}
```

### Next.js SSR

* `enableSSR` renders with an *empty agent*; all `useCoState/useAccount` return `null` server-side.
* For server data render, construct a shared read-only agent: `const jazzSSR = createSSRJazzAgent({ peer })`, then `await Schema.load(id, { loadAs: jazzSSR })` in Server Components. Do **not** mutate on the server in this path.

### React Native / Expo

* Use the runtime-specific providers: `<JazzReactNativeProvider/>` or `<JazzExpoProvider/>`. Respect required polyfills/crypto providers. Use the same hooks contract; do not import web providers into RN.

---

## Subscription & Loading — Correct Usage

**Manual**

```ts
const unsub = Schema.subscribe(
  id,
  { resolve: { /* ... */ } },
  (cv) => {
    /* react to updates */
  },
);
unsub();
```

**React hooks**

```tsx
const project = useCoState(Project, projectId, {
  resolve: { tasks: { $each: true } },
});
if (project === undefined) return <Loading/>;
if (project === null) return <NotFound/>;
return project.tasks.map((t) => <TaskRow key={t.$jazz.id} id={t.$jazz.id} />);
```

Rules:

* Subscribe at leaf components; pass IDs; avoid prop‑drilling live CoValues.
* Default to shallow; opt‑in to `resolve` for nested data.
* Never assume availability of transitive children without `resolve` or a follow-up subscription.
* Always load data explicitly: do not rely on a reference “already being loaded” due to some other subscription.

Resolve query cheat-sheet:

```ts
// Shallow: omit `resolve`
await Project.load(projectId);

// Load a referenced CoValue shallowly
await Project.load(projectId, { resolve: { tasks: true } });

// Load list items
await Project.load(projectId, { resolve: { tasks: { $each: true } } });

// Handle inaccessible items/references without failing the whole load
await Project.load(projectId, {
  resolve: {
    tasks: {
      $each: {
        $onError: null,
        description: { $onError: null },
      },
      $onError: null,
    },
  },
});
```

When you have a CoValue instance but it’s not loaded deeply enough, load more explicitly:

```ts
const project = await Project.load(projectId, { resolve: true });
if (!project) return;
const projectWithTasks = await project.$jazz.ensureLoaded({
  resolve: { tasks: { $each: true } },
});
```

Selectors (render perf):

* Prefer `useCoStateWithSelector` / `useAccountWithSelector` for derived UI state.
* Keep selectors cheap; for expensive work, select stable IDs/refs and compute in `useMemo`.

---

## Writing Data — The Only Valid Patterns

**Maps**

```ts
item.$jazz.set("title", "New"); // last-writer-wins on fields
```

**Lists**

```ts
list.$jazz.push(item);       // ordered inserts with CRDT ordering
list.$jazz.splice(i, 1);
```

**Feeds (append-only)**

```ts
feed.$jazz.append(event);
```

**Text**

```ts
text.$jazz.insert(pos, "abc");
text.$jazz.delete(start, len);
```

Do not batch through custom reducers or REST; mutate directly.

---

## Permissions & Sharing

* Every CoValue has an owning **Group** (`$jazz.owner`).
* To grant access: `await group.addMember(account, role)` where `role ∈ { reader, writer, admin }`.
* Use group hierarchy with `child.extend(parent)` for inherited access.
* Share links are *just IDs* gated by permissions; never encode secrets in URLs.

```ts
const g = Group.create();
const doc = Document.create({ title: "Spec" }, g);
await g.addMember(targetAccount, "writer");
```

---

## Server Workers — Two Communication Modes

### 1) HTTP (recommended)

Define a typed request **schema** and handler; clients call through a function, not `fetch`.

```ts
export const bookTicket = experimental_defineRequest({
  url: "/api/book-ticket",
  workerId: process.env.NEXT_PUBLIC_JAZZ_WORKER_ACCOUNT!,
  request: { schema: { event: Event }, resolve: { event: { reservations: true } } },
  response:{ schema: { ticket: Ticket }, resolve: { ticket: true } },
});

// Next.js route
export async function POST(req: Request) {
  return bookTicket.handle(req, jazzServer.worker, async ({ event }, madeBy) => {
    const ticketGroup = Group.create(jazzServer.worker);
    const ticket = Ticket.create({ account: madeBy, event }, ticketGroup);
    await ticketGroup.addMember(madeBy, "reader");
    event.reservations.$jazz.push(ticket);
    return { ticket };
  });
}

// Worker boot
export const jazzServer = await startWorker({
  syncServer: PEER,
  accountID: process.env.JAZZ_WORKER_ACCOUNT!,
  accountSecret: process.env.JAZZ_WORKER_SECRET!,
});
```

Use when you need immediate responses, serverless scaling, standard Request/Response.

### 2) Inbox (offline-friendly, message-based)

Client sends typed messages; Worker subscribes and returns values.

```ts
// schema
export const BookTicketMessage = co.map({ type: co.literal("bookTicket"), event: Event });

// worker
const { worker, experimental: { inbox } } = await startWorker({...});
inbox.subscribe(BookTicketMessage, async (msg, senderID) => {
  const madeBy = await co.account().load(senderID, { loadAs: worker });
  const { event } = await msg.$jazz.ensureLoaded({
    resolve: { event: { reservations: true } },
  });
  const g = Group.create(worker);
  const ticket = Ticket.create({ account: madeBy, event }, g);
  await g.addMember(madeBy, "reader");
  event.reservations.$jazz.push(ticket);
  return ticket; // syncs back via Jazz
});

// client (React)
const sendInboxMessage = experimental_useInboxSender(WORKER_ID);
await sendInboxMessage(BookTicketMessage, { type: "bookTicket", event });
```

**Choosing:** Prefer HTTP unless you need offline queuing, persistent message history, or to avoid public endpoints.

---

## SSR & Agents

* With `<JazzReactProvider enableSSR>` the server render uses an *empty* agent: hooks return `null`. Do not read fields; gate UI or fetch with a **server agent**.
* For server reads, create once and reuse: `const jazzSSR = createSSRJazzAgent({ peer })`; then `await Schema.load(id, { loadAs: jazzSSR })`.

---

## Schema & Types — LLM Emission Rules

* Always define schemas with `co` + `z`. Prefer `z.enum([...])` over wide `string`.
* Zod schemas compose only with Zod; CoValue schemas compose with Zod or other CoValues. Do not wrap CoValues with `z.optional()` or `z.discriminatedUnion()`; use CoValue-side combinators instead (e.g. `co.optional(Subschema)`, see Unions docs).
* Use `co.list(Subschema)` for ordered collections; `co.feed(Subschema)` for append‑only logs; `co.text()` for collaborative text.
* Derive loaded types with `type T = co.loaded<typeof Schema>`; you can pass a second argument to constrain depth, mirroring `resolve` (e.g. `co.loaded<typeof Project, { tasks: { $each: true } }>`).
* Evolve with **optional** fields to remain backward compatible; for CoValue fields prefer `co.optional(Subschema)` rather than `z.optional(Subschema)`.
* CoValue schema types live under the `co.` namespace. If you need explicit types in recursive scenarios, use `co.List<typeof S>`, `co.Map<...>` etc.
* CoMap schema helpers:
  - Use `Schema.partial()` to make all fields optional (optionally: a subset of keys).
  - Use `Schema.pick({ field: true, ... })` to create a schema with only selected fields.
  - Do **not** assume Zod methods (like `.extend()`) exist on CoMap schemas; use `pick/partial`, or create a new schema explicitly.
* Use `Schema.shape` and `ListSchema.element` rather than `Schema.def.shape`.

---

## CoMaps & CoLists — Patterns & APIs

### CoMaps (struct-like vs record-like)

* Prefer **struct-like** `co.map({ ...fixedFields })` for “entities” with known fields.
* Prefer **record-like** `co.record(keySchema, valueSchema)` for dynamic key/value collections.

```ts
const Project = co.map({
  name: z.string(),
  startDate: z.date(),
  status: z.enum(["planning", "active", "completed"]),
  coordinator: co.optional(Member),
});

const Inventory = co.record(z.string(), z.number());
```

### Creation, ownership, and uniqueness

* Create CoValues with an explicit `owner` when sharing is expected.
* Use `unique` for deterministic IDs (slugs / well-known names): load via `Schema.loadUnique`, or create+load via `Schema.upsertUnique`.

```ts
const g = Group.create();
const project = Project.create({ name: "My Project", startDate: new Date(), status: "active" }, { owner: g });

await Task.upsertUnique({
  value: { text: "Let's learn some Jazz!" },
  unique: "learning-jazz",
  owner: project.$jazz.owner,
});
```

### Updates, deletions, and soft-delete

* Update fields with `$jazz.set(field, value)`.
* For **record** maps: remove a key with `$jazz.delete(key)`.
* For optional fields in struct-like maps: remove by setting `undefined`.
* Prefer soft-delete (`deleted: z.optional(z.boolean())`) when you need recovery/auditing.

```ts
inventory.$jazz.delete("basil");
project.$jazz.set("coordinator", undefined);
```

### Recursive references (schemas)

* Use getters to define circular/recursive schemas; add an explicit return type if inference fails.

```ts
const Project = co.map({
  name: z.string(),
  get subProjects(): co.Optional<co.List<typeof Project>> {
    return co.optional(co.list(Project));
  },
});
```

### CoLists (mutation API lives under `$jazz`)

```ts
tasks.$jazz.push({ title: "Install irrigation", status: "todo" }); // implicit CoValue creation
tasks.$jazz.remove((t) => t.title === "Old");
tasks.$jazz.retain((t) => !t.deleted);
tasks.$jazz.splice(0, 1);
```

### Set-like collections (use record maps)

If you need uniqueness, prefer a `co.record()` keyed by a stable ID (often a CoValue’s `$jazz.id`) instead of a `co.list()`:

```ts
const Chat = co.map({
  participants: co.record(z.string(), MyAppUser), // key by `$jazz.id`
});

// After gating:
chat.participants.$jazz.set(me.$jazz.id, me);
const participantIds = Object.keys(chat.participants);
const participantAvatars = Object.values(chat.participants)
  .filter((u): u is MyAppUser => u !== undefined && u !== null)
  .map((u) => u.profile.avatar);
```

---

## Large Data & Performance

* Keep subscriptions shallow at list level; render items via child components that subscribe to each item.
* Virtualize long lists at the UI level; never attempt to bulk-load thousands of children via one deep `resolve`.
* Debounce high‑frequency text edits only at the UI boundary if necessary; do **not** buffer writes elsewhere.

---

## Error/Loading/Access Patterns (Emit Exactly)

```tsx
const cv = useCoState(S, id, { resolve });
if (cv === undefined) return <Loading/>;     // still loading
if (cv === null) return <DeniedOrMissing/>;  // not found or no access
// safe to render & mutate
```

**Never** access fields before those guards. **Never** swallow `null` by inventing placeholder objects.

---

## Anti‑Patterns → Rewrites

* ❌ `fetch('/api/x')` → ✅ `useCoState` / request via typed `experimental_defineRequest`.
* ❌ Lifting CoValues into a global store → ✅ derive UI state locally from subscribed CoValues.
* ❌ Passing CoValue instances through props → ✅ pass IDs; subscribe where used.
* ❌ Writing custom ACLs → ✅ manipulate Groups and membership.
* ❌ Server mutates in SSR render → ✅ server uses `createSSRJazzAgent` for read-only; mutations go through Worker handlers.
* ❌ Deep eager resolves by default → ✅ start shallow; add `resolve` intentionally.

---

## LLM Self‑Check (Run before finalizing code)

1. Provider matches runtime (Web vs RN vs Expo) and uses Node ≥ 20.
2. All data access uses hooks or subscriptions; tri-state guards present.
3. No ad-hoc network calls for app data.
4. Mutations are direct field/list operations on CoValues.
5. Permissions adjusted via Groups only.
6. Deep loading specified only where needed.
7. Server code uses a single Worker; credentials from env; no secrets in client.
8. SSR uses `createSSRJazzAgent` when reading server-side.

---

## Micro-Recipes

**Create and link**

```ts
const g = Group.create();
const project = Project.create({ name: "P" }, { owner: g });
me.root.projects.$jazz.push(project);
```

**Share with writer access**

```ts
await project.$jazz.owner.addMember(targetAccount, "writer");
```

**Deep-read on server with agent**

```ts
const agent = createSSRJazzAgent({ peer: PEER });
const item = await Item.load(id, { loadAs: agent });
```

**Typed HTTP request from client**

```ts
const res = await bookTicket.request({ event });
const ticket = res.ticket; // resolved per schema
```

---

## Glossary (Map your old habits → Jazz)

* REST `GET` → `useCoState(Schema, id)`
* REST `POST` → direct mutation OR typed request to Worker
* Global store → CoValues + subscriptions
* JWT role checks → Group membership & roles
* ORM models → `co.*` schemas
* WebSockets → built-in sync; do not hand-roll

---

*Emit only these patterns; if uncertain, prefer shallower resolves, explicit guards, and Worker-mediated server code.*

---

## Expanded Code Gallery

### 1) Web Auth + Provider + Create/List/Mutate

```tsx
import { JazzReactProvider, useAccount, useCoState } from "jazz-tools/react";
import { co, z, Group } from "jazz-tools";

// Schemas
export const Task = co.map({
  title: z.string(),
  status: z.enum(["todo", "doing", "done"]),
});
export const Project = co.map({
  name: z.string(),
  tasks: co.list(Task),
});
export const Root = co.map({ projects: co.list(Project) });
export const Account = co.account({
  root: Root,
  profile: co.profile(),
});

// Boot
export function Boot({ children }: { children: React.ReactNode }) {
  return (
    <JazzReactProvider
      sync={{ peer: "wss://cloud.jazz.tools/?key=you@example.com", when: "always" }}
      AccountSchema={Account}
    >
      {children}
    </JazzReactProvider>
  );
}

// Create a project owned by a fresh Group and link it under the user
export function CreateProjectButton() {
  const { me } = useAccount(Account);
  if (me === undefined) return null; // loading gate
  if (!me) return null; // not signed in

  return (
    <button
      onClick={() => {
        const g = Group.create();
        const p = Project.create(
          { name: "New Project", tasks: co.list(Task).create([]) },
          { owner: g },
        );
        me.root.projects.$jazz.push(p);
      }}
    >Create Project</button>
  );
}

// List projects and edit inline
export function ProjectsList() {
  const { me } = useAccount(Account, { resolve: { root: { projects: { $each: true } } } });
  if (me === undefined) return <div>Loading…</div>;
  if (!me) return <div>Sign in required</div>;

  return (
    <ul>
      {me.root.projects.map((p) => (
        <li key={p.$jazz.id}>
          <input value={p.name} onChange={(e) => p.$jazz.set("name", e.target.value)} />
          <AddTask projectId={p.$jazz.id} />
          <Tasks projectId={p.$jazz.id} />
        </li>
      ))}
    </ul>
  );
}

function AddTask({ projectId }: { projectId: string }) {
  const project = useCoState(Project, projectId);
  if (project === undefined) return null;
  if (project === null) return null;
  return (
    <button
      onClick={() => {
        const t = Task.create({ title: "Untitled", status: "todo" }, project.$jazz.owner);
        project.tasks.$jazz.push(t);
      }}
    >Add Task</button>
  );
}

function Tasks({ projectId }: { projectId: string }) {
  const project = useCoState(Project, projectId, {
    resolve: { tasks: { $each: true } },
  });
  if (project === undefined) return <div>Loading tasks…</div>;
  if (project === null) return <div>Project not found</div>;
  return (
    <ol>
      {project.tasks.map((t) => (
        <li key={t.$jazz.id}>
          <input value={t.title} onChange={(e) => t.$jazz.set("title", e.target.value)} />
          <select
            value={t.status}
            onChange={(e) => t.$jazz.set("status", e.target.value as any)}
          >
            <option>todo</option><option>doing</option><option>done</option>
          </select>
        </li>
      ))}
    </ol>
  );
}
```

### 2) Deep Loading Variants (`resolve`) and Tri‑State Guarding

```tsx
// Shallow: only top-level properties
const project = useCoState(Project, id);
if (project === undefined) return <Loading/>;
if (project === null) return <NotFound/>;

// Selective deep: load tasks but not task children
const p1 = useCoState(Project, id, { resolve: { tasks: { $each: true } } });

// Nested selective: load tasks and each task.assignee
const p2 = useCoState(Project, id, {
  resolve: { tasks: { $each: { assignee: true } } },
});
```

### 3) Sharing via Groups (no custom ACLs)

```ts
async function shareProject(projectId: string, target: any /* Account */) {
  const p = await Project.load(projectId); // programmatic, not a hook
  await p.$jazz.owner.addMember(target, "writer");
}
```

### 4) HTTP Server Worker — typed request/response

```ts
// worker.ts
import { startWorker, experimental_defineRequest } from "jazz-tools";
import { Group } from "jazz-tools";
import { Ticket, Event } from "./schema";

export const bookTicket = experimental_defineRequest({
  url: "/api/book-ticket",
  request: { schema: { event: Event }, resolve: { event: { reservations: true } } },
  response: { schema: { ticket: Ticket }, resolve: { ticket: true } },
});

export const jazzServer = await startWorker({
  syncServer: process.env.JAZZ_PEER!,
  accountID: process.env.JAZZ_WORKER_ACCOUNT!,
  accountSecret: process.env.JAZZ_WORKER_SECRET!,
});

// route.ts (Next.js)
export async function POST(req: Request) {
  return bookTicket.handle(req, jazzServer, async ({ event }, madeBy) => {
    const g = Group.create(jazzServer);
    const ticket = Ticket.create({ event, account: madeBy }, g);
    await g.addMember(madeBy, "reader");
    event.reservations.$jazz.push(ticket);
    return { ticket };
  });
}

// client usage
const { ticket } = await bookTicket.request({ event });
```

### 5) Inbox Worker (offline-friendly message)

```ts
// schema
export const BookTicketMsg = co.map({ type: co.literal("bookTicket"), event: Event });

// worker subscription
const { experimental: { inbox }, worker } = await startWorker({/* … */});
inbox.subscribe(BookTicketMsg, async (msg, sender) => {
  const { event } = await msg.$jazz.ensureLoaded({ resolve: { event: true } });
  const g = Group.create(worker);
  const t = Ticket.create({ event, account: sender }, g);
  await g.addMember(sender, "reader");
  event.reservations.$jazz.push(t);
  return t;
});

// client send
const send = experimental_useInboxSender(process.env.NEXT_PUBLIC_JAZZ_WORKER_ACCOUNT!);
await send(BookTicketMsg, { type: "bookTicket", event });
```

### 6) SSR Read with a Server Agent (Next.js RSC)

```ts
// server-only module
import { createSSRJazzAgent } from "jazz-tools";
import { Project } from "./schema";

const agent = createSSRJazzAgent({ peer: process.env.JAZZ_PEER! });

export async function loadProjectForServer(id: string) {
  return Project.load(id, { loadAs: agent, resolve: { tasks: { $each: true } } });
}
```

### 7) Images / Binary — web and RN

```tsx
// Web
import { ImageDefinition } from "jazz-tools";
function AvatarEditor({ profile }: { profile: any }) {
  return (
    <input type="file" accept="image/*" onChange={(e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const img = ImageDefinition.create(f, profile.$jazz.owner);
      profile.$jazz.set("avatar", img);
    }} />
  );
}
```

```ts
// React Native (Expo) — simplified
import { launchImageLibraryAsync, MediaTypeOptions } from "expo-image-picker";
import { ImageDefinition } from "jazz-tools";

async function pick(profile: any) {
  const res = await launchImageLibraryAsync({ mediaTypes: MediaTypeOptions.Images });
  if (res.canceled) return;
  const asset = res.assets[0];
  const file = { uri: asset.uri, type: asset.mimeType, name: asset.fileName } as any;
  const img = ImageDefinition.create(file, profile.$jazz.owner);
  profile.$jazz.set("avatar", img);
}
```

### 8) History-driven UI (audit, recency badges)

```ts
function lastEditorAccountId(task: any) {
  return task.$jazz.getEdits().title?.last?.by?.$jazz?.id;
}

function recentChangesSince(task: any, ts: number) {
  return (task.$jazz.getEdits().title?.all ?? []).filter((e: any) => e.meta.timestamp > ts);
}
```

```tsx
// React usage to display editor name
function LastEditorName({ accountId }: { accountId: string }) {
  const { me } = useAccount(Account);
  // If not signed in or loading, avoid extra work
  if (me === undefined || !accountId) return <span>Unknown</span>;
  const acct = useCoState(Account, accountId, { resolve: { profile: true } });
  if (acct === undefined) return <span>Unknown</span>;
  if (acct === null) return <span>Unknown</span>;
  return <span>{acct.profile.name}</span>;
}
```

### 9) Migrations (CoMaps; schema evolution)

```ts
// CoMap migrations run when a CoMap is loaded (not when created). They are synchronous.
// They require write access; if some users are read-only, prefer forward-compatible schemas.
export const Task = co
  .map({
    version: z.union([z.literal(1), z.literal(2)]),
    done: z.boolean(),
    text: co.plainText(),
    priority: z.optional(z.enum(["low", "medium", "high"])), // new field (optional for compatibility)
  })
  .withMigration((task) => {
    if (task.version === 1) {
      task.$jazz.set("priority", "medium");
      task.$jazz.set("version", 2);
    }
  });
```

### 10) Large Lists — item-level subscriptions + virtualization

```tsx
import { FixedSizeList as List } from "react-window";

function ProjectTasksVirtual({ id }: { id: string }) {
  const p = useCoState(Project, id); // shallow; only IDs
  if (p === undefined) return null;
  if (p === null) return null;
  const count = p.tasks.length;
  return (
    <List height={480} itemCount={count} itemSize={56} width={600}>
      {({ index, style }) => <TaskRow id={p.tasks[index].$jazz.id} style={style} />}
    </List>
  );
}

function TaskRow({ id, style }: { id: string; style: React.CSSProperties }) {
  const t = useCoState(Task, id); // subscribe per-item
  if (t === undefined) return <div style={style}>Loading…</div>;
  if (t === null) return <div style={style}>Missing</div>;
  return (
    <div style={style}>
      <input value={t.title} onChange={(e) => t.$jazz.set("title", e.target.value)} />
      <span>{t.status}</span>
    </div>
  );
}
```

### 11) Programmatic (non-React) access & subscription

```ts
// One-shot load
const p = await Project.load(projectId, { resolve: { tasks: true } });

// Subscription
const unsub = Project.subscribe(projectId, { resolve: { tasks: true } }, (proj) => {
  console.log("update", proj?.name);
});
// later
unsub();
```

### 12) Permission diagnostics (debug-only)

```tsx
function PermissionProbe({ id }: { id: string }) {
  const p = useCoState(Project, id);
  const { me } = useAccount(Account);
  if (p === undefined || p === null) return null;
  if (me === undefined || !me) return null;
  return (
    <pre>{JSON.stringify({
      canRead: me.canRead?.(p),
      canWrite: me.canWrite?.(p),
      owner: p.$jazz.owner?.$jazz?.id,
    }, null, 2)}</pre>
  );
}
```
