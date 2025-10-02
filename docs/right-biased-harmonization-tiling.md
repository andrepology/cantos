# Right-Biased Harmonization Tiling Algorithm

## Overview

The Right-Biased Harmonization Tiling Algorithm is an intelligent tile placement strategy that creates visually harmonious layouts by analyzing obstacle relationships and optimizing for equal gaps, visual continuity, and spatial efficiency.

## Algorithm Principles

### Core Philosophy
Instead of geometric pattern expansion (like spirals), this algorithm adapts to the actual layout of existing shapes, finding optimal positions that maintain visual harmony through equal spacing and edge alignment.

### Key Objectives
1. **Gap Equality**: Maintain consistent spacing between the anchor shape and surrounding obstacles
2. **Visual Continuity**: Preserve edge alignments to create seamless visual flow
3. **Right Bias**: Slight preference for rightward placements while remaining flexible
4. **Obstacle Awareness**: Generate positions based on actual shape relationships rather than abstract patterns

## Algorithm Flow

### Phase 1: Initial Right Placement
```
1. Start with immediate right position (anchor.x + anchor.w + gap, anchor.y)
2. Test for collisions with existing shapes
3. If no collision: Use this position
4. If collision: Proceed to obstacle analysis
```

### Phase 2: Obstacle Analysis
```
1. Identify all shapes colliding with the initial candidate
2. Calculate nearest obstacle edges (left, right, top, bottom)
3. Determine available spaces near each obstacle
4. Generate proximity candidates in gaps between obstacles
```

### Phase 3: Proximity Candidate Generation
```
For each colliding obstacle:
- Generate position to the right: (obstacle.x + obstacle.w + harmonizationGap, anchor.y)
- Generate position below: (anchor.x, obstacle.y + obstacle.h + harmonizationGap)
- Prioritize by Manhattan distance from anchor center
- Filter by maximum proximity distance limit
```

### Phase 4: Harmonization Scoring
Each candidate receives a composite score based on three weighted factors:

#### Gap Equality (50% weight)
- Measures how equal gaps are to the target harmonization gap
- Rewards consistency across multiple gaps
- Formula: `score = average(|actual_gap - target_gap| / target_gap)`

#### Anchor Proximity (30% weight)
- Prefers positions closer to the anchor shape
- Uses Manhattan distance normalized by reasonable maximum
- Formula: `score = 1 - (distance / max_reasonable_distance)`

#### Right Bias (20% weight)
- Slight preference for rightward positioning
- Diminishing returns for extreme right positions
- Formula: `score = sqrt(min(right_offset / max_reasonable_right, 1))`

### Phase 5: Alignment Enforcement
```
During size adjustments:
1. Identify the nearest anchor edge (left/right/top/bottom)
2. Preserve that edge alignment during shrinking
3. Ensure minimum size constraints are respected
4. Maintain aspect ratio relationships when possible
```

## Implementation Components

### ObstacleAnalyzer (`obstacleAnalyzer.ts`)
- **analyzeObstacles()**: Identifies colliding shapes and calculates edge distances
- **EdgeInfo**: Contains shape ID, edge type, position, and distance
- **ObstacleAnalysis**: Colliding shapes, nearest edges, and available spaces

### ProximityGenerator (`proximityGenerator.ts`)
- **generateProximityCandidates()**: Yields obstacle-adaptive position candidates
- **ProximityCandidate**: Position with distance and priority metadata
- Prioritizes positions by distance from anchor (closer = higher priority)

### HarmonizationScorer (`harmonizationScorer.ts`)
- **scoreHarmonization()**: Calculates composite harmonization score
- **findBestHarmonizedCandidate()**: Selects optimal candidate from valid options
- Weighted scoring system balancing gap equality, proximity, and right bias

### AlignmentEnforcer (`alignmentEnforcer.ts`)
- **enforceAlignment()**: Applies alignment-preserving size adjustments
- **enforceMinimumAlignment()**: Ensures at least one edge alignment is maintained
- **validateAlignmentConstraints()**: Verifies bounds and size requirements

## Configuration Parameters

### TilingParams Extensions
```typescript
interface TilingParams {
  // ... existing params
  harmonizationGap?: number        // Target gap size (default: params.gap)
  maxProximityDistance?: number    // Max distance for obstacle search (default: 500)
  alignmentMode?: 'strict' | 'flexible'  // Alignment enforcement (default: 'flexible')
}
```

### Candidate Sources
- `'obstacle-adaptive'`: Positions generated near obstacles
- `'gap-harmonized'`: Size-adjusted variants for gap filling

## Usage Example

```typescript
const params: TilingParams = {
  grid: 16,
  gap: 16,
  harmonizationGap: 20,           // Slightly larger gap for harmonization
  maxProximityDistance: 400,      // Search within 400px radius
  alignmentMode: 'flexible',      // Allow some alignment flexibility
  mode: 'right-biased-harmonization'
}

const candidate = computePreviewCandidate({
  editor,
  anchor,
  tileSize,
  params,
  // ... other options
})
```

## Advantages Over Traditional Approaches

### vs. Spiral Algorithm
- **Obstacle-Aware**: Adapts to actual layout instead of geometric patterns
- **Gap Optimization**: Creates equal spacing relationships
- **Visual Harmony**: Maintains alignment and continuity

### vs. Sweep Algorithm
- **Intelligent Positioning**: Goes beyond simple directional sweeps
- **Harmonization**: Optimizes for equal gaps across multiple obstacles
- **Right Bias**: Natural flow preference without being restrictive

## Performance Characteristics

- **Complexity**: O(n) where n is number of nearby shapes
- **Early Termination**: Stops when collision-free candidate found
- **Proximity Limiting**: Bounded search radius prevents excessive computation
- **Grid Optimization**: Uses grid snapping for alignment efficiency

## Debug Visualization

In debug mode, the algorithm provides detailed candidate analysis:
- **Accepted candidates**: Green outlines
- **Rejected by bounds**: Red outlines
- **Rejected by collisions**: Red outlines
- **Rejected as duplicates**: Gray outlines
- **Gap harmonization variants**: Show size adjustment attempts

## Future Enhancements

### Potential Improvements
1. **Multi-axis harmonization**: Consider both horizontal and vertical gap relationships
2. **Shape-aware sizing**: Adjust tile dimensions based on available space contours
3. **Dynamic gap calculation**: Adapt gap sizes based on shape relationships
4. **Visual weight consideration**: Factor in shape sizes when determining optimal positioning

### Advanced Features
1. **Layout pattern recognition**: Learn from successful placements
2. **Contextual bias adjustment**: Modify right bias based on layout context
3. **Harmonic progression**: Create pleasing size relationships between tiles

## Integration Points

### Preview System Integration
- Added to `computePreviewCandidate()` as new mode dispatch
- Integrated with existing validation and bounds checking
- Compatible with debug visualization system

### UI Controls
- Algorithm selection dropdown in debug controls
- Real-time mode switching capability
- Configuration parameter exposure

## Conclusion

The Right-Biased Harmonization Algorithm represents a significant advancement in intelligent tile placement, moving beyond geometric patterns to create layouts that truly harmonize with existing content. By analyzing obstacle relationships and optimizing for equal gaps and visual continuity, it produces more natural and aesthetically pleasing arrangements while maintaining the performance characteristics needed for interactive applications.
