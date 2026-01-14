# Jazz.tools Systems Model

A comprehensive architectural overview of the jazz-tools package (v0.19.15) - a distributed, collaborative data framework with built-in synchronization, permissions, and offline support.

## Table of Contents
1. [Package Structure](#package-structure)
2. [Core Abstractions (CoValues)](#core-abstractions-coValues)
3. [Data Synchronization Architecture](#data-synchronization-architecture)
4. [Permission & Authentication Systems](#permission--authentication-systems)
5. [Storage Layers & Persistence](#storage-layers--persistence)
6. [Network/Sync Protocols](#networksync-protocols)
7. [Key APIs & Interfaces](#key-apis--interfaces)
8. [System Integration](#system-integration)
9. [Schema & Type System](#schema--type-system)
10. [Key Design Patterns](#key-design-patterns)

---

## Package Structure

### Directory Organization

```
jazz-tools/
├── src/tools/                    # Core Jazz implementation
│   ├── coValues/                 # Main data abstractions
│   │   ├── CoValueBase.ts        # Base class for all CoValues
│   │   ├── account.ts            # Account identity
│   │   ├── group.ts              # Permission groups
│   │   ├── coMap.ts              # Key-value maps
│   │   ├── coList.ts             # Ordered lists
│   │   ├── coFeed.ts             # Append-only logs
│   │   ├── coVector.ts           # Vector data
│   │   ├── coPlainText.ts        # Text content
│   │   ├── inbox.ts              # Message queue system
│   │   ├── request.ts            # HTTP request/response patterns
│   │   └── interfaces.ts         # Core type definitions
│   ├── implementation/           # Internal implementation
│   │   ├── createContext.ts      # Jazz context creation
│   │   ├── ContextManager.ts     # Context state management
│   │   ├── schema.ts             # Schema definitions
│   │   └── zodSchema/            # Zod schema integration
│   ├── subscribe/                # Subscription & sync system
│   │   ├── SubscriptionScope.ts  # Subscription tree
│   │   ├── SubscriptionCache.ts  # Caching layer
│   │   ├── CoValueCoreSubscription.ts  # Low-level subscriptions
│   │   └── types.ts              # Subscription types
│   ├── auth/                     # Authentication layer
│   │   ├── AuthSecretStorage.ts  # Credential storage
│   │   ├── PassphraseAuth.ts     # Passphrase auth
│   │   ├── DemoAuth.ts           # Demo auth
│   │   └── clerk/                # Clerk integration
│   └── lib/                      # Utilities
├── src/browser/                  # Browser-specific bindings
├── src/react-core/               # React integration
│   └── hooks.ts                  # useCoState, useJazzContext, etc.
├── src/media/                    # Media handling
├── src/worker/                   # Server worker support
└── src/better-auth/              # BetterAuth integration
```

### Key External Dependencies
- **cojson** (v0.19.15) - Core CRDT protocol and synchronization engine
- **cojson-storage-indexeddb** - Browser storage implementation
- **cojson-transport-ws** - WebSocket sync transport
- **zod** (v4.1.11) - Schema validation and type inference

---

## Core Abstractions (CoValues)

CoValues are the fundamental building blocks of Jazz - collaborative values that automatically sync across clients and devices.

### Base CoValue Interface

```typescript
interface CoValue {
  [TypeSym]: string;                    // Type identifier
  $jazz: {
    id: ID<CoValue>;                    // Unique identifier
    loadingState: "loaded" | "loading" | "unavailable" | "unauthorized";
    owner?: Group;                      // Permission owner
    loadedAs: Account | AnonymousJazzAgent;  // Current agent
    raw: RawCoValue;                    // Low-level cojson object
    _subscriptionScope?: SubscriptionScope;  // Subscription tracking
    isBranched: boolean;                // Branch state
    branchName?: string;                // Active branch name
    unstable_merge(): void;             // Merge branches
  };
  $isLoaded: boolean;
  toJSON(): any;
}
```

### CoValue Types

#### 1. Account
User identity and root permissions container.

```typescript
interface Account {
  profile: Profile;           // User metadata
  root: CoMap;               // User's root data container

  // Permission methods
  acceptInvite(): void;
  canRead(coValue): boolean;
  canWrite(coValue): boolean;
  canManage(coValue): boolean;
  canAdmin(coValue): boolean;
}
```

#### 2. Group
Access control mechanism with role-based permissions.

```typescript
interface Group {
  // Roles: reader, writer, admin, manager, writeOnly
  addMember(account, role): void;
  removeMember(account): void;
  myRole(): Role | null;
  getRoleOf(accountId): Role | null;
  extend(): Group;  // Create child group with inherited permissions
}
```

**Permission Roles:**
- `reader` - Read-only access
- `writer` - Read and write access
- `admin` - Full control including permissions
- `manager` - Read, write, and member management
- `writeOnly` - Write-only (special case)

#### 3. CoMap
Collaborative key-value store with arbitrary string keys.

```typescript
interface CoMap<T> {
  [key: string]: T;  // Values can be primitives or CoValue refs
  // Tracks edit history with timestamps and authors
  // Supports deep nested structures
}
```

#### 4. CoList
Ordered collaborative list with CRDT semantics.

```typescript
interface CoList<T> {
  [index: number]: T;
  length: number;
  push(...items): void;
  // Append, insert, remove operations
  // Automatic conflict resolution
  // Maintains insertion order
}
```

#### 5. CoFeed
Append-only log for timelines, messages, and event streams.

```typescript
interface CoFeed<T> {
  perAccount: Map<AccountID, T[]>;
  perSession: Map<SessionID, T[]>;
  byMe: T[];
  inCurrentSession: T[];
  // Immutable once written
  // Efficient for temporal data
}
```

#### 6. Other CoValue Types
- **CoVector** - Vector embeddings for semantic search
- **CoPlainText/CoRichText** - Collaborative text editing
- **Inbox** - Message queue system with delivery guarantees
- **Profile** - User metadata referenced by Accounts

---

## Data Synchronization Architecture

### SubscriptionScope Tree

The core of Jazz's synchronization system is a hierarchical tree of subscriptions:

```typescript
class SubscriptionScope<D extends CoValue> {
  node: LocalNode;                      // cojson node for sync
  id: ID<D>;                           // CoValue ID
  schema: RefEncoded<D>;               // Type information

  // Child management
  childNodes: Map<string, SubscriptionScope>;
  childValues: Map<string, SubscriptionValue>;
  pendingLoadedChildren: Set<string>;  // Explicitly loaded refs

  // State tracking
  value: SubscriptionValue<D> | SubscriptionValueLoading;
  subscriptionCache: SubscriptionCache; // Prevents duplicate subscriptions

  // Update handling
  handleUpdate(rawValue: RawCoValue | "UNAVAILABLE");
  handleChildUpdate(id: string, value: SubscriptionValue);
  triggerUpdate();
}
```

### Sync Flow

1. **Subscribe** to a CoValue via `subscribeToCoValue()` or React hook
2. **Create** a `SubscriptionScope` tree node
3. **Subscribe** `CoValueCoreSubscription` to low-level cojson changes
4. **Receive** data updates, process via `handleUpdate()`
5. **Auto-load** nested refs based on `resolve` query
6. **Trigger** re-renders via external store pattern (React)

### Key Features

- **Lazy loading**: Children only loaded when explicitly requested
- **Deep loading**: `resolve` queries specify which nested refs to load
- **Autoloading**: Certain refs auto-load by default
- **Caching**: `SubscriptionCache` prevents duplicate subscriptions
- **Branch support**: Experimental branching for complex edits

### Loading States

- `LOADING` - Fetching data from network
- `LOADED` - Data available locally
- `UNAVAILABLE` - CoValue doesn't exist or can't be fetched
- `UNAUTHORIZED` - User lacks permissions

---

## Permission & Authentication Systems

### Permission Model (RBAC)

```
Account (self-owned)
  ↓
Group (multi-member, role-based)
  ├─ reader: Can read only
  ├─ writer: Can read & write
  ├─ manager: Can read, write & manage members
  └─ admin: Full control

CoValue Ownership:
  - Owned by Account → only account can write
  - Owned by Group → group members write based on role
  - No owner → public (Accounts & Groups always public)
```

### Permission Checking

```typescript
// Permission methods on Account
account.canRead(coValue)    // Check read permission
account.canWrite(coValue)   // Check write permission
account.canManage(coValue)  // Check management permission
account.canAdmin(coValue)   // Check admin permission

// Group membership
group.getRoleOf(accountId)  // Get account role in group
```

### Authentication Providers

1. **DemoAuth** - Temporary demo accounts for testing
2. **PassphraseAuth** - Passphrase-based login
3. **JazzClerkAuth** - Clerk.com integration
4. **BetterAuth** - BetterAuth framework integration

### Credential Management

```typescript
type Credentials = {
  accountID: ID<Account>;
  secret: AgentSecret;              // Private key material
};

class AuthSecretStorage {
  isAuthenticated: boolean;
  onUpdate(callback): () => void;   // Subscribe to auth changes
}
```

### Session Management

```typescript
interface SessionProvider {
  acquireSession(accountID, crypto): { sessionID, sessionDone }
  persistSession(accountID, sessionID): { sessionDone }
}
```

---

## Storage Layers & Persistence

### Storage Stack

```
Application Layer (CoValues)
    ↓
Jazz Tools Layer (SubscriptionScope, refs)
    ↓
CoJSON Core Layer (LocalNode, RawCoValue)
    ↓
StorageAPI (Platform-specific)
    ├─ Browser: IndexedDB (cojson-storage-indexeddb)
    ├─ React Native: AsyncStorage / OPSQLite
    ├─ Server: File system, databases
    └─ Custom: Any StorageAPI implementation
```

### StorageAPI Interface

From the cojson layer:

```typescript
interface StorageAPI {
  saveBlob(id: string, blob: Uint8Array): Promise<void>;
  loadBlob(id: string): Promise<Uint8Array | undefined>;
  deleteBlob(id: string): Promise<void>;
}
```

### Persistence Features

- **Automatic sync**: Changes persisted as they occur
- **Offline support**: Local storage available when offline
- **Deduplication**: Blocks deduplicated by hash
- **State snapshots**: Known state tracking across sessions

---

## Network/Sync Protocols

### Peer Connection Model

```typescript
type Peer = `wss://${string}` | `ws://${string}`;

type SyncConfig = {
  peer: Peer;
  when: "always" | "signedUp" | "never";
};
```

### LocalNode (Core Sync Engine)

```typescript
class LocalNode {
  // Network connections
  addPeer(peer: Peer): void
  removePeer(peer: Peer): void

  // Message delivery
  send(message: SyncMessage): void

  // Subscription
  subscribe(id: CoID, callback): Unsubscribe

  // Persistence
  load(id: CoID): Promise<RawCoValue>

  // Session management
  currentSessionID: SessionID
  gracefulShutdown(): void
}
```

### CoJSON Sync Protocol

Built on CRDTs (Conflict-free Replicated Data Types):

- **Incremental sync**: Only changed transactions synced
- **CRDT-based**: Conflict-free merging
- **Session tracking**: Per-account session handling
- **Transaction history**: Complete edit history stored
- **Signature verification**: Cryptographic authentication of changes
- **Role-based access**: Permissions enforced per transaction

### Transport Layer

Uses `cojson-transport-ws` for WebSocket connections:

- Real-time sync over WebSocket
- Automatic reconnection with exponential backoff
- Peer discovery and management
- Message batching for efficiency

---

## Key APIs & Interfaces

### Core Loading APIs

```typescript
// One-time load
async function loadCoValue<V extends CoValue>(
  cls: CoValueClass<V>,
  id: ID<V>,
  options: {
    resolve?: RefsToResolveStrict<V>;   // Which nested refs to load
    loadAs: Account | AnonymousJazzAgent;
  }
): Promise<Settled<Resolved<V>>>

// Subscribe to updates
function subscribeToCoValue<V extends CoValue>(
  cls: CoValueClass<V>,
  id: ID<V>,
  options: SubscribeListenerOptions<V>,
  listener: (value, unsubscribe) => void
): void
```

### React Hooks

```typescript
// Main subscription hook
function useCoState<S extends CoValueClassOrSchema>(
  Schema: S,
  id: string,
  options?: {
    resolve?: ResolveQuery<S>;
    select?: (value) => any;
    equalityFn?: (a, b) => boolean;
  }
): MaybeLoaded<InstanceOfSchema<S>>

// Context access
function useJazzContext<Acc extends Account>(): JazzContextType<Acc>

// Authentication
function useIsAuthenticated(): boolean
function useAuthSecretStorage(): AuthSecretStorage
```

### Context Creation

```typescript
// Create new account
async function createJazzContextForNewAccount<S extends AccountSchema>(options: {
  creationProps: { name: string };
  peers: Peer[];
  crypto: CryptoProvider;
  AccountSchema?: S;
  sessionProvider: SessionProvider;
}): Promise<JazzContextWithAccount<S>>

// From existing credentials
async function createJazzContextFromExistingCredentials<S>(options: {
  credentials: Credentials;
  peers: Peer[];
  crypto: CryptoProvider;
  sessionProvider: SessionProvider;
}): Promise<JazzContextWithAccount<S>>
```

### Creation APIs

```typescript
// CoMap
const map = CoMapSchema.create(init, { owner: group })

// CoList
const list = CoListSchema.create(items, { owner: group })

// CoFeed
const feed = CoFeedSchema.create({ owner: group })

// Groups
const group = Group.create({ owner: account })

// Accounts
const account = await Account.create(creationProps, crypto)
```

### Message APIs

```typescript
// Inbox message delivery
inbox.subscribe(
  MessageSchema,
  async (message, senderAccountId) => {
    // Process message
    return responseValue
  }
)

// Direct invites
const invite = createInviteLink(coValue, inviteSecret)
account.acceptInvite(valueID, inviteSecret, coValueClass)
```

### Request/Response Pattern

HTTP-style request/response for client-server patterns:

```typescript
async function experimental_defineRequest<Req, Resp>(options: {
  url: string;
  workerId: string;
  request: RequestSchema;
  response: ResponseSchema;
}): Promise<{
  sendRequest(payload, options): Promise<Resp>
}>
```

---

## System Integration

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Application Layer (React Components)                        │
├─────────────────────────────────────────────────────────────┤
│ useCoState() → SubscriptionScope → Real-time Updates        │
├─────────────────────────────────────────────────────────────┤
│ JazzContextManager (Authentication & State)                 │
│  ├─ AuthSecretStorage (Credentials)                         │
│  ├─ SessionProvider (Session lifecycle)                     │
│  └─ SubscriptionCache (Subscription deduplication)          │
├─────────────────────────────────────────────────────────────┤
│ LocalNode (cojson core)                                     │
│  ├─ Account/Group/CoMap/CoList/CoFeed instances             │
│  ├─ Permission enforcement (RBAC)                           │
│  └─ Signature verification                                  │
├─────────────────────────────────────────────────────────────┤
│ Transport & Persistence                                     │
│  ├─ StorageAPI (IndexedDB/AsyncStorage/DB)                  │
│  ├─ Peer connections (WebSocket)                            │
│  └─ CRDT synchronization (CoJSON protocol)                  │
└─────────────────────────────────────────────────────────────┘
```

### Lifecycle: Loading a CoMap

**1. Initialization**
```typescript
useCoState(MyMapSchema, mapId)
```

**2. Subscription Creation**
```
SubscriptionScope created → child for each unresolved ref
CoValueCoreSubscription subscribes to cojson changes
```

**3. Loading from Storage**
```
LocalNode.load(mapId) → StorageAPI → IndexedDB/AsyncStorage
First check local storage, then network peers
```

**4. Permission Checks**
```
Verify account has read access via Group roles
Return unauthorized if denied
```

**5. Nested Ref Resolution**
```
If resolve = { owner: true }, load Group
Create child SubscriptionScope for owner
Recursively resolve nested refs
```

**6. Update Notifications**
```
Peer sends change → LocalNode broadcasts
SubscriptionScope.handleUpdate() processes
React hook triggers re-render via external store
```

**7. Offline Support**
```
Local changes written to storage immediately
Synced to peers when connection restored
Automatic conflict resolution via CRDT
```

### Data Flow During Write

```
user.name = "Alice"
     ↓
CoMapProxyHandler intercepts property set
     ↓
raw.set("name", "Alice")  [cojson RawCoMap]
     ↓
LocalNode broadcasts change
     ↓
StorageAPI persists immediately
     ↓
Peers receive via WebSocket
     ↓
Their SubscriptionScopes get updateValue()
     ↓
React components re-render with new state
```

---

## Schema & Type System

### Schema Definition with Zod

```typescript
import { co } from "jazz-tools";
import { z } from "zod";

const ProfileSchema = co.map({
  name: z.string(),
  bio: z.string().optional(),
  avatar: ImageDefinition,  // Nested CoValue
});

const UserSchema = co.map({
  email: z.string().email(),
  profile: ProfileSchema,      // Nested CoValue
  friends: co.list(UserRef),   // List of refs
  posts: co.feed(PostSchema),  // Append-only log
});

// Create instance
const user = UserSchema.create({
  email: "alice@example.com",
  profile: ProfileSchema.create({
    name: "Alice"
  }, { owner: account })
}, { owner: account });
```

### Type Inference

Jazz provides powerful TypeScript type inference:

```typescript
// MaybeLoaded includes loading states
type MaybeLoaded<T> = T | { [IS_LOADING]: true };

// Resolved with resolve query enforces deep loading
type Resolved<T, Query> = /* ... */;

// InstanceOfSchema converts schema to instance type
type User = InstanceOfSchema<typeof UserSchema>;
```

---

## Key Design Patterns

### 1. Lazy Evaluation
CoValues only loaded when actively subscribed. Prevents unnecessary network traffic and memory usage.

### 2. Eventual Consistency
CRDTs ensure all clients converge to the same state without coordination. Conflicts resolved automatically.

### 3. Pull-Based Sync
Subscribers pull data rather than push model. Clients control what data they need.

### 4. Incremental Updates
Only deltas (changed transactions) synced over network. Efficient bandwidth usage.

### 5. Role-Based Access Control
Permissions embedded in Group structure. Enforced at protocol level with cryptographic signatures.

### 6. Reactive Updates
React integration uses external store pattern. Automatic re-renders on data changes.

### 7. Branching
Experimental branch support for complex multi-step edits with rollback capability.

### 8. Message Queue
Inbox provides reliable message delivery with retry logic and concurrency control.

---

## Summary

Jazz.tools provides a complete stack for building collaborative, distributed applications:

- **Data Abstractions**: Rich set of CoValue types for different use cases
- **Automatic Sync**: Real-time synchronization with offline support
- **Fine-Grained Permissions**: Role-based access control at the data level
- **Type Safety**: Full TypeScript integration with schema validation
- **React Integration**: Hooks for seamless UI updates
- **Offline-First**: Local storage with automatic conflict resolution
- **Extensible**: Platform-agnostic with pluggable storage and auth

The architecture elegantly separates concerns while maintaining tight integration, making it straightforward to build complex collaborative applications without managing infrastructure details.
