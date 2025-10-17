# Are.na API Extensions

## Content Management

### POST /v2/channels/:slug/connections
Connect existing blocks/channels to a channel

**Request:**
```json
{
  "connectable_type": "Block" | "Channel",
  "connectable_id": number
}
```

**Response:**
```json
{
  "id": number,
  "title": string,
  "class": string,
  "position": number,
  "connection_id": number,
  "connected_at": string,
  "user": { /* user object */ }
}
```

**Notes:** Enables block reusability across channels. Requires authentication.

### PUT /blocks/:id
Update block content (text blocks only)

**Request:**
```json
{
  "title": "New title (optional)",
  "description": "New description (optional)",
  "content": "New content (optional)"
}
```

**Response:**
```json
{
  "id": number,
  "title": string,
  "content": string,
  "description": string,
  "updated_at": string
}
```

**Notes:** Only block owners can edit. Text blocks are editable (not immutable).

## Social Features

### POST /users/:id/follow
Follow a user

**Request:** Empty body
**Response:** Empty string on success
**Notes:** Undocumented endpoint. Requires authentication.

### DELETE /users/:id/follow
Unfollow a user

**Request:** Empty body
**Response:** Empty string on success
**Notes:** Undocumented endpoint. Requires authentication.

### POST /channels/:id/follow
Follow a channel

**Request:** Empty body
**Response:** Empty string on success
**Notes:** Undocumented endpoint. Requires authentication.

### DELETE /channels/:id/follow
Unfollow a channel

**Request:** Empty body
**Response:** Empty string on success
**Notes:** Undocumented endpoint. Requires authentication.

## Activity Feeds

### GET /v2/feed
Get activity feed of followed users

**Query Params:** `page`, `per` (default 50)

**Response:**
```json
{
  "items": [
    {
      "action": "added" | "commented on",
      "item": { /* block/channel */ },
      "target": { /* channel */ },
      "user": { /* user */ },
      "created_at": string
    }
  ]
}
```

### GET /v2/feed?user_id=:id
Get activity feed for specific user

**Query Params:** `user_id`, `page`, `per`
**Notes:** Shows public curation activities. No authentication required.

## Following Lists

### GET /v2/users/:id/following
Get users and channels followed by a user

**Query Params:** `page`, `per`

**Response:**
```json
{
  "following": [
    {
      // Users: base_class: "User"
      "id": number,
      "username": string,
      "base_class": "User"
    },
    {
      // Channels: base_class: "Channel"
      "id": number,
      "title": string,
      "base_class": "Channel"
    }
  ]
}
```

**Notes:** Mixed array distinguished by `base_class`. Requires authentication.

## Key Patterns

- **Empty responses = success** for follow/unfollow/edit operations
- **Ownership required** for block editing (401 on unowned blocks)
- **Block reusability** via connections (not just creation)
- **Mixed content types** in responses (users + channels)

## Discovery Notes

- Found through browser network inspection and systematic testing
- Some endpoints may be internal/testing APIs
- Rate limiting and terms of service apply
