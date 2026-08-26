import { createHash, randomBytes, randomUUID } from 'node:crypto'
import http from 'node:http'
import postgres from 'postgres'
import { loadStackSecrets, signJwt, stackConfig, verifyJwt } from './lib.mjs'

/**
 * Dev-stack API gateway: replaces the Kong entrypoint of `supabase start`
 * for environments without Docker. It proxies PostgREST under /rest/v1 and
 * ships minimal GoTrue-compatible (/auth/v1) and Storage-compatible
 * (/storage/v1) shims that are just complete enough for this repository's
 * server runtime and integration tests. Never use it as a production
 * service.
 */

const secrets = loadStackSecrets()
const sql = postgres(stackConfig.dbSuperuserUrl, { max: 4, onnotice: () => {} })

function readBody(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    const chunks = []
    request.on('data', (chunk) => chunks.push(chunk))
    request.on('end', () => resolvePromise(Buffer.concat(chunks)))
    request.on('error', rejectPromise)
  })
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(statusCode, {
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json',
  })
  response.end(body)
}

function bearerToken(request) {
  const header = request.headers.authorization
  if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ')) {
    return header.slice(7).trim()
  }

  const apiKey = request.headers.apikey
  return typeof apiKey === 'string' ? apiKey.trim() : undefined
}

function requestRole(request) {
  const claims = verifyJwt(bearerToken(request), secrets.jwtSecret)

  return claims?.role
}

function hashPassword(password) {
  return createHash('sha256').update(`dev-stack:${password}`).digest('hex')
}

function toAuthUser(row) {
  return {
    app_metadata: { provider: 'email', providers: ['email'] },
    aud: 'authenticated',
    created_at: row.created_at,
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    id: row.id,
    role: 'authenticated',
    updated_at: row.updated_at,
    user_metadata: row.raw_user_meta_data ?? {},
  }
}

function createSessionPayload(row) {
  const expiresIn = 60 * 60
  const accessToken = signJwt(
    { email: row.email, role: 'authenticated', sub: row.id },
    secrets.jwtSecret,
    expiresIn,
  )

  return {
    access_token: accessToken,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    expires_in: expiresIn,
    refresh_token: randomBytes(24).toString('base64url'),
    token_type: 'bearer',
    user: toAuthUser(row),
  }
}

async function handleAuth(request, response, pathname, body) {
  if (request.method === 'POST' && pathname === '/auth/v1/signup') {
    const payload = JSON.parse(body.toString('utf8') || '{}')
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const password = typeof payload.password === 'string' ? payload.password : ''

    if (!email || !password) {
      return sendJson(response, 400, { error_code: 'validation_failed', msg: 'Email and password are required' })
    }

    const existing = await sql`select id from auth.users where email = ${email}`
    if (existing.length > 0) {
      return sendJson(response, 422, { error_code: 'user_already_exists', msg: 'User already registered' })
    }

    const metadata = payload.data && typeof payload.data === 'object' ? payload.data : {}
    const [row] = await sql`
      insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
      values (${randomUUID()}, ${email}, ${hashPassword(password)}, ${sql.json(metadata)})
      returning id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at
    `

    return sendJson(response, 200, createSessionPayload(row))
  }

  if (request.method === 'POST' && pathname === '/auth/v1/token') {
    const payload = JSON.parse(body.toString('utf8') || '{}')
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const password = typeof payload.password === 'string' ? payload.password : ''
    const [row] = await sql`
      select id, email, encrypted_password, raw_user_meta_data, email_confirmed_at, created_at, updated_at
      from auth.users where email = ${email}
    `

    if (!row || row.encrypted_password !== hashPassword(password)) {
      return sendJson(response, 400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
    }

    return sendJson(response, 200, createSessionPayload(row))
  }

  if (request.method === 'GET' && pathname === '/auth/v1/user') {
    const claims = verifyJwt(bearerToken(request), secrets.jwtSecret)
    if (!claims?.sub) return sendJson(response, 401, { msg: 'Invalid token' })

    const [row] = await sql`
      select id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at
      from auth.users where id = ${claims.sub}
    `
    if (!row) return sendJson(response, 404, { msg: 'User not found' })

    return sendJson(response, 200, toAuthUser(row))
  }

  if (request.method === 'POST' && pathname === '/auth/v1/logout') {
    response.writeHead(204)
    return response.end()
  }

  return sendJson(response, 404, { msg: `Dev-stack auth shim does not implement ${request.method} ${pathname}` })
}

async function loadBucket(bucketId) {
  const [bucket] = await sql`
    select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = ${bucketId}
  `

  return bucket
}

async function handleStorage(request, response, pathname, body) {
  if (requestRole(request) !== 'service_role') {
    return sendJson(response, 403, {
      error: 'Unauthorized',
      message: 'Private buckets have no anon/authenticated policies; use the service role.',
      statusCode: '403',
    })
  }

  if (request.method === 'GET' && (pathname === '/storage/v1/bucket' || pathname === '/storage/v1/bucket/')) {
    const buckets = await sql`select id, name, public, file_size_limit, allowed_mime_types, created_at, updated_at from storage.buckets order by id`
    return sendJson(response, 200, buckets)
  }

  const listMatch = pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/)
  if (request.method === 'POST' && listMatch) {
    const bucketId = decodeURIComponent(listMatch[1])
    const payload = JSON.parse(body.toString('utf8') || '{}')
    const limit = Number.isFinite(payload.limit) ? payload.limit : 100
    const offset = Number.isFinite(payload.offset) ? payload.offset : 0
    const prefix = typeof payload.prefix === 'string' ? payload.prefix : ''
    const rows = await sql`
      select o.id, o.name, o.created_at, o.updated_at, o.metadata
      from storage.objects o
      where o.bucket_id = ${bucketId} and o.name like ${`${prefix}%`}
      order by o.name asc
      limit ${limit} offset ${offset}
    `

    return sendJson(response, 200, rows.map((row) => ({
      created_at: row.created_at,
      id: row.id,
      last_accessed_at: row.updated_at,
      metadata: row.metadata,
      name: row.name,
      updated_at: row.updated_at,
    })))
  }

  const deleteMatch = pathname.match(/^\/storage\/v1\/object\/([^/]+)$/)
  if (request.method === 'DELETE' && deleteMatch) {
    const bucketId = decodeURIComponent(deleteMatch[1])
    const payload = JSON.parse(body.toString('utf8') || '{}')
    const prefixes = Array.isArray(payload.prefixes) ? payload.prefixes : []
    const removed = await sql`
      delete from storage.objects where bucket_id = ${bucketId} and name = any(${prefixes})
      returning id, name, created_at, updated_at, metadata
    `
    await sql`delete from storage._harness_object_data where bucket_id = ${bucketId} and name = any(${prefixes})`

    return sendJson(response, 200, removed)
  }

  const objectMatch = pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)
  if (objectMatch) {
    const bucketId = decodeURIComponent(objectMatch[1])
    const objectName = decodeURIComponent(objectMatch[2])
    const bucket = await loadBucket(bucketId)

    if (!bucket) {
      return sendJson(response, 404, { error: 'Bucket not found', message: `Bucket ${bucketId} does not exist`, statusCode: '404' })
    }

    if (request.method === 'GET') {
      const [row] = await sql`
        select content, content_type from storage._harness_object_data
        where bucket_id = ${bucketId} and name = ${objectName}
      `
      if (!row) {
        return sendJson(response, 404, { error: 'not_found', message: 'Object not found', statusCode: '404' })
      }

      response.writeHead(200, {
        'content-length': row.content.length,
        'content-type': row.content_type ?? 'application/octet-stream',
      })
      return response.end(row.content)
    }

    if (request.method === 'POST' || request.method === 'PUT') {
      const contentType = request.headers['content-type'] ?? 'application/octet-stream'
      const upsert = request.method === 'PUT' || request.headers['x-upsert'] === 'true'

      if (bucket.allowed_mime_types && !bucket.allowed_mime_types.includes(contentType)) {
        return sendJson(response, 415, {
          error: 'invalid_mime_type',
          message: `mime type ${contentType} is not supported`,
          statusCode: '415',
        })
      }
      if (bucket.file_size_limit && body.length > Number(bucket.file_size_limit)) {
        return sendJson(response, 413, {
          error: 'payload_too_large',
          message: 'The object exceeded the maximum allowed size',
          statusCode: '413',
        })
      }

      const existing = await sql`
        select 1 from storage.objects where bucket_id = ${bucketId} and name = ${objectName}
      `
      if (existing.length > 0 && !upsert) {
        return sendJson(response, 400, { error: 'Duplicate', message: 'The resource already exists', statusCode: '409' })
      }

      const metadata = { mimetype: contentType, size: body.length }
      await sql.begin(async (transaction) => {
        await transaction`
          insert into storage.objects (bucket_id, name, metadata)
          values (${bucketId}, ${objectName}, ${transaction.json(metadata)})
          on conflict (bucket_id, name) do update set metadata = excluded.metadata, updated_at = now()
        `
        await transaction`
          insert into storage._harness_object_data (bucket_id, name, content, content_type)
          values (${bucketId}, ${objectName}, ${body}, ${contentType})
          on conflict (bucket_id, name) do update set content = excluded.content, content_type = excluded.content_type
        `
      })

      return sendJson(response, 200, { Id: randomUUID(), Key: `${bucketId}/${objectName}` })
    }
  }

  return sendJson(response, 404, { message: `Dev-stack storage shim does not implement ${request.method} ${pathname}`, statusCode: '404' })
}

async function proxyRest(request, response, url, body) {
  const targetPath = url.pathname.replace(/^\/rest\/v1/, '') || '/'
  const targetUrl = `http://127.0.0.1:${stackConfig.postgrestPort}${targetPath}${url.search}`
  const headers = { ...request.headers }
  delete headers.host
  delete headers.connection
  delete headers['content-length']
  delete headers['transfer-encoding']

  const proxied = await fetch(targetUrl, {
    body: ['GET', 'HEAD'].includes(request.method ?? 'GET') ? undefined : body,
    headers,
    method: request.method,
  })
  const responseBody = Buffer.from(await proxied.arrayBuffer())
  const responseHeaders = {}
  proxied.headers.forEach((value, key) => {
    if (!['connection', 'content-encoding', 'content-length', 'transfer-encoding'].includes(key)) {
      responseHeaders[key] = value
    }
  })
  responseHeaders['content-length'] = responseBody.length

  response.writeHead(proxied.status, responseHeaders)
  response.end(responseBody)
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${stackConfig.gatewayPort}`)

  try {
    if (url.pathname === '/dev-stack/health') {
      await sql`select 1`
      return sendJson(response, 200, { services: ['db', 'rest', 'auth-shim', 'storage-shim'], status: 'ok' })
    }

    const body = await readBody(request)

    if (url.pathname.startsWith('/rest/v1')) return await proxyRest(request, response, url, body)
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(request, response, url.pathname, body)
    if (url.pathname.startsWith('/storage/v1')) return await handleStorage(request, response, url.pathname, body)

    return sendJson(response, 404, { message: `Dev-stack gateway does not route ${url.pathname}` })
  }
  catch (error) {
    console.error(`[dev-stack] ${request.method} ${url.pathname} failed:`, error)
    if (!response.headersSent) {
      sendJson(response, 500, { message: error instanceof Error ? error.message : 'Internal dev-stack error' })
    }
    else {
      response.end()
    }
  }
})

server.listen(stackConfig.gatewayPort, '127.0.0.1', () => {
  console.log(`[dev-stack] gateway listening on http://127.0.0.1:${stackConfig.gatewayPort}`)
})
