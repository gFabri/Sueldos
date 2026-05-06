import { useEffect, useMemo, useState } from 'react'

const LOGIN_ENDPOINT = '/api/autogestion/login.php'
const EMPLOYEE_NUMBER = '29548'
const PASSWORD = '52059150'
const STORAGE_KEY = 'gestion_schedule_cache_v1'
const AUTO_SYNC_KEY = 'gestion_schedule_last_auto_sync'

const DEFAULT_DAYS = [
  { day: 'Lunes', shift: 'Sin datos', hours: '--', isRest: false },
  { day: 'Martes', shift: 'Sin datos', hours: '--', isRest: false },
  { day: 'Miercoles', shift: 'Sin datos', hours: '--', isRest: false },
  { day: 'Jueves', shift: 'Sin datos', hours: '--', isRest: false },
  { day: 'Viernes', shift: 'Sin datos', hours: '--', isRest: false },
  { day: 'Sabado', shift: 'Sin datos', hours: '--', isRest: false },
  { day: 'Domingo', shift: 'Sin datos', hours: '--', isRest: false },
]

const DAY_MATCHERS = [
  { key: 'lunes', label: 'Lunes' },
  { key: 'martes', label: 'Martes' },
  { key: 'miercoles', label: 'Miercoles' },
  { key: 'miércoles', label: 'Miercoles' },
  { key: 'jueves', label: 'Jueves' },
  { key: 'viernes', label: 'Viernes' },
  { key: 'sabado', label: 'Sabado' },
  { key: 'sábado', label: 'Sabado' },
  { key: 'domingo', label: 'Domingo' },
]

function extractTimeRange(text) {
  const match = text.match(/(\d{1,2}[:.]\d{2})\s*[-a]\s*(\d{1,2}[:.]\d{2})/i)
  if (!match) return null
  const from = match[1].replace('.', ':')
  const to = match[2].replace('.', ':')
  return `${from} - ${to}`
}

function formatShift(rawShift) {
  const raw = (rawShift || '').toUpperCase().replace(/\s+/g, '')
  const isRest = raw.includes('DESCANSO')
  if (isRest) {
    return { shift: 'Descanso', hours: 'Descanso', isRest: true }
  }
  const normalized = raw.replace(/(\d{2})(\d{2})-(\d{2})(\d{2})/, '$1:$2 - $3:$4')
  return { shift: normalized || 'Sin datos', hours: normalized || '--', isRest: false }
}

function parseScheduleFromHtml(html) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const weekDays = ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo']
  const currentDateText = (doc.body?.innerText || '').match(/FECHA ACTUAL:\s*(\d{1,2})-(\d{1,2})-(\d{4})/i)
  const currentDay = currentDateText ? String(currentDateText[1]).padStart(2, '0') : null

  const schedulesHeader = [...doc.querySelectorAll('h3')].find((h) =>
    (h.textContent || '').toUpperCase().includes('HORARIOS'),
  )
  const schedulesTable = schedulesHeader?.nextElementSibling?.matches('table') ? schedulesHeader.nextElementSibling : null

  const weekBlocks = []

  if (schedulesTable) {
    const allRows = [...schedulesTable.querySelectorAll('tr')]
    for (let i = 0; i < allRows.length - 1; i += 1) {
      const ths = [...allRows[i].querySelectorAll('th')].map((th) =>
        (th.textContent || '').replace(/\s+/g, ' ').trim(),
      )
      if (ths.length !== 7) continue

      const looksLikeWeekHeader = ths.every((t) =>
        /LUNES|MARTES|MIERCOLES|MIÉRCOLES|JUEVES|VIERNES|SABADO|SÁBADO|DOMINGO/i.test(t),
      )
      if (!looksLikeWeekHeader) continue

      const tds = [...allRows[i + 1].querySelectorAll('td')].map((td) =>
        (td.textContent || '').replace(/\s+/g, ' ').trim(),
      )
      if (tds.length !== 7) continue

      const rows = weekDays.map((d, idx) => {
        const daySuffix = ths[idx].match(/\d{1,2}$/)?.[0] || ''
        const formatted = formatShift(tds[idx])
        return {
          day: `${d} ${daySuffix}`.trim(),
          shift: formatted.shift,
          hours: formatted.hours,
          isRest: formatted.isRest,
        }
      })
      const dayNumbers = ths.map((h) => h.match(/\d{1,2}$/)?.[0]?.padStart(2, '0') || null)
      weekBlocks.push({ rows, dayNumbers })
    }
  }

  if (weekBlocks.length > 0) {
    const currentDayNum = currentDay ? Number(currentDay) : null
    const currentIndex = weekBlocks.findIndex(
      (w) =>
        currentDayNum !== null &&
        w.dayNumbers.some((d) => d !== null && Number(d) === currentDayNum),
    )

    const selectedIndex = currentIndex >= 0 ? currentIndex : weekBlocks.length - 1

    const currentWeek = weekBlocks[selectedIndex]?.rows || [...DEFAULT_DAYS]
    const nextWeek = weekBlocks[selectedIndex + 1]?.rows || [...DEFAULT_DAYS]
    return { currentWeek, nextWeek }
  }

  const fallbackRows = [...DEFAULT_DAYS]
  const candidates = [
    ...doc.querySelectorAll('tr'),
    ...doc.querySelectorAll('li'),
    ...doc.querySelectorAll('div'),
    ...doc.querySelectorAll('p'),
  ]

  for (const el of candidates) {
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (!text) continue

    const dayEntry = DAY_MATCHERS.find((d) => text.toLowerCase().includes(d.key))
    if (!dayEntry) continue

    const dayIndex = fallbackRows.findIndex((r) => r.day.startsWith(dayEntry.label))
    if (dayIndex < 0) continue

    const timeRange = extractTimeRange(text)
    if (!timeRange) continue

    fallbackRows[dayIndex] = {
      day: dayEntry.label,
      shift: timeRange,
      hours: timeRange,
      isRest: false,
    }
  }

  return { currentWeek: fallbackRows, nextWeek: [...DEFAULT_DAYS] }
}

function buildAbsoluteProxyPath(action) {
  if (!action || action === '#') return LOGIN_ENDPOINT
  if (action.startsWith('http')) {
    const url = new URL(action)
    return `/api/autogestion${url.pathname}${url.search}`
  }
  if (action.startsWith('/')) return `/api/autogestion${action}`
  return `/api/autogestion/${action}`
}

async function loginAndFetchHtml() {
  const loginPageResponse = await fetch(LOGIN_ENDPOINT, {
    method: 'GET',
    credentials: 'include',
  })
  const loginPageHtml = await loginPageResponse.text()
  const parser = new DOMParser()
  const loginDoc = parser.parseFromString(loginPageHtml, 'text/html')
  const form = loginDoc.querySelector('form')

  if (!form) return null

  const action = buildAbsoluteProxyPath(form.getAttribute('action') || '')
  const inputElements = [...form.querySelectorAll('input[name]')]
  const formData = new URLSearchParams()

  let userField = null
  let passField = null

  for (const input of inputElements) {
    const name = input.getAttribute('name') || ''
    const type = (input.getAttribute('type') || 'text').toLowerCase()
    const value = input.getAttribute('value') || ''
    const lower = name.toLowerCase()
    const placeholder = (input.getAttribute('placeholder') || '').toLowerCase()
    const id = (input.getAttribute('id') || '').toLowerCase()

    if (type === 'submit' || type === 'button' || type === 'reset') continue

    if (type === 'password' || lower.includes('pass') || lower.includes('clave') || id.includes('pass')) {
      passField = name
    } else if (
      type === 'text' ||
      type === 'email' ||
      type === 'number' ||
      lower.includes('user') ||
      lower.includes('usuario') ||
      lower.includes('empleado') ||
      lower.includes('numero') ||
      lower.includes('cedula') ||
      lower.includes('documento') ||
      lower.includes('login') ||
      id.includes('user') ||
      id.includes('usuario') ||
      id.includes('empleado') ||
      id.includes('login') ||
      placeholder.includes('usuario') ||
      placeholder.includes('empleado')
    ) {
      userField = name
    }

    if (type === 'hidden') formData.set(name, value)
  }

  if (!userField) userField = 'usuario'
  if (!passField) passField = 'clave'

  formData.set(userField, EMPLOYEE_NUMBER)
  formData.set(passField, PASSWORD)
  formData.set('usuario', EMPLOYEE_NUMBER)
  formData.set('clave', PASSWORD)

  const loginSubmitResponse = await fetch(action, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formData.toString(),
  })

  return loginSubmitResponse.text()
}

function SchedulePage() {
  const [currentWeekRows, setCurrentWeekRows] = useState(DEFAULT_DAYS)
  const [nextWeekRows, setNextWeekRows] = useState(DEFAULT_DAYS)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('Aun no sincronizado.')

  const canSync = useMemo(() => !loading, [loading])

  const getAutoSyncStamp = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  const getLastThursdayAtMidnight = (baseDate) => {
    const d = new Date(baseDate)
    d.setHours(0, 0, 0, 0)
    const day = d.getDay() // 0=Dom ... 4=Jue
    const diff = (day - 4 + 7) % 7
    d.setDate(d.getDate() - diff)
    return d
  }

  const shouldRunAutoSyncNow = () => {
    const now = new Date()
    const lastThursday = getLastThursdayAtMidnight(now)
    const lastRequiredStamp = getAutoSyncStamp(lastThursday)
    const lastDoneStamp = localStorage.getItem(AUTO_SYNC_KEY)
    return lastDoneStamp !== lastRequiredStamp
  }

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const cache = JSON.parse(raw)
      if (Array.isArray(cache.currentWeekRows)) setCurrentWeekRows(cache.currentWeekRows)
      if (Array.isArray(cache.nextWeekRows)) setNextWeekRows(cache.nextWeekRows)
    } catch {
      // ignore bad cache
    }
  }, [])

  useEffect(() => {
    const tryAutoSync = async () => {
      if (!shouldRunAutoSyncNow() || loading) return
      await syncSchedule()
      localStorage.setItem(AUTO_SYNC_KEY, getAutoSyncStamp(getLastThursdayAtMidnight(new Date())))
    }

    tryAutoSync()
    const id = setInterval(tryAutoSync, 60 * 1000)
    return () => clearInterval(id)
  }, [loading])

  const syncSchedule = async () => {
    if (!EMPLOYEE_NUMBER || !PASSWORD) {
      setStatus('Configura EMPLOYEE_NUMBER y PASSWORD en SchedulePage.jsx.')
      return
    }

    try {
      setLoading(true)
      setStatus('Sincronizando...')

      let text = await loginAndFetchHtml()
      if (!text) {
        const body = new URLSearchParams({
          usuario: EMPLOYEE_NUMBER,
          clave: PASSWORD,
          numero: EMPLOYEE_NUMBER,
          pass: PASSWORD,
        })
        const response = await fetch(LOGIN_ENDPOINT, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: body.toString(),
        })
        text = await response.text()
      }

      if (text.toLowerCase().includes('no tienes acceso') || text.toLowerCase().includes('datos de acceso no son validos')) {
        setStatus('Sin acceso. Revisa credenciales o permisos en Autogestion.')
        return
      }
      if (text.toLowerCase().includes('en caso de no contar con las credenciales')) {
        setStatus('Sigue mostrando login. Revisar flujo de autenticacion.')
        return
      }

      const parsed = parseScheduleFromHtml(text)
      const hasRealData = parsed.currentWeek.some((row) => row.hours !== '--')

      setCurrentWeekRows(parsed.currentWeek)
      setNextWeekRows(parsed.nextWeek)

      const newStatus = hasRealData ? 'Horarios extraidos desde HTML.' : 'Conexion ok, pero no se detectaron horarios.'
      setStatus(newStatus)
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          currentWeekRows: parsed.currentWeek,
          nextWeekRows: parsed.nextWeek,
          status: newStatus,
          updatedAt: new Date().toISOString(),
        }),
      )
    } catch {
      setStatus('No se pudo sincronizar. Reinicia el dev server y reintenta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="schedule-page">
      <header className="schedule-header">
        <h2>Horarios de trabajo</h2>
      </header>

      <div className="schedule-actions">
        <button type="button" className="month-tab" disabled={!canSync} onClick={syncSchedule}>
          {loading ? 'Sincronizando...' : 'Sincronizar horarios'}
        </button>
        <small>{status}</small>
      </div>

      <h3 className="schedule-section-title">Semana actual</h3>
      <div className="schedule-grid">
        {currentWeekRows.map((item) => (
          <article key={`current-${item.day}`} className={`schedule-card ${item.isRest ? 'is-rest-day' : ''}`}>
            <strong>{item.day}</strong>
            <span>{item.shift}</span>
          </article>
        ))}
      </div>

      <h3 className="schedule-section-title">Semana siguiente</h3>
      <div className="schedule-grid">
        {nextWeekRows.map((item) => (
          <article key={`next-${item.day}`} className={`schedule-card ${item.isRest ? 'is-rest-day' : ''}`}>
            <strong>{item.day}</strong>
            <span>{item.shift}</span>
          </article>
        ))}
      </div>
    </section>
  )
}

export default SchedulePage

