# Jazz Playbook Merge Plan

## Goal
Create a dense, DRY playbook optimized for LLM code generation that combines:
- Prescriptive rules from jazz-playbook.md
- Architectural context from jazz-tools-systems-model.md
- Maximum information density, minimum repetition

## Proposed Structure

### 1. GROUND RULES & SYSTEM ARCHITECTURE (10 rules + arch overview)
- **Keep**: The 10 never-violate rules (essential for LLM)
- **Add**: Condensed 4-layer architecture diagram
- **Add**: Package structure (one compact tree)
- **Skip**: Detailed dependency descriptions (not needed for code gen)

### 2. CORE ABSTRACTIONS REFERENCE (CoValues)
- **Merge**: CoValue type descriptions from both docs
- **Format**: Dense table with Type | Purpose | Key Methods | Ownership
- **Keep**: Account, Group, CoMap, CoList, CoFeed, Inbox
- **Skip**: CoVector, CoPlainText details (less common)
- **Add**: Loading states enum reference

### 3. SUBSCRIPTION & LOADING PATTERNS
- **Keep**: All resolve query examples (critical)
- **Keep**: useCoState, loadCoValue, subscribe patterns
- **Add**: SubscriptionScope concept (one sentence)
- **Skip**: Internal subscription tree details
- **Keep**: Schema-level .resolved() pattern
- **Keep**: All loading state guards

### 4. MUTATION PATTERNS
- **Keep**: All $jazz.set/push/splice/append examples
- **Skip**: Redundant explanations of CRDT
- **Add**: Quick reference table: CoValue Type → Mutation Methods

### 5. PERMISSIONS & SHARING
- **Keep**: RBAC model diagram
- **Keep**: Group creation/membership examples
- **Add**: Permission checking methods table
- **Skip**: Detailed permission flow (covered by examples)

### 6. SERVER PATTERNS (Workers, HTTP, Inbox, SSR)
- **Keep**: Both HTTP and Inbox patterns with full examples
- **Keep**: SSR createSSRJazzAgent pattern
- **Add**: When to use HTTP vs Inbox (one decision tree)
- **Skip**: Detailed session management (internal)

### 7. SCHEMA & TYPE SYSTEM
- **Keep**: All co.* schema patterns
- **Keep**: Zod integration examples
- **Keep**: Recursive schema pattern
- **Add**: Type inference helpers table (MaybeLoaded, Resolved, etc.)
- **Skip**: Verbose schema composition explanations

### 8. COMAPS & COLISTS DEEP DIVE
- **Keep**: All struct vs record patterns
- **Keep**: unique/upsertUnique
- **Keep**: CoList mutation API ($jazz.push/remove/retain/splice)
- **Keep**: Set-like collections pattern
- **Skip**: Redundant iterator examples

### 9. PERFORMANCE & SCALE
- **Keep**: Lazy loading principle
- **Keep**: Virtualization pattern
- **Keep**: Shallow-first subscription advice
- **Add**: One-sentence CRDT conflict resolution model
- **Skip**: Internal caching details

### 10. ERROR HANDLING & LOADING STATES
- **Keep**: Exact guard pattern (if (!cv.$isLoaded) switch...)
- **Keep**: All three loading states
- **Skip**: Redundant explanations

### 11. ANTI-PATTERNS → CORRECTIONS
- **Keep**: All ❌ → ✅ pairs (critical for LLM)
- **Add**: Common mistakes from systems model perspective
- **Format**: Dense table

### 12. QUICK REFERENCE
- **Keep**: Micro-recipes
- **Keep**: Glossary (REST → Jazz mappings)
- **Keep**: 5-6 most essential code gallery examples
- **Reduce**: Remove redundant examples that don't show new patterns
- **Add**: API quick reference (one-liners for key methods)

### 13. LLM SELF-CHECK
- **Keep**: All 8 checklist items
- **Add**: Architecture alignment check

## What Gets Eliminated
- Verbose architectural explanations of internal workings
- Duplicate code examples showing the same pattern
- Deep dives into cojson internals (StorageAPI details, etc.)
- Transport layer details (WebSocket internals)
- Session provider implementation details
- Multiple variations of the same pattern

## What Gets Condensed
- Package structure → single tree diagram
- Architecture → 4-layer stack diagram only
- CoValue descriptions → table format
- Permission model → diagram + table only
- Type system → table of helpers + key examples

## Density Techniques
1. **Tables over prose**: CoValue types, permissions, mutations
2. **Code over explanation**: Show pattern once, don't explain
3. **Hierarchical**: Rules → Concepts → Patterns → Reference
4. **Cross-references**: "See §3.2" instead of repeating
5. **Inline annotations**: Comments in code replace paragraphs

## Estimated Size Reduction
- Current total: ~1100 lines (playbook) + ~830 lines (systems model) = 1930 lines
- Target merged: ~900-1000 lines (50% reduction)
- Maintain 100% pattern coverage with <60% size

## Open Questions
1. Keep expanded code gallery or reduce to essentials?
   - **Proposal**: Keep 6-8 examples that show unique patterns, remove duplicates

2. How much architecture context is useful for LLM?
   - **Proposal**: Just enough to understand why patterns exist, not how internals work

3. Preserve playbook's conversational tone vs more reference-like?
   - **Proposal**: Keep prescriptive tone ("Never", "Always", "Use X not Y") but remove casual asides
