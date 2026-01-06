import uFuzzy from '@leeoniya/ufuzzy'

/**
 * Fuzzy search utility for Arena channels.
 * 
 * Generic fuzzy search over channel-like objects with title and slug.
 * Uses uFuzzy with forgiving match settings for fast, typo-tolerant search.
 */

// Shared uFuzzy instance with optimized config
const fuzzySearcher = new uFuzzy({
  intraMode: 1, // MultiInsert mode for forgiving matching
  intraIns: 1,  // Allow insertions within terms
  intraSub: 1,  // Allow substitutions within terms
  intraTrn: 1,  // Allow transpositions within terms
  intraDel: 1   // Allow deletions within terms
})

/**
 * Fuzzy search channels by title and slug.
 * 
 * @param channels - Array of channels to search (must have title and slug)
 * @param query - Search query string
 * @returns Ranked array of matching channels
 * 
 * Example:
 * ```ts
 * const results = fuzzySearchChannels(allChannels, 'dsgn insp')
 * // Matches: "Design Inspiration", "inspiring-designs", etc.
 * ```
 */
export function fuzzySearchChannels<T extends { title?: string; slug?: string }>(
  channels: T[],
  query: string
): T[] {
  if (!channels.length) return []
  
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return channels
  
  // Build haystack: combine title and slug for better matching
  const haystack = channels.map(ch => 
    `${ch.title || ''} ${ch.slug || ''}`.toLowerCase()
  )
  
  // Perform fuzzy search
  const idxs = fuzzySearcher.filter(haystack, trimmedQuery.toLowerCase())
  
  if (!idxs || idxs.length === 0) return []
  
  // Get match info for ranking
  const info = fuzzySearcher.info(idxs, haystack, trimmedQuery.toLowerCase())
  const order = fuzzySearcher.sort(info, haystack, trimmedQuery.toLowerCase())
  
  // Map sorted indices back to channel objects
  return order.map(i => channels[info.idx[i]])
}




