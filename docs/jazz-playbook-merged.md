# Jazz.tools Playbook — Correct-by-Construction Reference

**Audience:** Code-generating LLMs. **Goal:** emit idiomatic Jazz code only. **Method:** prescriptive rules + architectural understanding.

---

## Ground Rules (Never Violate)

1. **Single source of truth = CoValues.** No Redux/Zustand/custom stores. Subscribe and mutate via `$jazz`.
2. **No REST/fetch for app data.** Use hooks/workers; HTTP is transport only via `experimental_defineRequest`.
3. **Mutations are direct.** Use `$jazz.set`, `$jazz.push`, `$jazz.splice`, etc.; no custom PATCH/PUT.
4. **Loading states are mandatory.** Guard all access: `if (!cv.$isLoaded) { /* handle state */ }`.
5. **Pass IDs, not objects.** Never prop-drill CoValues; subscribe locally at leaf.
6. **Permissions live in Groups.** No ad-hoc ACLs; share via `group.addMember()`.
7. **Resolve depth explicitly.** Lazy loading default; ask for refs via `resolve` or `.resolved()`.
8. **SSR is read-only by default.** Enable agent with `createSSRJazzAgent` for server reads.
9. **One Worker per server.** Keep credentials secret; avoid multi-instance races.
10. **Environment constraints:** Node ≥ 20; match provider to runtime (Web/RN/Expo); no package mixing.

---

## System Architecture (4-Layer Stack)

```
┌─────────────────────────────────────────────────────┐
│ App Layer (React Components)                        │
│ useCoState(Schema, id) → Real-time updates          │
├─────────────────────────────────────────────────────┤
│ Jazz Layer (SubscriptionScope, Refs)                │
│ Permission enforcement, auto-loading, state mgmt    │
├─────────────────────────────────────────────────────┤
│ CoJSON Core (LocalNode, CRDT)                       │
│ Transaction sync, signature verification            │
├─────────────────────────────────────────────────────┤
│ Storage & Transport (IndexedDB/DB + WebSocket)     │
│ Persistence, peer sync, offline support             │
└─────────────────────────────────────────────────────┘
```

---

## Core Abstractions (CoValues)

| Type | Purpose | Key Methods | Own |
|------|---------|-------------|-----|
| **Account** | User identity root | `canRead/Write/Admin()`, `acceptInvite()` | Self |
| **Group** | Permission control | `addMember(acct, role)`, `getRoleOf(acct)`, `extend()` | Self |
| **CoMap** | Key-value struct | `$jazz.set(key, val)`, `$jazz.delete(key)` | Group/Acct |
| **CoList** | Ordered collection | `$jazz.push()`, `splice()`, `remove()`, `retain()` | Group/Acct |
| **CoFeed** | Append-only log | `$jazz.append()`, `.perAccount`, `.byMe` | Group/Acct |
| **Inbox** | Message queue | `.subscribe(schema, handler)` | System |
| **CoRecord** | Dynamic k/v map | `$jazz.set(key, val)`, `$jazz.delete(key)` | Group/Acct |
| **Profile** | User metadata | Nested in Account | Account |

**Roles:** `reader` (read), `writer` (read+write), `admin` (full), `manager` (read+write+members), `writeOnly` (write only).

**Loading States:**
- `loading` — fetching from network
- `loaded` — available locally
- `unavailable` — doesn't exist or unfetchable
- `unauthorized` — permission denied

---

## Subscription & Loading

**React Hook (Primary)**
```tsx
const cv = useCoState(Schema, id, { resolve: { nested: { $each: true } } });
if (!cv.$isLoaded) return <Loading state={cv.$jazz.loadingState} />;
// Safe to read & mutate
```

**Manual**
```ts
const unsub = Schema.subscribe(id, { resolve }, (cv) => { /* update */ });
unsub();
```

**Programmatic Load**
```ts
const cv = await Schema.load(id, { resolve: { field: true } });
if (!cv.$isLoaded) return;
```

**Resolve Cheat-Sheet**
```ts
// Shallow (default)
await Schema.load(id);

// Load one ref shallowly
await Schema.load(id, { resolve: { owner: true } });

// Load list items
await Schema.load(id, { resolve: { items: { $each: true } } });

// Nested deep
await Schema.load(id, { resolve: { items: { $each: { author: true } } } });

// Permissive (skip inaccessible)
await Schema.load(id, { resolve: { items: { $each: true, $onError: "catch" } } });
```

**Schema-Level Resolve (.resolved())**
```ts
// Define default resolution at schema
const ProjectWithTasks = Project.resolved({ tasks: { $each: true } });

// Compose nested
const AccountWithProjects = Account.resolved({
  root: { projects: { $each: ProjectWithTasks.resolveQuery } }
});

// Hook uses schema's default
const account = useAccount(AccountWithProjects);
```

**Type Inference**
```ts
type Loaded<T> = T & { $isLoaded: true };
type MaybeLoaded<T> = T | { $isLoaded: false };
type Resolved<T, Q> = T with resolve query Q applied;

// Derive: type T = co.loaded<typeof Schema, { tasks: { $each: true } }>;
```

**Ensure Deeper Load (when shallow won't do)**
```ts
const cv = await Schema.load(id);
if (!cv.$isLoaded) return;
const deeper = await cv.$jazz.ensureLoaded({ resolve: { nested: true } });
```

**Selector (Render Performance)**
```tsx
const value = useCoState(Schema, id, {
  select: (cv) => cv?.$isLoaded ? cv.name : undefined,
  equalityFn: (a, b) => a === b,
});
```

---

## Mutations

| CoValue | API | Example |
|---------|-----|---------|
| **CoMap** | `$jazz.set(key, val)` | `user.$jazz.set("name", "Alice")` |
| **CoMap (record)** | `$jazz.delete(key)` | `inventory.$jazz.delete("basil")` |
| **CoMap (optional)** | `$jazz.set(key, undefined)` | `project.$jazz.set("owner", undefined)` |
| **CoList** | `$jazz.push(item)` | `tasks.$jazz.push({ title: "New" })` |
| **CoList** | `$jazz.splice(i, n)` | `tasks.$jazz.splice(0, 1)` |
| **CoList** | `$jazz.remove(pred)` | `tasks.$jazz.remove(t => t.done)` |
| **CoList** | `$jazz.retain(pred)` | `tasks.$jazz.retain(t => !t.deleted)` |
| **CoFeed** | `$jazz.append(item)` | `feed.$jazz.append(event)` |
| **CoPlainText** | `$jazz.insert(pos, str)` | `text.$jazz.insert(0, "Hi ")` |
| **CoPlainText** | `$jazz.delete(start, len)` | `text.$jazz.delete(0, 3)` |

**Always mutate directly, never through REST or reducers.**

---

## Permissions & Groups

**Ownership Model**
```
Every CoValue has a Group owner ($jazz.owner).
Group members get role-based access.
CoValues can inherit permissions via group hierarchy.
```

**Create with Ownership**
```ts
const g = Group.create();
const doc = Document.create({ title: "Spec" }, { owner: g });
await g.addMember(targetAccount, "writer");
```

**Hierarchical Sharing**
```ts
const childGroup = Group.create();
childGroup.extend(parentGroup); // inherit permissions
```

**Permission Checks**
```ts
account.canRead(coValue)    // true/false
account.canWrite(coValue)   // true/false
account.canManage(coValue)  // true/false
group.getRoleOf(accountId)  // role or null
```

**Never use custom ACLs or client-side auth checks.**

---

## Server Patterns

### HTTP Request/Response (Typed, Immediate)

Best for: immediate responses, serverless, standard RPC.

```ts
// Define schema & handler
export const bookTicket = experimental_defineRequest({
  url: "/api/book-ticket",
  workerId: process.env.NEXT_PUBLIC_JAZZ_WORKER_ACCOUNT!,
  request: { schema: { event: Event }, resolve: { event: { reservations: true } } },
  response: { schema: { ticket: Ticket }, resolve: { ticket: true } },
});

// Worker (boot once)
export const jazzServer = await startWorker({
  syncServer: process.env.JAZZ_PEER!,
  accountID: process.env.JAZZ_WORKER_ACCOUNT!,
  accountSecret: process.env.JAZZ_WORKER_SECRET!,
});

// Route handler (Next.js)
export async function POST(req: Request) {
  return bookTicket.handle(req, jazzServer.worker, async ({ event }, madeBy) => {
    const g = Group.create(jazzServer.worker);
    const ticket = Ticket.create({ event, account: madeBy }, g);
    await g.addMember(madeBy, "reader");
    event.reservations.$jazz.push(ticket);
    return { ticket };
  });
}

// Client
const { ticket } = await bookTicket.request({ event });
```

### Inbox (Offline-Friendly Messages)

Best for: offline queuing, message history, internal comms.

```ts
// Schema
export const BookTicketMsg = co.map({ type: co.literal("bookTicket"), event: Event });

// Worker
const { worker, experimental: { inbox } } = await startWorker({...});
inbox.subscribe(BookTicketMsg, async (msg, senderID) => {
  const { event } = await msg.$jazz.ensureLoaded({ resolve: { event: true } });
  const g = Group.create(worker);
  const ticket = Ticket.create({ event, account: senderID }, g);
  await g.addMember(senderID, "reader");
  event.reservations.$jazz.push(ticket);
  return ticket; // syncs back via Jazz
});

// Client
const send = experimental_useInboxSender(WORKER_ID);
await send(BookTicketMsg, { type: "bookTicket", event });
```

### SSR & Server Agents

```ts
// Server-only, one per app
const agent = createSSRJazzAgent({ peer: process.env.JAZZ_PEER! });

// Load deeply on server
const item = await Item.load(id, { loadAs: agent, resolve: { nested: true } });
if (!item.$isLoaded) return null;

// Client hooks with enableSSR return unloaded objects; gate UI.
<JazzReactProvider enableSSR>...</JazzReactProvider>
```

---

## Schema & Types

**Always co + z:**
```ts
export const Task = co.map({
  title: z.string(),
  status: z.enum(["todo", "doing", "done"]),
  assignee: co.optional(Account),  // NOT z.optional(Account)
});

export const Project = co.map({
  name: z.string(),
  tasks: co.list(Task),
  posts: co.feed(Message),
});

export const Root = co.map({ projects: co.list(Project) });

export const Account = co.account({
  root: Root,
  profile: co.profile(),
});
```

**Struct vs Record**
```ts
// Struct: fixed fields (entities)
const User = co.map({ name: z.string(), email: z.string() });

// Record: dynamic k/v (collections)
const Inventory = co.record(z.string(), z.number()); // key → qty
```

**Helpers**
```ts
Schema.partial()              // All optional
Schema.partial({ field: true }) // Specific optional
Schema.pick({ field: true })  // Subset of fields
Schema.shape                  // Access field definitions
```

**Recursive (use getter)**
```ts
const Tree = co.map({
  name: z.string(),
  get children(): co.Optional<co.List<typeof Tree>> {
    return co.optional(co.list(Tree));
  },
});
```

**Evolution (backward compat)**
```ts
const Task = co.map({
  version: z.union([z.literal(1), z.literal(2)]),
  text: co.plainText(),
  priority: z.optional(z.enum(["low", "medium", "high"])), // new field
}).withMigration((t) => {
  if (t.version === 1) {
    t.$jazz.set("priority", "medium");
    t.$jazz.set("version", 2);
  }
});
```

---

## CoMaps & CoLists Patterns

### Uniqueness & Deterministic IDs

```ts
// Create or load by unique key
await Schema.upsertUnique({
  value: { title: "Home" },
  unique: "home-page",
  owner: group,
});

// Load by unique key
const home = await Schema.loadUnique("home-page", { loadAs });
```

### CoList Iteration

```ts
// Standard iteration
for (const item of list) { ... }

// With values() workaround (TypeScript bug)
for (const item of list.values()) { ... }
const [first] = list.values();
```

### Set-Like Collections (use record)

```ts
const Chat = co.map({
  participants: co.record(z.string(), User), // keyed by $jazz.id
});

// Add participant
chat.participants.$jazz.set(user.$jazz.id, user);

// List all
const ids = Object.keys(chat.participants);
const avatars = Object.values(chat.participants)
  .filter((u): u is User => u != null)
  .map(u => u.profile.avatar);
```

### Soft Delete

```ts
const Item = co.map({
  title: z.string(),
  deleted: z.optional(z.boolean()),
});

// Delete
item.$jazz.set("deleted", true);

// Filter
items.filter(i => !i.deleted)
```

---

## Error Handling & Loading Guards

**Always emit this pattern:**
```tsx
const cv = useCoState(Schema, id, { resolve });
if (!cv.$isLoaded) {
  switch (cv.$jazz.loadingState) {
    case "loading": return <Loading />;
    case "unauthorized": return <Denied />;
    case "unavailable": return <NotFound />;
  }
}
// Safe to read & mutate here
```

**Never:**
- Check `cv === undefined` or `cv === null`
- Invent placeholder objects
- Access fields before guard

---

## Anti-Patterns → Corrections

| ❌ Avoid | ✅ Use |
|----------|--------|
| `fetch('/api/x')` | `useCoState(Schema, id)` or `experimental_defineRequest` |
| `cv === undefined` | `!cv.$isLoaded` |
| `cv === null` | `cv.$jazz.loadingState === "unavailable"` |
| Redux/Zustand global | CoValues + subscriptions locally |
| Prop-drill CoValues | Pass IDs; subscribe at leaf |
| Custom ACLs | Group membership & roles |
| SSR mutations | `createSSRJazzAgent` for reads only |
| Deep eager resolve | Start shallow; deepen with `resolve` |
| Custom REST APIs | Workers + typed `experimental_defineRequest` |

---

## Performance & Scale

**Lazy Loading:** Default shallow; load nested refs only when needed.

**Virtualization:** Render lists at item level with child subscriptions, not deep resolves.
```tsx
function ItemList({ id }: { id: string }) {
  const list = useCoState(List, id); // shallow, just IDs
  if (!list?.$isLoaded) return null;
  return (
    <VirtualList itemCount={list.length}>
      {({ index }) => <ItemRow id={list[index].$jazz.id} />}
    </VirtualList>
  );
}
function ItemRow({ id }: { id: string }) {
  const item = useCoState(Item, id); // subscribe per item
  if (!item?.$isLoaded) return null;
  return <div>{item.title}</div>;
}
```

**CRDTs Resolve Conflicts Automatically:** No coordination needed; all clients converge.

---

## LLM Self-Check (Before Finalizing)

1. Provider matches runtime (Web/RN/Expo), Node ≥ 20.
2. All data access via hooks/subscriptions with guards.
3. No ad-hoc network calls for app data.
4. Mutations via direct `$jazz` methods only.
5. Permissions via Groups; no custom ACLs.
6. Deep `resolve` only when needed; default shallow.
7. Worker is single instance; credentials from env; no client secrets.
8. SSR uses `createSSRJazzAgent` for reads; no mutations.

---

## Quick Reference & Recipes

**Create & Link**
```ts
const g = Group.create();
const project = Project.create({ name: "P" }, { owner: g });
me.root.projects.$jazz.push(project);
```

**Share with Writer Access**
```ts
await project.$jazz.owner.addMember(targetAccount, "writer");
```

**Shallow Subscribe in Component**
```tsx
const item = useCoState(Schema, id);
if (!item?.$isLoaded) return <Spinner state={item.$jazz.loadingState} />;
return <div>{item.field}</div>;
```

**Deep Subscribe (List + Items)**
```tsx
const project = useCoState(Project, id, {
  resolve: { tasks: { $each: { assignee: true } } },
});
if (!project?.$isLoaded) return null;
return project.tasks.map(t => <TaskCard task={t} />);
```

**Server Deep Load**
```ts
const agent = createSSRJazzAgent({ peer: PEER });
const data = await Schema.load(id, { loadAs: agent, resolve: { deep: true } });
```

**Bootstrap App**
```tsx
<JazzReactProvider
  sync={{ peer: PEER_URL, when: "always" }}
  AccountSchema={Account}
>
  <App />
</JazzReactProvider>
```

**Get Edit History**
```ts
const edits = cv.$jazz.getEdits();
const lastEditor = edits.field?.last?.by?.$jazz?.id;
const recentChanges = (edits.field?.all ?? []).filter(e => e.meta.timestamp > ts);
```

**Images**
```tsx
// Web
const img = ImageDefinition.create(file, owner);
profile.$jazz.set("avatar", img);

// React Native
const { uri, mimeType, fileName } = await launchImageLibrary({...});
const file = { uri, type: mimeType, name: fileName } as any;
const img = ImageDefinition.create(file, owner);
```

---

## Glossary (Old Habits → Jazz)

| Concept | Old | New |
|---------|-----|-----|
| Fetch data | REST GET | `useCoState(Schema, id)` |
| Create/mutate | REST POST/PATCH | Direct mutation OR typed Worker |
| Loading state | `undefined` | `cv.$isLoaded === false` |
| Not found | `null` | `cv.$jazz.loadingState === "unavailable"` |
| Global state | Redux/Zustand | CoValues + local subscriptions |
| Auth/roles | JWT claims | Group membership + roles |
| Models | ORM | `co.map/list/feed` schemas |
| Real-time | Manual WebSocket | Built-in sync; never hand-roll |

---

## Full Example: Todo App

```tsx
// schema.ts
export const Task = co.map({
  title: z.string(),
  status: z.enum(["todo", "doing", "done"]),
});
export const Root = co.map({ tasks: co.list(Task) });
export const Account = co.account({ root: Root, profile: co.profile() });

// app.tsx
import { JazzReactProvider, useAccount, useCoState } from "jazz-tools/react";

createRoot(document.getElementById("root")!).render(
  <JazzReactProvider sync={{ peer: PEER }} AccountSchema={Account}>
    <TodoApp />
  </JazzReactProvider>
);

function TodoApp() {
  const me = useAccount(Account, { resolve: { root: { tasks: { $each: true } } } });
  if (!me?.$isLoaded) return <div>Loading…</div>;

  return (
    <div>
      <h1>{me.profile.name}'s Tasks</h1>
      <button onClick={() => {
        const t = Task.create({ title: "New", status: "todo" }, me.root.$jazz.owner);
        me.root.tasks.$jazz.push(t);
      }}>Add Task</button>
      <ul>
        {me.root.tasks.map(t => (
          <li key={t.$jazz.id}>
            <input value={t.title} onChange={e => t.$jazz.set("title", e.target.value)} />
            <select value={t.status} onChange={e => t.$jazz.set("status", e.target.value as any)}>
              <option>todo</option><option>doing</option><option>done</option>
            </select>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

*Emit only these patterns. If uncertain: prefer shallow resolves, explicit guards, and Worker-mediated server code.*
