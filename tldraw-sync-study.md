# TLDraw Sync Study Notes

## 1. https://tldraw.dev/docs/sync

### Overview
TLDraw sync is a library for fast, fault-tolerant shared document syncing used in production on tldraw.com. It enables realtime multi-user collaboration on TLDraw canvases.

### Key Components
- **Frontend**: `useSync` hook from `@tldraw/sync` package creates a sync client that manages WebSocket connections and coordinates document state updates
- **Backend**: Consists of WebSocket server, asset storage provider, and optional unfurling service for bookmark metadata

### Backend Architecture
1. **WebSocket Server**: Provides rooms for shared documents, synchronizes and persists document state
2. **Asset Storage**: Handles large binary files (images, videos) 
3. **Unfurling Service**: Extracts metadata about bookmark URLs (optional)

### Deployment Options
1. **Cloudflare Template** (recommended): Uses Durable Objects for unique WebSocket server per room, R2 for persistence and assets
2. **Custom Backend**: Use `@tldraw/sync-core` library in any JavaScript server with WebSocket support

### Client Implementation Pattern
```typescript
const store = useSync({
  uri: `wss://my-custom-backend.com/connect/${myRoomId}`,
  assets: myAssetStore,
})
```

### Asset Store Interface
```typescript
const myAssetStore: TLAssetStore = {
  upload(file, asset) { return uploadFileAndReturnUrl(file) },
  resolve(asset) { return asset.props.src }
}
```

### Custom Shapes & Bindings
- Client: Pass `shapeUtils` and `bindingUtils` to `useSync`
- Server: Use `createTLSchema` with shape schemas and migrations for validation and compatibility

### Migration Support
TLSocketRoom supports loading TLStoreSnapshot snapshots, enabling migration from legacy systems by converting old data formats to TLDraw's snapshot format.

### Deployment Concerns
- Client and server versions must match
- Backend updates should precede client rollouts
- Occasional breaking changes may require "please refresh" messages

## 2. https://github.com/tldraw/tldraw-sync-cloudflare

### Repository Overview
This is a Cloudflare-based template for hosting TLDraw sync backend, providing multiplayer functionality using Durable Objects and R2 storage.

### Key Features
- Production-grade minimal setup
- Uses Durable Objects for per-room WebSocket servers
- R2 for document snapshots and binary assets
- Template for self-hosted multiplayer TLDraw apps

### What's Not Included
- Authentication/authorization
- Rate limiting for uploads
- Asset size limiting
- Long-term document history snapshots
- Room listing/search functionality

### Usage
- Clone and deploy to Cloudflare
- Customize for specific needs
- Add missing features as required

### Components
- Worker code for Cloudflare deployment
- Client-side integration examples
- Asset handling utilities
- Local storage helpers

## 3. https://developers.cloudflare.com/workers/vite-plugin/

### Purpose
Cloudflare Workers Vite plugin enables building and deploying applications to Cloudflare Workers directly from Vite.

### Key Benefits
- Streamlined development workflow
- Direct deployment to Workers platform
- Integration with existing Vite build processes
- Support for modern JavaScript/TypeScript development

### Usage Context
This plugin is used in the TLDraw Cloudflare template to build and deploy the multiplayer backend to Cloudflare's edge network.

## 4. https://github.com/tldraw/tldraw-sync-cloudflare/blob/main/worker/worker.ts

### Main Worker Entry Point
This is the main Cloudflare Worker file that handles routing for the TLDraw sync backend.

### Key Components
- **Durable Object Export**: Exports `TldrawDurableObject` class for Cloudflare's Durable Objects system
- **Router Setup**: Uses `itty-router` for handling HTTP requests with CORS enabled
- **Route Handlers**:
  - `/api/connect/:roomId` - Routes WebSocket connections to Durable Objects for realtime sync
  - `/api/uploads/:uploadId` (POST) - Handles asset uploads
  - `/api/uploads/:uploadId` (GET) - Handles asset downloads
  - `/api/unfurl` - Handles bookmark URL unfurling for metadata extraction

### Architecture Pattern
- Each room gets its own Durable Object instance (via `idFromName`)
- WebSocket connections are handled by Durable Objects for state management
- Assets are stored separately in R2 buckets
- Bookmark unfurling uses external `cloudflare-workers-unfurl` library

### Security Notes
- CORS is enabled for cross-origin requests (restrict to own domain in production)
- No authentication shown in this basic template

## 5. https://github.com/tldraw/tldraw-sync-cloudflare/blob/main/worker/TldrawDurableObject.ts

### Durable Object Implementation
This class implements the core realtime synchronization logic using Cloudflare Durable Objects.

### Key Responsibilities
- **Room Management**: Each instance manages one whiteboard room
- **WebSocket Handling**: Accepts WebSocket connections from clients
- **State Persistence**: Persists room snapshots to R2 bucket
- **Schema Validation**: Uses TLDraw schema for data validation

### Initialization Process
```typescript
constructor(ctx: DurableObjectState, env: Env) {
  this.r2 = env.TLDRAW_BUCKET
  // Load roomId from Durable Object storage
  this.roomId = await this.ctx.storage.get('roomId')
}
```

### Connection Handling
1. **WebSocket Pair Creation**: Creates client/server WebSocket pair
2. **Room Loading**: Loads or creates TLSocketRoom instance
3. **Client Connection**: Connects client to room via `room.handleSocketConnect()`
4. **Return WebSocket**: Returns WebSocket connection to client

### Room Creation Logic
- **Lazy Loading**: Room is created only when first accessed
- **Snapshot Loading**: Attempts to load existing room data from R2 bucket
- **Fallback**: Creates empty room if no snapshot exists
- **Schema Integration**: Uses `createTLSchema` with default shapes

### Persistence Strategy
- **Throttled Persistence**: Uses lodash.throttle to persist every 10 seconds
- **Change Detection**: `onDataChange` callback triggers persistence
- **JSON Serialization**: Converts room snapshot to JSON for R2 storage
- **Path Structure**: Rooms stored as `rooms/${roomId}` in R2 bucket

### Schema Configuration
```typescript
const schema = createTLSchema({
  shapes: { ...defaultShapeSchemas },
  // bindings: { ...defaultBindingSchemas }, // commented out
})
```
- Supports custom shapes and bindings (currently using defaults)
- Schema ensures data consistency across clients

## 6. https://github.com/tldraw/tldraw-sync-cloudflare/blob/main/worker/assetUploads.ts

### Asset Storage Implementation
Handles upload and download of binary assets (images, videos) for TLDraw whiteboards.

### Upload Process
1. **Object Naming**: Sanitizes uploadId to create safe R2 object names
2. **Content Type Validation**: Only allows `image/*` and `video/*` content types
3. **Duplicate Prevention**: Checks if upload already exists (409 conflict)
4. **R2 Storage**: Stores asset directly in Cloudflare R2 bucket

### Download Process
1. **Cache First**: Checks Cloudflare cache for existing response
2. **R2 Retrieval**: Fetches from R2 bucket with range request support
3. **Metadata Headers**: Copies HTTP metadata from R2 object to response
4. **Caching Strategy**: Sets aggressive caching headers (1 year immutable)
5. **CORS Headers**: Allows cross-origin access to assets

### Performance Optimizations
- **HTTP Caching**: Assets cached for 1 year with immutable flag
- **Range Requests**: Supports partial content delivery
- **ETag Support**: Proper ETag headers for cache validation
- **Background Caching**: Uses `ctx.waitUntil()` for non-blocking cache writes

### Security Considerations
- **Content Type Restriction**: Only allows image/video uploads
- **Path Sanitization**: Prevents path traversal attacks
- **CORS Configuration**: Allows asset access from any origin

## 7. https://github.com/tldraw/tldraw-sync-cloudflare/blob/main/client/multiplayerAssetStore.tsx

### Client-Side Asset Management
Implements the `TLAssetStore` interface for handling assets in multiplayer TLDraw applications.

### Upload Implementation
```typescript
async upload(_asset, file) {
  const id = uniqueId()
  const objectName = `${id}-${file.name}`.replace(/[^a-zA-Z0-9.]/g, '-')
  const url = `/api/uploads/${objectName}`

  const response = await fetch(url, { method: 'POST', body: file })
  if (!response.ok) throw new Error(`Failed to upload asset: ${response.statusText}`)

  return { src: url }
}
```

**Key Steps**:
1. **Unique Naming**: Creates unique ID and sanitizes filename
2. **Direct Upload**: POSTs file directly to worker endpoint
3. **URL Return**: Returns API URL for asset resolution

### Resolution Strategy
```typescript
resolve(asset) {
  return asset.props.src  // Uses stored API URL directly
}
```

- **Simple Resolution**: No additional processing needed
- **API-Based Access**: Assets served through worker endpoints
- **Extensible**: Could add authentication, optimization, or CDN layers

### Error Handling
- **Upload Failures**: Throws descriptive error messages
- **Network Issues**: Relies on fetch error propagation

## 8. https://github.com/tldraw/tldraw-sync-cloudflare/blob/main/client/main.tsx

### Client Application Entry Point
Basic React application setup with routing for multiplayer TLDraw rooms.

### Routing Structure
```typescript
const router = createBrowserRouter([
  { path: '/', element: <Root /> },
  { path: '/:roomId', element: <Room /> },
])
```

- **Root Route**: Landing page (likely room list or creation)
- **Dynamic Room Route**: Individual whiteboard rooms by ID
- **React Router**: Uses modern React Router v6

### Application Setup
- **Strict Mode**: Enables React strict mode for development checks
- **Router Provider**: Wraps app with routing context
- **Standard React**: Conventional React 18 setup with createRoot

### Architecture Notes
- **Separation of Concerns**: Room logic separated into `<Room />` component
- **URL-Based Rooms**: Room ID derived from URL path
- **Scalable Structure**: Easy to add more routes (settings, user profiles, etc.)

## 9. https://github.com/tldraw/tldraw-sync-cloudflare/blob/main/client/getBookmarkPreview.tsx

### Bookmark Unfurling Implementation
Handles metadata extraction for URLs when users create bookmark shapes in TLDraw.

### Process Flow
1. **Asset Creation**: Creates empty `TLBookmarkAsset` record with URL as ID
2. **Server Request**: Fetches metadata from `/api/unfurl` endpoint
3. **Data Population**: Fills asset properties with retrieved metadata
4. **Error Handling**: Gracefully handles fetch failures

### Asset Structure
```typescript
const asset: TLBookmarkAsset = {
  id: AssetRecordType.createId(getHashForString(url)), // Deterministic ID from URL
  typeName: 'asset',
  type: 'bookmark',
  props: {
    src: url,
    description: '',
    image: '',
    favicon: '',
    title: '',
  },
}
```

### Metadata Fields
- **title**: Page title
- **description**: Page description/meta description
- **image**: Preview image URL
- **favicon**: Site favicon URL

### Error Resilience
- **Fallback Values**: Empty strings if metadata unavailable
- **Console Logging**: Errors logged but don't break bookmark creation
- **Graceful Degradation**: Bookmark works even without metadata

### Integration Pattern
This function would be registered with the TLDraw editor:
```typescript
editor.registerExternalAssetHandler('url', getBookmarkPreview)
```

## 10. https://github.com/tldraw/tldraw-sync-cloudflare/blob/main/client/localStorage.ts

### Local Storage Utilities
Provides safe wrappers around browser localStorage API with error handling.

### Safety Features
- **Try-Catch Blocks**: Handles cases where localStorage is unavailable
- **Console Warnings**: Logs errors without throwing exceptions
- **Graceful Degradation**: Returns null/false instead of crashing

### Available Functions
- **getLocalStorageItem(key)**: Safe retrieval with error handling
- **setLocalStorageItem(key, value)**: Safe storage with error handling  
- **removeLocalStorageItem(key)**: Safe deletion with error handling

### Use Cases
- **User Preferences**: Storing UI settings, theme preferences
- **Session Data**: Remembering user state between visits
- **Offline Support**: Caching data for offline functionality
- **Feature Flags**: Client-side feature toggles

### Browser Compatibility
Handles scenarios where localStorage is:
- **Disabled**: Privacy settings or browser restrictions
- **Unavailable**: Server-side rendering or restricted environments
- **Quota Exceeded**: Storage limits reached
- **Corrupted**: Invalid data stored

### Design Pattern
- **Non-Throwing**: Never throws exceptions, always returns safe values
- **Logging**: Warns about issues for debugging
- **Consistent API**: Matches native localStorage interface

## Synthesis: TLDraw Sync Architecture Patterns

### Core Architecture Summary

**TLDraw Sync** provides a complete solution for realtime collaborative whiteboards:

1. **Backend (Cloudflare Workers + Durable Objects)**:
   - **Durable Objects**: Provide unique WebSocket server per room
   - **R2 Storage**: Persist document snapshots and binary assets
   - **TLSocketRoom**: Handles sync protocol and WebSocket connections
   - **Schema Validation**: Ensures data consistency across clients

2. **Frontend (React + TLDraw)**:
   - **`useSync` hook**: Creates sync client with WebSocket connection
   - **`TLAssetStore`**: Manages asset upload/download lifecycle
   - **External Handlers**: Handle bookmark unfurling and custom assets

### Key Design Patterns

#### 1. Room-Based Architecture
- Each whiteboard room = one Durable Object instance
- Deterministic room lookup via `idFromName(roomId)`
- Isolated state management per room
- Lazy loading of room data from persistent storage

#### 2. Eventual Consistency with Persistence
- **In-Memory State**: Fast realtime updates via WebSocket
- **Throttled Persistence**: Snapshot saves every 10 seconds
- **Change Callbacks**: `onDataChange` triggers background persistence
- **JSON Snapshots**: Full document state stored as serialized JSON

#### 3. Asset Management Pipeline
- **Upload**: Client → Worker → R2 bucket
- **Storage**: Sanitized filenames, content-type validation
- **Delivery**: CDN caching, range request support, CORS headers
- **Resolution**: Direct URL access through API endpoints

#### 4. Schema-Driven Validation
- **TLDraw Schema**: Defines valid shapes, bindings, and migrations
- **Version Compatibility**: Ensures clients with different versions can collaborate
- **Custom Extensions**: Support for custom shapes and validation rules

### Relation to Current Project

Your `curl_site` project already uses:
- **TLDraw** for canvas functionality
- **Jazz** for collaborative data management (see `src/jazz/` directory)
- **Custom layouts** and components in `src/arena/`

The Cloudflare template provides an **alternative backend architecture** to Jazz:
- **Durable Objects** vs **Jazz CoValues** for state management
- **WebSocket-based sync** vs **Jazz's CRDT approach**
- **R2 storage** vs **Jazz's built-in persistence**

### Integration Opportunities

You could potentially:
1. **Use both systems**: Jazz for user data/social features, TLDraw sync for canvas collaboration
2. **Compare approaches**: Study performance characteristics of each sync mechanism
3. **Hybrid solution**: Use TLDraw sync for canvas state, Jazz for metadata/assets
4. **Migration path**: Move from one system to another based on requirements

### Production Considerations

**Missing from Template** (as noted in repo):
- Authentication/authorization
- Rate limiting for uploads/assets
- Asset size restrictions
- Long-term document history
- Room listing/search functionality

**Deployment Requirements**:
- Cloudflare account with Workers and R2
- Matching client/server TLDraw versions
- CORS configuration for your domain
- Monitoring and scaling considerations

### Next Steps for Implementation

1. **Choose Backend**: Decide between Jazz (current) vs TLDraw sync vs hybrid
2. **Authentication**: Implement user management and room access control
3. **Asset Strategy**: Design asset storage and delivery pipeline
4. **Scaling**: Plan for multiple rooms and concurrent users
5. **Migration**: If switching from Jazz, plan data migration strategy
