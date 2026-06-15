import { useEffect, useMemo, useState } from 'react'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const CATEGORIES = ['Servicios', 'Comida', 'Deuda', 'Impuestos', 'Ocios', 'Otros', 'Tarjeta']
const DEFAULT_HOURLY_RATE = 170.67
const DEFAULT_HOURS_PER_DAY = 8
const JUBILACION_RATE = 0.15
const FONASA_RATE = 0.045
const FRL_RATE = 0.001
const PRESENTISMO_PER_HALF = 1350
const EMPLOYMENT_START_DATE = '2026-02-12'
const DEFAULT_REST_DAYS = [true, true, false, false, false, false, false]
const KNOWN_LIQUID_INCOME_BY_MONTH = {
  '2026-02': 14243,
  '2026-03': 21919,
  '2026-04': 5503,
  '2026-05': 24117,
}

function formatMoney(value) {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatMonthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function parseIsoDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function getPeriodStart(year, monthIndex) {
  return new Date(year, monthIndex - 1, 26)
}

function getPeriodEndExclusive(start) {
  return new Date(start.getFullYear(), start.getMonth() + 1, 26)
}

function monthDiff(startDate, endDate) {
  return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth())
}

function getAutomaticIncome(year, monthIndex) {
  const monthKey = formatMonthKey(year, monthIndex)
  if (KNOWN_LIQUID_INCOME_BY_MONTH[monthKey] !== undefined) return KNOWN_LIQUID_INCOME_BY_MONTH[monthKey]

  const start = getPeriodStart(year, monthIndex)
  const endExclusive = getPeriodEndExclusive(start)
  const endVisible = new Date(endExclusive)
  endVisible.setDate(endVisible.getDate() - 1)
  const employmentStart = parseIsoDate(EMPLOYMENT_START_DATE)
  const effectiveStart = employmentStart > start ? employmentStart : start
  if (effectiveStart >= endExclusive) return 0

  let workDays = 0
  const current = new Date(effectiveStart)
  while (current < endExclusive) {
    if (!DEFAULT_REST_DAYS[current.getDay()]) workDays += 1
    current.setDate(current.getDate() + 1)
  }

  const workedHours = workDays * DEFAULT_HOURS_PER_DAY
  const monthSalary = workedHours * DEFAULT_HOURLY_RATE
  const presentismoEnabled = monthDiff(employmentStart, endVisible) >= 2
  const presentismo = presentismoEnabled ? PRESENTISMO_PER_HALF * 2 : 0
  const taxes = (monthSalary + presentismo) * (JUBILACION_RATE + FONASA_RATE + FRL_RATE)
  return Math.round(Math.max(0, monthSalary - taxes + presentismo))
}

function GestionPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [activeMonth, setActiveMonth] = useState(now.getMonth())
  const [loading, setLoading] = useState(false)
  const [periodData, setPeriodData] = useState({ income: '', items: [] })

  const [form, setForm] = useState({
    date: `${year}-${String(activeMonth + 1).padStart(2, '0')}-01`,
    category: CATEGORIES[0],
    description: '',
    amount: '',
  })

  const loadPeriod = async () => {
    setLoading(true)
    try {
      const month = String(activeMonth + 1).padStart(2, '0')
      const res = await fetch(`/api/gestion/${year}/${month}`)
      const data = await res.json()
      setPeriodData({ income: data.income ?? '', items: Array.isArray(data.items) ? data.items : [] })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPeriod()
    setForm((prev) => ({ ...prev, date: `${year}-${String(activeMonth + 1).padStart(2, '0')}-01` }))
  }, [year, activeMonth])

  const savePeriod = async (nextPeriodData) => {
    setPeriodData(nextPeriodData)
    const month = String(activeMonth + 1).padStart(2, '0')
    await fetch(`/api/gestion/${year}/${month}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextPeriodData),
    })
  }

  const updateIncome = (income) => {
    savePeriod({ ...periodData, income })
  }

  const addExpense = () => {
    if (!form.description.trim() || !Number(form.amount)) return
    const item = {
      id: Date.now(),
      date: form.date,
      category: form.category,
      description: form.description.trim(),
      amount: Number(form.amount),
    }
    savePeriod({ ...periodData, items: [...periodData.items, item] })
    setForm((prev) => ({ ...prev, description: '', amount: '' }))
  }

  const removeExpense = (id) => {
    savePeriod({ ...periodData, items: periodData.items.filter((i) => i.id !== id) })
  }

  const monthExpenses = useMemo(() => periodData.items.reduce((acc, i) => acc + i.amount, 0), [periodData.items])

  const byCategory = useMemo(() => {
    const map = new Map()
    for (const i of periodData.items) map.set(i.category, (map.get(i.category) || 0) + i.amount)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [periodData.items])

  const automaticIncome = useMemo(() => getAutomaticIncome(year, activeMonth), [year, activeMonth])
  const hasManualIncome = periodData.income !== '' && periodData.income !== null
  const income = hasManualIncome ? Number(periodData.income) || 0 : automaticIncome
  const balance = income - monthExpenses

  return (
    <section className="schedule-page">
      <header className="schedule-header">
        <h2>Gestion de gastos</h2>
        <p>Controla en que se va la plata por mes, con detalle por categoria.</p>
      </header>

      <div className="controls" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <label>
          Año
          <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
        <label>
          Mes
          <select value={activeMonth} onChange={(e) => setActiveMonth(Number(e.target.value))}>
            {MONTHS.map((m, idx) => (
              <option key={m} value={idx}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ingreso del mes
          <input type="text" value={formatMoney(income)} readOnly />
        </label>
        <label>
          Ingreso manual (opcional)
          <input
            type="number"
            min="0"
            step="0.01"
            value={periodData.income}
            onChange={(e) => updateIncome(e.target.value)}
            placeholder={`auto: ${formatMoney(automaticIncome)}`}
          />
        </label>
        <label>
          Gasto total del mes
          <input type="text" value={formatMoney(monthExpenses)} readOnly />
        </label>
        <label>
          Balance del mes
          <input type="text" value={formatMoney(balance)} readOnly />
        </label>
      </div>

      <section className="month-editor">
        <h2 className="capitalize">Nuevo gasto - {MONTHS[activeMonth]}</h2>
        <div className="editor-grid">
          <label>
            Fecha
            <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} />
          </label>
          <label>
            Categoria
            <select value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Descripcion
            <input type="text" value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </label>
          <label>
            Monto
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
          </label>
        </div>
        <button type="button" className="month-tab" onClick={addExpense} disabled={loading}>
          Agregar gasto
        </button>
      </section>

      <section className="table-wrap expense-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoria</th>
              <th>Descripcion</th>
              <th>Monto</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {periodData.items.length === 0 ? (
              <tr>
                <td colSpan={5}>{loading ? 'Cargando...' : 'Sin gastos cargados en este mes.'}</td>
              </tr>
            ) : (
              periodData.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.date}</td>
                  <td>{item.category}</td>
                  <td>{item.description}</td>
                  <td className="salary">{formatMoney(item.amount)}</td>
                  <td>
                    <button type="button" className="chip" onClick={() => removeExpense(item.id)}>
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="month-editor">
        <h2>Resumen por categoria</h2>
        <div className="special-days-list">
          {byCategory.length === 0
            ? 'Sin datos aún.'
            : byCategory.map(([cat, amount]) => (
                <span key={cat} className="chip">
                  {cat}: {formatMoney(amount)}
                </span>
              ))}
        </div>
      </section>
    </section>
  )
}

export default GestionPage
