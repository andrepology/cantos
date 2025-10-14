export const config = { runtime: 'edge' }

const ALLOWED_HOSTS = new Set<string>([
  'static.avatars.are.na',
])

export default async function handler(req: Request): Promise<Response> {
  try {
    const url = new URL(req.url)
    const target = url.searchParams.get('url')
    if (!target) {
      return new Response('Missing url', { status: 400 })
    }
    let targetUrl: URL
    try {
      targetUrl = new URL(target)
    } catch {
      return new Response('Invalid url', { status: 400 })
    }
    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return new Response('Unsupported protocol', { status: 400 })
    }
    if (!ALLOWED_HOSTS.has(targetUrl.hostname)) {
      return new Response('Host not allowed', { status: 403 })
    }

    const upstream = await fetch(targetUrl.toString(), {
      // Avoid sending cookies/credentials
      method: 'GET',
      headers: {
        'accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'user-agent': 'curl_site-image-proxy',
      },
      redirect: 'follow',
      cache: 'no-store',
    })

    if (!upstream.ok) {
      return new Response(`Upstream fetch failed: ${upstream.status}`, { status: 502 })
    }

    const resHeaders = new Headers()
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    resHeaders.set('content-type', contentType)
    const len = upstream.headers.get('content-length')
    if (len) resHeaders.set('content-length', len)
    // Cache: allow edge/browser caching
    resHeaders.set('cache-control', 'public, max-age=3600, s-maxage=86400, immutable')

    return new Response(upstream.body, {
      status: 200,
      headers: resHeaders,
    })
  } catch (e) {
    return new Response('Internal error', { status: 500 })
  }
}


