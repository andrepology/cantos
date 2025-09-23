export const config = { runtime: 'edge' }

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') || undefined
  const [nonce, encodedReturnTo] = (state ?? '::').split('::')
  const returnTo = encodedReturnTo ? decodeURIComponent(encodedReturnTo) : url.origin
  if (!code) {
    return new Response('Missing code', { status: 400 })
  }

  const env = (globalThis as any).process?.env ?? {}
  const authHost = env.ARENA_AUTH_HOST || 'https://dev.are.na'
  const clientId = env.ARENA_CLIENT_ID
  const clientSecret = env.ARENA_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return new Response('Server not configured', { status: 500 })
  }

  // Must match exactly what was used on authorize
  const redirectUri = `${url.origin}${url.pathname}`

  const tokenUrl = `${authHost}/oauth/token`
  const form = new URLSearchParams()
  form.set('client_id', clientId)
  form.set('client_secret', clientSecret)
  form.set('code', code)
  form.set('grant_type', 'authorization_code')
  form.set('redirect_uri', redirectUri)

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    return new Response(`Token exchange failed: ${res.status} ${text}`, { status: 500 })
  }
  const json = (await res.json()) as any
  const accessToken = json?.access_token as string | undefined
  if (!accessToken) {
    return new Response('Missing access_token in response', { status: 500 })
  }

  const target = `${returnTo}/#access_token=${encodeURIComponent(accessToken)}${nonce ? `&state=${encodeURIComponent(nonce)}` : ''}`
  return Response.redirect(target, 302)
}


