# Jazz.tools LLM Playbook — Correct-by-Construction Reference

**Audience:** a code-generating LLM. **Goal:** emit *only* idiomatic Jazz code and architecture. **Assumption:** you tend to revert to web/REST conventions. This guide rewrites those instincts.

---

## Ground Rules (Never Violate)

1. **Single source of truth = CoValues.** Do not introduce Redux/Zustand, client caches, or custom stores. Subscribe to CoValues; update via `$jazz` methods.
2. **No REST or `fetch` for app data.** Use Jazz providers, hooks, and workers. HTTP exists *only* as a transport to a **Server Worker** defined by `experimental_defineRequest`.
3. **Direct mutation uses `$jazz`.** Use `$jazz.set`, `$jazz.applyDiff`, and list helpers like `$jazz.push`/`$jazz.splice`/`$jazz.remove`/`$jazz.retain`; do not invent `PATCH`/`PUT` APIs.
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

* Wrap the app in `<JazzReactProvider sync={{ peer: "wss://cloud.jazz.tools/?key=..." }} AccountSchema={MyAccount} />`.
* Use `useAccount(MyAccount)` for the signed-in user and personal root; use `useCoState(Schema, id, resolve?)` for shared/public data.
* In components: branch on `undefined/null` before reading; mutate fields directly; subscribe shallow by default, deepen with `resolve` as needed.

**Minimal composition pattern**

```tsx
// schema.ts
export const Task = co.map({
  title: z.string(),
  status: z.enum(["todo","doing","done"]),
});
export const Root = co.map({ tasks: co.list(Task) });
export const Account = co.account({ root: Root, profile: co.map({ name: z.string() }) });

// app boot
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
    <input value={task.title} onChange={e => task.title = e.target.value} />
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
const unsub = Schema.subscribe(id, { /* resolve */ }, cv => {/* react to updates */});
unsub();
```

**React hooks**

```tsx
const project = useCoState(Project, projectId, { tasks: { $each: true } });
if (project === undefined) return <Loading/>;
if (project === null) return <NotFound/>;
return project.tasks.map(t => <TaskRow key={t.id} id={t.id}/>);
```

Rules:

* Subscribe at leaf components; pass IDs; avoid prop‑drilling live CoValues.
* Default to shallow; opt‑in to `resolve` for nested data.
* Never assume availability of transitive children without `resolve` or a follow-up subscription.

---

## Writing Data — The Only Valid Patterns

**Maps**

```ts
item.title = "New";        // last-writer-wins on fields
```

**Lists**

```ts
list.push(item);            // ordered inserts with CRDT ordering
list.splice(i, 1);
```

**Feeds (append-only)**

```ts
feed.append(event);
```

**Text**

```ts
text.insert(pos, "abc");
text.delete(start, len);
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
    ticketGroup.addMember(madeBy, "reader");
    event.reservations.push(ticket);
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
  const { event } = await msg.ensureLoaded({ resolve: { event: { reservations: true } } });
  const g = Group.create(worker);
  const ticket = Ticket.create({ account: madeBy, event }, g);
  g.addMember(madeBy, "reader");
  event.reservations.push(ticket);
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
* Use `co.list(Subschema)` for ordered collections; `co.feed(Subschema)` for append‑only logs; `co.text()` for collaborative text.
* Derive loaded types with `type T = co.loaded<typeof Schema>` when needed in TS.
* Evolve with **optional** fields to remain backward compatible; do not break existing data.

---

## Large Data & Performance

* Keep subscriptions shallow at list level; render items via child components that subscribe to each item.
* Virtualize long lists at the UI level; never attempt to bulk-load thousands of children via one deep `resolve`.
* Debounce high‑frequency text edits only at the UI boundary if necessary; do **not** buffer writes elsewhere.

---

## Error/Loading/Access Patterns (Emit Exactly)

```tsx
const cv = useCoState(S, id, resolve);
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
const project = Project.create({ name: "P" }, g);
me.root.projects.push(project);
```

**Share with writer access**

```ts
await project._owner.addMember(targetAccount, "writer");
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
import { JazzProvider, useAccount, useCoState } from "jazz-react";
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
  profile: co.map({ name: z.string() }),
});

// Boot
export function Boot({ children }: { children: React.ReactNode }) {
  return (
    <JazzProvider
      sync={{ peer: "wss://cloud.jazz.tools/?key=you@example.com", when: "always" }}
      AccountSchema={Account}
    >
      {children}
    </JazzProvider>
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
        const p = Project.create({ name: "New Project", tasks: co.list(Task).create([]) }, g);
        me.root.projects.push(p);
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
        <li key={p.id}>
          <input value={p.name} onChange={(e) => (p.name = e.target.value)} />
          <AddTask projectId={p.id} />
          <Tasks projectId={p.id} />
        </li>
      ))}
    </ul>
  );
}

function AddTask({ projectId }: { projectId: string }) {
  const project = useCoState(Project, projectId);
  if (!project) return null; // guards undefined/null implicitly
  return (
    <button
      onClick={() => {
        const t = Task.create({ title: "Untitled", status: "todo" }, project._owner);
        project.tasks.push(t);
      }}
    >Add Task</button>
  );
}

function Tasks({ projectId }: { projectId: string }) {
  const project = useCoState(Project, projectId, { tasks: { $each: true } });
  if (project === undefined) return <div>Loading tasks…</div>;
  if (project === null) return <div>Project not found</div>;
  return (
    <ol>
      {project.tasks.map((t) => (
        <li key={t.id}>
          <input value={t.title} onChange={(e) => (t.title = e.target.value)} />
          <select value={t.status} onChange={(e) => (t.status = e.target.value as any)}>
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
const p1 = useCoState(Project, id, { tasks: { $each: true } });

// Nested selective: load tasks and each task.assignee
const p2 = useCoState(Project, id, { tasks: { $each: { assignee: true } } });
```

### 3) Sharing via Groups (no custom ACLs)

```ts
async function shareProject(projectId: string, target: any /* Account */) {
  const p = await Project.load(projectId); // programmatic, not a hook
  await p._owner.addMember(target, "writer");
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
    g.addMember(madeBy, "reader");
    event.reservations.push(ticket);
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
  const { event } = await msg.ensureLoaded({ resolve: { event: true } });
  const g = Group.create(worker);
  const t = Ticket.create({ event, account: sender }, g);
  g.addMember(sender, "reader");
  event.reservations.push(t);
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
      const img = ImageDefinition.create(f, profile._owner);
      profile.avatar = img;
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
  const img = ImageDefinition.create(file, profile._owner);
  profile.avatar = img;
}
```

### 8) History-driven UI (audit, recency badges)

```ts
function lastEditorName(task: any) {
  return task.$jazz.getEdits().title?.last?.by?.profile?.name ?? "Unknown";
}

function recentChangesSince(task: any, ts: number) {
  return (task.$jazz.getEdits().title?.all ?? []).filter((e: any) => e.meta.timestamp > ts);
}
```

### 9) Migrations (add optional fields safely)

```ts
export const TaskV1 = co.map({ title: z.string(), status: z.enum(["todo","doing","done"]) });
export const Task = TaskV1.extend({ priority: z.enum(["low","med","high"]).optional() });

export const Account = co.account({ root: Root, profile: co.map({ name: z.string() }) })
  .withMigration((acct) => {
    if (!acct.root) acct.root = Root.create({ projects: co.list(Project).create([]) });
  });
```

### 10) Large Lists — item-level subscriptions + virtualization

```tsx
import { FixedSizeList as List } from "react-window";

function ProjectTasksVirtual({ id }: { id: string }) {
  const p = useCoState(Project, id); // shallow; only IDs
  if (!p) return null;
  const count = p.tasks.length;
  return (
    <List height={480} itemCount={count} itemSize={56} width={600}>
      {({ index, style }) => <TaskRow id={p.tasks[index].id} style={style} />}
    </List>
  );
}

function TaskRow({ id, style }: { id: string; style: React.CSSProperties }) {
  const t = useCoState(Task, id); // subscribe per-item
  if (t === undefined) return <div style={style}>Loading…</div>;
  if (t === null) return <div style={style}>Missing</div>;
  return (
    <div style={style}>
      <input value={t.title} onChange={(e) => (t.title = e.target.value)} />
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
const unsub = Project.subscribe(projectId, { tasks: true }, (proj) => {
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
  if (!p || !me) return null;
  return (
    <pre>{JSON.stringify({
      canRead: me.canRead?.(p),
      canWrite: me.canWrite?.(p),
      owner: p._owner?.id,
    }, null, 2)}</pre>
  );
}
```
