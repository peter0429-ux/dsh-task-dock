/**
 * Client half of dsh-task-dock.
 *
 * Three lists in one dock, in the order a person needs them:
 *
 *   needs you  →  running  →  unread
 *
 * Two of the three are already Client knowledge and are read from the session
 * list feed (`running`, and a title to print); "unread" is a fact only this
 * plugin has, so it is kept in localStorage as a set of Session ids. "Needs you"
 * is Host knowledge — a Session blocked on an approval or a question — and is
 * polled from this package's own Host route (see index.js).
 *
 * Everything is additive: the dock owns one `shell.overlay` id of its own and
 * never touches a shipped seat.
 */

window.__ModuleLoader__.load({
  id: 'dsh-task-dock',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    /** Dictionary namespace; also the slot `locale` hint. */
    const NS = 'task-dock'

    /** Our own overlay id: a fresh id is added beside the shipped entries. */
    const OVERLAY_ID = 'task-dock'

    const STYLE_ID = 'dsh-task-dock-styles'
    const UNREAD_KEY = 'dsh-task-dock:unread'
    const COLLAPSED_KEY = 'dsh-task-dock:collapsed'
    const ENABLED_KEY = 'dsh-task-dock:enabled'
    /** First-run posture: the dock is on until the person turns it off. */
    const ENABLED_DEFAULT = true

    /** Exactly the route index.js registers. */
    const PENDING_PATH = 'task-dock/pending'

    /** Cheap enough to keep a blocked Session visible, quiet enough to ignore. */
    const POLL_MS = 1500

    /** Pixels of the dock that must stay on screen, so it can never be thrown away. */
    const MIN_VISIBLE = 40

    /** Below this the gesture is a click, not a drag. */
    const DRAG_THRESHOLD = 4

    const zh = {
      'dock.title': '任务坞',
      'dock.pending': '需要确认',
      'dock.running': '正在执行',
      'dock.unread': '未读',
      'dock.expand': '展开任务坞',
      'dock.collapse': '收起任务坞',
      'dock.setting.label': '显示任务坞',
      'dock.setting.desc': '在窗口左上角显示需要确认、正在执行和未读的会话。关掉后完全不渲染。',
      'dock.setting.on': '开',
      'dock.setting.off': '关',
    }

    const en = {
      'dock.title': 'Task dock',
      'dock.pending': 'Needs you',
      'dock.running': 'Running',
      'dock.unread': 'Unread',
      'dock.expand': 'Expand the task dock',
      'dock.collapse': 'Collapse the task dock',
      'dock.setting.label': 'Show the task dock',
      'dock.setting.desc': 'Show pending confirmations, running Sessions and unread results in the top-left corner. Turning this off removes it entirely.',
      'dock.setting.on': 'On',
      'dock.setting.off': 'Off',
    }

    const CSS = `
.dsh-task-dock-root {
  position: fixed;
  top: var(--dsh-task-dock-top, 44px);
  left: var(--dsh-task-dock-left, 8px);
  z-index: 40;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: min(232px, calc(100vw - 16px));
  font: var(--dsw-font-xxs-12);
  color: var(--dsw-alias-label-primary);
}
.dsh-task-dock-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: var(--dsw-alias-bg-overlay);
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.dsh-task-dock-chip:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-task-dock-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--dsw-alias-label-secondary);
}
.dsh-task-dock-dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--dsw-alias-state-idle-primary);
}
.dsh-task-dock-dot[data-kind="pending"] { background: var(--dsw-alias-state-error-primary); }
.dsh-task-dock-dot[data-kind="running"] { background: var(--dsw-alias-state-success-primary); }
.dsh-task-dock-dot[data-kind="unread"] { background: var(--dsw-alias-brand-primary); }
.dsh-task-dock-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-height: min(60vh, 420px);
  margin-top: 6px;
  padding: 6px;
  overflow: auto;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-overlay);
}
.dsh-task-dock-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 0 4px 2px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-task-dock-bar button {
  padding: 0 4px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  cursor: pointer;
}
.dsh-task-dock-bar button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-task-dock-section { display: flex; flex-direction: column; gap: 1px; }
.dsh-task-dock-heading {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  color: var(--dsw-alias-label-tertiary);
}
.dsh-task-dock-row {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.dsh-task-dock-row:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-task-dock-row-title {
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-task-dock-row-detail {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dsh-task-dock-drag {
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.dsh-task-dock-root[data-dragging="true"] .dsh-task-dock-drag { cursor: grabbing; }
.dsh-task-dock-pref {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.dsh-task-dock-pref-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.dsh-task-dock-pref-label { color: var(--dsw-alias-label-primary); }
.dsh-task-dock-pref-desc { color: var(--dsw-alias-label-tertiary); }
.dsh-task-dock-pref-toggle {
  flex: none;
  min-width: 44px;
  padding: 2px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 999px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  cursor: pointer;
}
.dsh-task-dock-pref-toggle:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-task-dock-pref-toggle[data-on="true"] {
  border-color: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-brand-primary);
}
`

    /**
     * Insert the dock stylesheet once per Client run and hand back its removal.
     * The strip is keyed so a rebuilt Client module reuses the live element
     * instead of stacking a second copy.
     */
    function insertStyles() {
      if (typeof document === 'undefined') return () => {}
      const existing = document.getElementById(STYLE_ID)
      if (existing !== null) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.setAttribute('data-plugin-css', 'dsh-task-dock')
      style.textContent = CSS
      document.head.appendChild(style)
      return () => {
        if (style.parentNode !== null) style.parentNode.removeChild(style)
      }
    }

    function readJson(key, fallback) {
      try {
        const raw = localStorage.getItem(key)
        if (typeof raw !== 'string' || raw === '') return fallback
        return JSON.parse(raw)
      } catch {
        return fallback
      }
    }

    function writeJson(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value))
      } catch {
        // A full or blocked storage keeps the dock working from memory.
      }
    }

    function readUnread() {
      const raw = readJson(UNREAD_KEY, [])
      return Array.isArray(raw) ? raw.filter((id) => typeof id === 'string' && id !== '') : []
    }

    function readCollapsed() {
      return readJson(COLLAPSED_KEY, false) === true
    }

    function readEnabled() {
      return readJson(ENABLED_KEY, ENABLED_DEFAULT) !== false
    }

    /**
     * Resolve a Host route against the page's own base. The Host forwards
     * non-static paths from the app origin, so this stays same-origin; the
     * transport origin is a different origin with no CORS headers on plugin
     * routes. Stripping the leading slash keeps a reverse-proxy path prefix.
     */
    function hostRouteUrl(path) {
      const base = typeof document !== 'undefined' && typeof document.baseURI === 'string' ? document.baseURI : ''
      const url = new URL(base === '' ? 'http://dsh.internal/' : base, 'http://dsh.internal/')
      url.search = ''
      url.hash = ''
      if (!url.pathname.endsWith('/')) url.pathname += '/'
      return new URL(String(path).replace(/^\/+/, ''), url.href)
    }

    /**
     * Keep the dragged dock reachable: `MIN_VISIBLE` pixels of it stay inside the
     * viewport on every side, so it can never be dropped somewhere unclickable.
     * Without a viewport (no document) the value is left alone rather than
     * guessed at.
     */
    function clampPos(left, top) {
      if (typeof window === 'undefined') return { left, top }
      const width = typeof window.innerWidth === 'number' ? window.innerWidth : 0
      const height = typeof window.innerHeight === 'number' ? window.innerHeight : 0
      if (width <= 0 || height <= 0) return { left, top }
      return {
        left: Math.min(Math.max(left, 0), Math.max(0, width - MIN_VISIBLE)),
        top: Math.min(Math.max(top, 0), Math.max(0, height - MIN_VISIBLE)),
      }
    }

    /**
     * The dock's data: the Host-reported pending decisions, the Client's session
     * feed, and the locally remembered unread set. One immutable snapshot, one
     * subscriber list — the React surface reads it through `useDock`.
     *
     * `pos` is deliberately memory-only: the dock returns to its corner on every
     * page load, so a drag can never leave it somewhere the person forgot about.
     */
    function createController(ctx, t) {
      let snapshot = {
        pending: [],
        running: [],
        unread: readUnread(),
        titles: {},
        expanded: readCollapsed() === false,
        enabled: readEnabled(),
        pos: null,
      }
      const listeners = new Set()
      const unread = new Set(snapshot.unread)
      let previouslyRunning = null
      let stopped = false
      let handle = undefined

      const touch = (patch) => {
        snapshot = { ...snapshot, ...patch }
        for (const listener of [...listeners]) {
          try {
            listener()
          } catch {
            // One broken subscriber must not stop the others.
          }
        }
      }

      const persistUnread = () => writeJson(UNREAD_KEY, [...unread])

      const sessions = ctx.get('sessions')
      const readSessions = () => {
        const list = sessions === undefined ? undefined : sessions.list
        if (list === undefined || typeof list.getSnapshot !== 'function') return { running: [], titles: {} }
        let byId = {}
        try {
          byId = list.getSnapshot()?.byId ?? {}
        } catch {
          return { running: [], titles: {} }
        }
        const running = []
        const titles = {}
        for (const id of Object.keys(byId)) {
          const summary = byId[id]
          if (summary === undefined || summary === null) continue
          titles[id] = typeof summary.displayTitle === 'string' && summary.displayTitle !== ''
            ? summary.displayTitle
            : id
          // Subagent children run inside the same work the parent is doing, so
          // listing them separately would double count and bury the parent.
          if (summary.origin === 'subagent') continue
          if (summary.running === true) running.push(id)
        }
        return { running, titles }
      }

      const syncSessions = () => {
        const { running, titles } = readSessions()
        const current = new Set(running)
        let dirty = false
        if (previouslyRunning !== null) {
          // A Session that stopped while we were watching is the only evidence
          // we have that there is something new to read.
          for (const id of previouslyRunning) {
            if (current.has(id)) continue
            unread.add(id)
            dirty = true
          }
          for (const id of current) {
            if (unread.delete(id)) dirty = true
          }
        }
        previouslyRunning = current
        if (dirty) persistUnread()
        touch({ running, titles, unread: [...unread] })
      }

      const pollPending = async () => {
        try {
          const response = await fetch(hostRouteUrl(PENDING_PATH).href, {
            headers: { accept: 'application/json' },
            cache: 'no-store',
          })
          if (!response.ok) return
          const payload = await response.json()
          const entries = payload?.value?.entries
          if (Array.isArray(entries)) touch({ pending: entries })
        } catch {
          // Keep the previous list: a transient fetch failure is not evidence
          // that the person is no longer blocked.
        }
      }

      const schedule = () => {
        if (stopped) return
        handle = setTimeout(async () => {
          if (typeof document === 'undefined' || document.visibilityState !== 'hidden') await pollPending()
          schedule()
        }, POLL_MS)
      }

      const clearUnread = (sessionId) => {
        if (!unread.delete(sessionId)) return
        persistUnread()
        touch({ unread: [...unread] })
      }

      const open = (sessionId) => {
        clearUnread(sessionId)
        const uiWorkspace = ctx.get('uiWorkspace')
        if (uiWorkspace !== undefined && typeof uiWorkspace.openSession === 'function') {
          try {
            uiWorkspace.openSession(sessionId)
            return
          } catch {
            // Fall through to the session service.
          }
        }
        if (sessions !== undefined && typeof sessions.open === 'function') {
          try {
            sessions.open(sessionId)
          } catch {
            // Nothing else to try; the row simply does not navigate.
          }
        }
      }

      const controller = {
        t,
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        toggle() {
          const expanded = !snapshot.expanded
          writeJson(COLLAPSED_KEY, !expanded)
          touch({ expanded })
        },
        /** The persisted master switch behind the General settings row. */
        setEnabled(enabled) {
          const next = enabled === true
          writeJson(ENABLED_KEY, next)
          touch({ enabled: next })
        },
        moveTo(left, top) {
          touch({ pos: clampPos(left, top) })
        },
        open,
        clearUnread,
        start() {
          stopped = false
          const disposers = []
          try {
            syncSessions()
            if (sessions !== undefined && typeof sessions.list?.subscribe === 'function') {
              disposers.push(sessions.list.subscribe(syncSessions))
            }
            void pollPending()
            schedule()
            if (typeof document !== 'undefined') {
              const onVisible = () => {
                if (document.visibilityState !== 'hidden') void pollPending()
              }
              document.addEventListener('visibilitychange', onVisible)
              disposers.push(() => document.removeEventListener('visibilitychange', onVisible))
            }
          } catch (error) {
            for (const dispose of disposers.reverse()) dispose()
            throw error
          }
          return () => {
            stopped = true
            if (handle !== undefined) clearTimeout(handle)
            for (const dispose of disposers.reverse()) dispose()
            listeners.clear()
          }
        },
      }
      return controller
    }

    /** Read the controller's snapshot as React state. */
    function useDock(controller) {
      const [state, setState] = React.useState(() => controller.getSnapshot())
      React.useEffect(() => {
        setState(controller.getSnapshot())
        return controller.subscribe(() => setState(controller.getSnapshot()))
      }, [controller])
      return state
    }

    /**
     * Drag gesture for the dock handle. A press that never travels past
     * `DRAG_THRESHOLD` stays a click, so the same handle can still toggle the
     * dock; a press that does travel swallows the click it would otherwise
     * produce.
     */
    function useDrag(controller) {
      const [dragging, setDragging] = React.useState(false)
      const gesture = React.useRef(null)
      const swallowClick = React.useRef(false)

      const end = (event) => {
        const active = gesture.current
        if (active === null || active.pointerId !== event.pointerId) return
        gesture.current = null
        // The click arrives after pointerup, so the verdict has to outlive the
        // gesture itself.
        swallowClick.current = active.moved
        setDragging(false)
        try {
          event.currentTarget.releasePointerCapture(event.pointerId)
        } catch {
          // The capture is already gone; the gesture still ends here.
        }
      }

      return {
        dragging,
        /** True once per drag, so the click that follows it is dropped. */
        dragged() {
          if (!swallowClick.current) return false
          swallowClick.current = false
          return true
        },
        handleProps: {
          onPointerDown(event) {
            if (event.pointerType === 'mouse' && event.button !== 0) return
            // A click that never closed a drag is a fresh intent.
            swallowClick.current = false
            const target = event.target
            const control = typeof Element === 'undefined' || !(target instanceof Element)
              ? null
              : target.closest('button')
            // The collapse button lives inside the bar, so a press on it must
            // stay a press instead of grabbing the whole dock.
            if (control !== null && control !== event.currentTarget) return
            const root = event.currentTarget.closest('.dsh-task-dock-root')
            if (root === null) return
            const rect = root.getBoundingClientRect()
            gesture.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              grabX: event.clientX - rect.left,
              grabY: event.clientY - rect.top,
              moved: false,
            }
            try {
              event.currentTarget.setPointerCapture(event.pointerId)
            } catch {
              // Without capture the moves still arrive while the pointer stays
              // over the handle; the drag just ends at the first excursion.
            }
          },
          onPointerMove(event) {
            const active = gesture.current
            if (active === null || active.pointerId !== event.pointerId) return
            const dx = event.clientX - active.startX
            const dy = event.clientY - active.startY
            if (!active.moved) {
              if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return
              active.moved = true
              setDragging(true)
            }
            controller.moveTo(event.clientX - active.grabX, event.clientY - active.grabY)
          },
          onPointerUp: end,
          onPointerCancel: end,
        },
      }
    }

    function dot(kind) {
      return h('span', { className: 'dsh-task-dock-dot', 'data-kind': kind })
    }

    function badge(kind, count) {
      if (count <= 0) return null
      return h('span', { className: 'dsh-task-dock-badge' }, dot(kind), h('span', null, String(count)))
    }

    function row(key, title, detail, onClick, label) {
      return h('button', {
        key,
        type: 'button',
        className: 'dsh-task-dock-row',
        title: detail === '' ? title : `${title}\n${detail}`,
        'aria-label': `${label}: ${title}`,
        onClick,
      },
        h('span', { className: 'dsh-task-dock-row-title' }, title),
        detail === '' ? null : h('span', { className: 'dsh-task-dock-row-detail' }, detail),
      )
    }

    function group(key, kind, label, rows) {
      if (rows.length === 0) return null
      return h('div', { key, className: 'dsh-task-dock-section' },
        h('div', { className: 'dsh-task-dock-heading' }, dot(kind), h('span', null, label)),
        ...rows,
      )
    }

    /**
     * The General settings row. The section only stacks rows, so this draws its
     * own label, value and write path (the slot passes no props at all).
     */
    function GeneralItem(props) {
      const controller = props.controller
      const state = useDock(controller)
      const t = controller.t
      const on = state.enabled !== false
      return h('div', { className: 'dsh-task-dock-pref' },
        h('div', { className: 'dsh-task-dock-pref-text' },
          h('span', { className: 'dsh-task-dock-pref-label' }, t('dock.setting.label')),
          h('span', { className: 'dsh-task-dock-pref-desc' }, t('dock.setting.desc')),
        ),
        h('button', {
          type: 'button',
          className: 'dsh-task-dock-pref-toggle',
          'data-on': on ? 'true' : 'false',
          'aria-pressed': on ? 'true' : 'false',
          onClick: () => controller.setEnabled(!on),
        }, on ? t('dock.setting.on') : t('dock.setting.off')),
      )
    }

    function Dock(props) {
      const controller = props.controller
      const state = useDock(controller)
      const drag = useDrag(controller)
      const t = controller.t
      const titles = state.titles
      const titleOf = (id) => (typeof titles[id] === 'string' && titles[id] !== '' ? titles[id] : id)

      const pending = state.pending.filter((entry) => entry !== null && typeof entry === 'object')
      const running = state.running
      const unread = state.unread
      const total = pending.length + running.length + unread.length

      // The master switch in General settings: off means nothing at all, not
      // even the chip, so the corner is fully given back.
      if (state.enabled === false) return null

      // Nothing waiting on the person, nothing running, nothing new: stay out of
      // the way entirely rather than parking an empty chip over the sidebar.
      if (total === 0) return null

      // A drag position wins over the stylesheet default; without one the dock
      // sits in its corner, which is also where every reload starts it.
      const rootStyle = state.pos === null
        ? undefined
        : { left: `${state.pos.left}px`, top: `${state.pos.top}px` }

      if (state.expanded === false) {
        return h('div', {
          className: 'dsh-task-dock-root',
          style: rootStyle,
          'data-dragging': drag.dragging ? 'true' : 'false',
        },
          h('button', {
            type: 'button',
            className: 'dsh-task-dock-chip dsh-task-dock-drag',
            title: t('dock.expand'),
            'aria-label': t('dock.expand'),
            onClick: () => {
              // The click that closes a drag must not also expand the dock.
              if (drag.dragged()) return
              controller.toggle()
            },
            ...drag.handleProps,
          },
            badge('pending', pending.length),
            badge('running', running.length),
            badge('unread', unread.length),
          ),
        )
      }

      const pendingRows = pending.map((entry, index) => {
        const sessionTitle = titleOf(entry.sessionId)
        const detail = typeof entry.detail === 'string' && entry.detail !== ''
          ? entry.detail
          : sessionTitle
        return row(
          `pending:${entry.id ?? index}`,
          typeof entry.title === 'string' && entry.title !== '' ? entry.title : sessionTitle,
          detail,
          () => controller.open(entry.sessionId),
          t('dock.pending'),
        )
      })

      const runningRows = running.map((id) => row(
        `running:${id}`,
        titleOf(id),
        '',
        () => controller.open(id),
        t('dock.running'),
      ))

      const unreadRows = unread.map((id) => row(
        `unread:${id}`,
        titleOf(id),
        '',
        () => controller.open(id),
        t('dock.unread'),
      ))

      return h('div', {
        className: 'dsh-task-dock-root',
        style: rootStyle,
        'data-dragging': drag.dragging ? 'true' : 'false',
      },
        h('div', { className: 'dsh-task-dock-panel' },
          h('div', { className: 'dsh-task-dock-bar dsh-task-dock-drag', ...drag.handleProps },
            h('span', null, t('dock.title')),
            h('button', {
              type: 'button',
              title: t('dock.collapse'),
              'aria-label': t('dock.collapse'),
              onClick: () => {
                if (drag.dragged()) return
                controller.toggle()
              },
            }, '−'),
          ),
          group('pending', 'pending', t('dock.pending'), pendingRows),
          group('running', 'running', t('dock.running'), runningRows),
          group('unread', 'unread', t('dock.unread'), unreadRows),
        ),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        const disposers = []
        try {
          disposers.push(ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-task-dock: dictionaries'))
          disposers.push(ctx.effect(() => insertStyles(), 'dsh-task-dock: stylesheet'))

          const controller = createController(ctx, t)
          disposers.push(ctx.effect(() => controller.start(), 'dsh-task-dock: feeds'))

          disposers.push(ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({
            name: 'shell.overlay',
            id: OVERLAY_ID,
            order: 40,
            registrant: 'dsh-task-dock',
            inject: () => ({ controller }),
          }, Dock)), 'dsh-task-dock: overlay'))

          disposers.push(ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
            name: 'settings.general.item',
            id: OVERLAY_ID,
            order: 50,
            registrant: 'dsh-task-dock',
            inject: () => ({ controller }),
          }, GeneralItem)), 'dsh-task-dock: settings row'))
        } catch (error) {
          for (const dispose of disposers.reverse()) {
            try {
              dispose()
            } catch {
              // Keep unwinding: the first failure is the one worth reporting.
            }
          }
          throw error
        }
      },
    }
  },
})
