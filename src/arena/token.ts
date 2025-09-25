export type TokenProvider = () => string | undefined

let provider: TokenProvider | null = null

export function setArenaAccessTokenProvider(next: TokenProvider | null): void {
  provider = next
}

export function getArenaAccessToken(): string | undefined {
  try {
    return provider ? provider() : undefined
  } catch {
    return undefined
  }
}


