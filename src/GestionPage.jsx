import { useEffect, useMemo, useState } from 'react'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const CATEGORIES = ['Servicios', 'Comida', 'Deuda', 'Impuestos', 'Ocios', 'Otros', 'Tarjeta']

function formatMoney(value) {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    maximumFractionDigits: 2,
  }).format(value)
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

  const income = Number(periodData.income) || 0
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
          <input type="number" min="0" step="0.01" value={periodData.income} onChange={(e) => updateIncome(e.target.value)} />
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

      <section className="table-wrap">
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
