/**
 * Host half of dsh-task-dock.
 *
 * The dock shows three lists, and only one of them is Host knowledge: which
 * Sessions are currently blocked on a human. Both blocking paths are
 * waterFalls — `approval/request` (a tool the model may not run unattended) and
 * `user-questions/request` (the model asking a question) — so this half records
 * the request, hands it straight back to the rest of the chain, and forgets it
 * once the decision settles.
 *
 * Nothing is answered, delayed, reordered or dropped here: the handler always
 * calls `next()` and returns whatever the real answerer returns. A missing
 * answerer, a rejected tool and a cancelled question all take the same path out
 * of this file.
 *
 * `running` and `unread` are Client-side facts (the Client already subscribes to
 * the session store), so they are not mirrored here; see client.js.
 */

/** One exact route: the Client polls it for the current pending decisions. */
const ROUTE_PATH = '/task-dock/pending'

/** Bound the record list so a pathological Session cannot grow it without end. */
const MAX_RECORDS = 64

/** Trim a possibly multi-line reason into one short line for the dock row. */
function clipped(text, limit = 200) {
  const flat = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : ''
  if (flat.length <= limit) return flat
  return `${flat.slice(0, limit - 1)}…`
}

function sendJson(response, status, payload, method) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': String(Buffer.byteLength(body)),
  })
  response.end(method === 'HEAD' ? undefined : body)
}

/**
 * Host half of the dock: record pending human decisions and serve them to the
 * Client. Both `approval` and `userQuestions` are consumed through their events,
 * never their services, so this file adds no policy of its own.
 */
export function apply(ctx) {
  /** Pending decisions, oldest first; `id` is only a stable React key. */
  const records = []
  let nextId = 1

  const remember = (sessionId, kind, title, detail) => {
    const id = nextId++
    records.push({ id, sessionId, kind, title, detail, at: Date.now() })
    if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS)
    return () => {
      const index = records.findIndex((record) => record.id === id)
      if (index >= 0) records.splice(index, 1)
    }
  }

  /**
   * Which Session is blocked. `approval/request` carries its Agent; a question
   * carries an optional one; the scope (`this`) is the Waterfall's Agent context.
   * The initiating-Agent chain is the last resort for a request that carries
   * neither.
   */
  const sessionOf = (scope, candidate) => {
    const direct = candidate?.id ?? scope?.id
    if (typeof direct === 'string' && direct !== '') return direct
    const agents = ctx.get('agents')
    const initiator = typeof agents?.currentInitiator === 'function' ? agents.currentInitiator() : undefined
    const fallback = initiator?.id
    return typeof fallback === 'string' && fallback !== '' ? fallback : undefined
  }

  ctx.on('approval/request', async function (request, next) {
    const sessionId = sessionOf(this, request?.agent)
    const reason = request?.displayReason
    const release = sessionId === undefined
      ? undefined
      : remember(
        sessionId,
        'approval',
        clipped(request?.toolName ?? 'tool'),
        clipped(reason?.zh ?? reason?.en ?? request?.reason ?? ''),
      )
    try {
      return await next()
    } finally {
      release?.()
    }
  })

  ctx.on('user-questions/request', async function (request, next) {
    const sessionId = sessionOf(this, request?.agent)
    const questions = Array.isArray(request?.questions) ? request.questions : []
    const first = questions[0]
    const title = first?.header || first?.question || 'question'
    const extra = questions.length > 1 ? `${title} (+${questions.length - 1})` : title
    const release = sessionId === undefined
      ? undefined
      : remember(sessionId, 'question', clipped(extra), clipped(first?.detail ?? ''))
    try {
      return await next()
    } finally {
      release?.()
    }
  })

  // The route only exists where the browser carrier does; a CLI composition has
  // no `webServer` and simply keeps recording.
  const webServer = ctx.get('webServer')
  if (webServer === undefined || typeof webServer.register !== 'function') return

  const connection = ctx.get('connection')
  const isRejected = (request) => {
    const rejection = typeof connection?.requestRejection === 'function'
      ? connection.requestRejection(request)
      : undefined
    return rejection !== undefined
  }

  ctx.effect(() => webServer.register({
    kind: 'exact',
    path: ROUTE_PATH,
    handler: (request, response) => {
      if (isRejected(request)) {
        sendJson(response, 403, { ok: false, error: { code: 'forbidden', message: 'forbidden' } }, request.method)
        return
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        sendJson(response, 405, { ok: false, error: { code: 'method', message: 'GET only' } }, request.method)
        return
      }
      sendJson(response, 200, { ok: true, value: { entries: records } }, request.method)
    },
  }), 'dsh-task-dock: pending route')
}
