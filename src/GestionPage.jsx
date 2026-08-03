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
const HOURLY_RATE_STORAGE_KEY = 'salary_hourly_rate'
const KNOWN_LIQUID_INCOME_BY_MONTH = {
  '2026-02': 14243,
  '2026-03': 21919,
  '2026-04': 5503,
  '2026-05': 24117,
}

const NO_END_DATE = ''
const CARD_CLOSING_DAY_KEY = 'gestion_card_closing_day'

function formatMoney(value) {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    maximumFractionDigits: 0,
  }).format(value)
}

function parseMoneyInput(value) {
  const text = String(value || '').trim()
  if (!text) return 0
  const normalized = text
    .replace(/\s/g, '')
    .replace(/\$/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  return Number(normalized) || 0
}

function formatMonthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`
}

function getMonthKeyFromDate(value) {
  if (!value) return ''
  return value.slice(0, 7)
}

function getMonthDistance(startMonth, endMonth) {
  const [startYear, startMonthNumber] = startMonth.split('-').map(Number)
  const [endYear, endMonthNumber] = endMonth.split('-').map(Number)
  return (endYear - startYear) * 12 + (endMonthNumber - startMonthNumber)
}

function getCardInstallmentProgress(item, currentMonthKey) {
  const firstMonth = getCardFirstInstallmentMonth(item)
  const totalInstallments = Math.max(1, Number(item.installments) || 1)
  if (!firstMonth || !currentMonthKey) return `cuota 1 de ${totalInstallments}`

  const rawInstallment = getMonthDistance(firstMonth, currentMonthKey) + 1
  if (rawInstallment < 1) return `cuota 0 de ${totalInstallments}`
  const currentInstallment = Math.min(totalInstallments, rawInstallment)
  return `cuota ${currentInstallment} de ${totalInstallments}`
}

function getCardBaseInstallmentAmount(item) {
  const totalInstallments = Math.max(1, Number(item.installments) || 1)
  const savedInstallment = Number(item.installmentAmount)
  if (savedInstallment > 0) return savedInstallment

  return Math.round(((Number(item.amount) || 0) / totalInstallments) * 100) / 100
}

function getCardInstallmentAmount(item, currentMonthKey) {
  if (item.type !== 'card') return Number(item.amount) || 0

  const firstMonth = getCardFirstInstallmentMonth(item)
  const lastMonth = getCardLastInstallmentMonth(item)
  if (!firstMonth || !currentMonthKey || currentMonthKey < firstMonth || currentMonthKey > lastMonth) return 0

  return getCardBaseInstallmentAmount(item)
}

function isCardActiveForMonth(item, monthKey) {
  const firstMonth = getCardFirstInstallmentMonth(item)
  const lastMonth = getCardLastInstallmentMonth(item)
  return Boolean(firstMonth && lastMonth && monthKey >= firstMonth && monthKey <= lastMonth)
}

function getFirstInstallmentDate(purchaseDate) {
  const [dateYear, dateMonth] = purchaseDate.split('-').map(Number)
  return new Date(dateYear, dateMonth, 1)
}

function getCardFirstInstallmentMonth(item) {
  if (!item.date) return item.firstInstallmentMonth || ''
  const firstInstallmentDate = getFirstInstallmentDate(item.date, item.closingDay || 20)
  return formatMonthKey(firstInstallmentDate.getFullYear(), firstInstallmentDate.getMonth())
}

function getCardLastInstallmentMonth(item) {
  const firstMonth = getCardFirstInstallmentMonth(item)
  if (!firstMonth) return item.lastInstallmentMonth || ''

  const [firstYear, firstMonthNumber] = firstMonth.split('-').map(Number)
  const totalInstallments = Math.max(1, Number(item.installments) || 1)
  const lastInstallmentDate = new Date(firstYear, firstMonthNumber - 1 + totalInstallments - 1, 1)
  return formatMonthKey(lastInstallmentDate.getFullYear(), lastInstallmentDate.getMonth())
}

function getPaidCardDebt(item, currentMonthKey) {
  const firstMonth = getCardFirstInstallmentMonth(item)
  const lastMonth = getCardLastInstallmentMonth(item)
  if (!firstMonth || !lastMonth || currentMonthKey <= firstMonth) return 0

  const totalInstallments = Math.max(1, Number(item.installments) || 1)
  const paidInstallments = Math.min(totalInstallments, Math.max(0, getMonthDistance(firstMonth, currentMonthKey)))
  return paidInstallments * getCardBaseInstallmentAmount(item)
}

function normalizeClosingDay(value) {
  const day = Number(value)
  if (!Number.isFinite(day)) return 20
  return Math.min(31, Math.max(1, Math.trunc(day)))
}

function parseIsoDate(value) {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function getStoredNumber(key, fallback) {
  const value = Number(localStorage.getItem(key))
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function getPaidPeriodStart(year, paymentMonthIndex) {
  return new Date(year, paymentMonthIndex - 2, 26)
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

  const start = getPaidPeriodStart(year, monthIndex)
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
  const monthSalary = workedHours * getStoredNumber(HOURLY_RATE_STORAGE_KEY, DEFAULT_HOURLY_RATE)
  const presentismoEnabled = monthDiff(employmentStart, endVisible) >= 2
  const presentismo = presentismoEnabled ? PRESENTISMO_PER_HALF * 2 : 0
  const taxes = (monthSalary + presentismo) * (JUBILACION_RATE + FONASA_RATE + FRL_RATE)
  return Math.round(Math.max(0, monthSalary - taxes + presentismo))
}

function normalizePeriodData(data) {
  return {
    income: data?.income ?? '',
    items: Array.isArray(data?.items) ? data.items : [],
    recurringStatus: data?.recurringStatus && typeof data.recurringStatus === 'object' ? data.recurringStatus : {},
  }
}

function isRecurringActiveForMonth(payment, monthKey) {
  const startMonth = payment.startMonth || '0000-00'
  const endMonth = payment.endDate ? payment.endDate.slice(0, 7) : ''
  return startMonth <= monthKey && (!endMonth || endMonth >= monthKey)
}

function GestionPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [activeMonth, setActiveMonth] = useState(now.getMonth())
  const [loading, setLoading] = useState(false)
  const [periodData, setPeriodData] = useState({ income: '', items: [], recurringStatus: {} })
  const [recurringPayments, setRecurringPayments] = useState([])
  const [cardPayments, setCardPayments] = useState([])
  const [cardMessage, setCardMessage] = useState('')
  const [cardClosingDay, setCardClosingDay] = useState(() => normalizeClosingDay(localStorage.getItem(CARD_CLOSING_DAY_KEY)))

  const [recurringForm, setRecurringForm] = useState({
    name: '',
    category: CATEGORIES[0],
    amount: '',
    endDate: NO_END_DATE,
  })

  const [expenseForm, setExpenseForm] = useState({
    date: `${year}-${String(activeMonth + 1).padStart(2, '0')}-01`,
    category: 'Tarjeta',
    description: '',
    amount: '',
    installments: '1',
  })

  useEffect(() => {
    const loadRecurring = async () => {
      const res = await fetch('/api/gestion/recurring/list')
      const data = await res.json()
      setRecurringPayments(Array.isArray(data) ? data : [])
    }

    loadRecurring()
  }, [])

  useEffect(() => {
    const loadCards = async () => {
      const res = await fetch('/api/gestion/cards/list')
      const data = await res.json()
      setCardPayments(Array.isArray(data) ? data : [])
    }

    loadCards()
  }, [])

  useEffect(() => {
    const loadPeriod = async () => {
      setLoading(true)
      try {
        const month = String(activeMonth + 1).padStart(2, '0')
        const res = await fetch(`/api/gestion/${year}/${month}`)
        const data = await res.json()
        setPeriodData(normalizePeriodData(data))
      } finally {
        setLoading(false)
      }
    }

    loadPeriod()
    setExpenseForm((prev) => ({ ...prev, date: `${year}-${String(activeMonth + 1).padStart(2, '0')}-01` }))
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

  const saveRecurringPayments = async (nextPayments) => {
    setRecurringPayments(nextPayments)
    await fetch('/api/gestion/recurring/list', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextPayments),
    })
  }

  const saveCardPayments = async (nextPayments) => {
    setCardPayments(nextPayments)
    await fetch('/api/gestion/cards/list', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextPayments),
    })
  }

  const updateIncome = (income) => {
    savePeriod({ ...periodData, income })
  }

  const updateCardClosingDay = (value) => {
    const nextClosingDay = normalizeClosingDay(value)
    setCardClosingDay(nextClosingDay)
    localStorage.setItem(CARD_CLOSING_DAY_KEY, String(nextClosingDay))
  }

  const addRecurringPayment = () => {
    if (!recurringForm.name.trim() || !Number(recurringForm.amount)) return
    const payment = {
      id: Date.now(),
      name: recurringForm.name.trim(),
      category: recurringForm.category,
      amount: Number(recurringForm.amount),
      startMonth: formatMonthKey(year, activeMonth),
      endDate: recurringForm.endDate,
      createdAt: new Date().toISOString(),
    }

    saveRecurringPayments([...recurringPayments, payment])
    setRecurringForm((prev) => ({ ...prev, name: '', amount: '', endDate: NO_END_DATE }))
  }

  const removeRecurringPayment = (id) => {
    saveRecurringPayments(recurringPayments.filter((payment) => payment.id !== id))
  }

  const toggleRecurringPayment = (payment) => {
    const currentStatus = periodData.recurringStatus[payment.id] || {}
    const nextStatus = {
      ...periodData.recurringStatus,
      [payment.id]: {
        paid: !currentStatus.paid,
        paidAt: !currentStatus.paid ? new Date().toISOString() : '',
      },
    }
    savePeriod({ ...periodData, recurringStatus: nextStatus })
  }

  const addExpense = () => {
    const amount = parseMoneyInput(expenseForm.amount)
    if (!expenseForm.description.trim()) {
      setCardMessage('Agrega una descripcion para el pago.')
      return
    }
    if (!amount) {
      setCardMessage('Agrega un monto total valido.')
      return
    }
    if (!expenseForm.date) {
      setCardMessage('Selecciona la fecha de compra.')
      return
    }

    const installments = Math.max(1, Number(expenseForm.installments) || 1)
    const installmentAmount = Math.round((amount / installments) * 100) / 100
    const firstInstallmentDate = getFirstInstallmentDate(expenseForm.date, cardClosingDay)
    const lastInstallmentDate = new Date(firstInstallmentDate.getFullYear(), firstInstallmentDate.getMonth() + installments - 1, 1)
    const item = {
      id: Date.now(),
      date: expenseForm.date,
      type: 'card',
      category: 'Tarjeta',
      description: expenseForm.description.trim(),
      amount,
      installments,
      installmentAmount,
      closingDay: cardClosingDay,
      firstInstallmentMonth: formatMonthKey(firstInstallmentDate.getFullYear(), firstInstallmentDate.getMonth()),
      lastInstallmentMonth: formatMonthKey(lastInstallmentDate.getFullYear(), lastInstallmentDate.getMonth()),
    }
    saveCardPayments([...cardPayments, item])
    setCardMessage(`Pago con tarjeta agregado. Primera cuota en ${item.firstInstallmentMonth}.`)
    setExpenseForm((prev) => ({ ...prev, description: '', amount: '', installments: '1' }))
  }

  const removeExpense = (id) => {
    saveCardPayments(cardPayments.filter((item) => item.id !== id))
  }

  const recurringRows = useMemo(
    () =>
      recurringPayments
        .filter((payment) => isRecurringActiveForMonth(payment, formatMonthKey(year, activeMonth)))
        .map((payment) => {
          const status = periodData.recurringStatus[payment.id] || {}
          return {
            ...payment,
            monthLabel: `${MONTHS[activeMonth]} ${year}`,
            paid: Boolean(status.paid),
            paidAt: status.paidAt || '',
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [recurringPayments, periodData.recurringStatus, year, activeMonth],
  )

  const fixedPaidTotal = useMemo(
    () => recurringRows.filter((payment) => payment.paid).reduce((acc, payment) => acc + payment.amount, 0),
    [recurringRows],
  )
  const fixedPendingTotal = useMemo(
    () => recurringRows.filter((payment) => !payment.paid).reduce((acc, payment) => acc + payment.amount, 0),
    [recurringRows],
  )

  const automaticIncome = useMemo(() => getAutomaticIncome(year, activeMonth), [year, activeMonth])
  const activeMonthKey = formatMonthKey(year, activeMonth)
  const activeCardRows = useMemo(
    () => cardPayments.filter((item) => isCardActiveForMonth(item, activeMonthKey)).sort((a, b) => a.date.localeCompare(b.date)),
    [cardPayments, activeMonthKey],
  )
  const cardRows = useMemo(() => [...cardPayments].sort((a, b) => b.date.localeCompare(a.date)), [cardPayments])
  const cardDebtTotal = useMemo(() => cardPayments.reduce((acc, item) => acc + (Number(item.amount) || 0), 0), [cardPayments])
  const cardPaidDebtTotal = useMemo(
    () => cardPayments.reduce((acc, item) => acc + getPaidCardDebt(item, activeMonthKey), 0),
    [cardPayments, activeMonthKey],
  )
  const looseExpensesTotal = useMemo(
    () => activeCardRows.reduce((acc, item) => acc + getCardInstallmentAmount(item, activeMonthKey), 0),
    [activeCardRows, activeMonthKey],
  )
  const cardInstallments = Math.max(1, Number(expenseForm.installments) || 1)
  const cardAmount = parseMoneyInput(expenseForm.amount)
  const cardInstallmentAmount = cardAmount ? Math.round((cardAmount / cardInstallments) * 100) / 100 : 0
  const cardFirstInstallmentDate = expenseForm.date ? getFirstInstallmentDate(expenseForm.date, cardClosingDay) : new Date(year, activeMonth + 1, 1)
  const cardFirstInstallmentMonth = formatMonthKey(cardFirstInstallmentDate.getFullYear(), cardFirstInstallmentDate.getMonth())
  const cardLastInstallmentDate = new Date(cardFirstInstallmentDate.getFullYear(), cardFirstInstallmentDate.getMonth() + cardInstallments - 1, 1)
  const cardLastInstallmentMonth = formatMonthKey(cardLastInstallmentDate.getFullYear(), cardLastInstallmentDate.getMonth())
  const hasManualIncome = periodData.income !== '' && periodData.income !== null
  const income = hasManualIncome ? Number(periodData.income) || 0 : automaticIncome
  const paidTotal = fixedPaidTotal + looseExpensesTotal
  const projectedTotal = paidTotal + fixedPendingTotal
  const currentBalance = income - paidTotal
  const projectedBalance = income - projectedTotal

  return (
    <section className="schedule-page">
      <header className="schedule-header">
        <h2>Gestion de pagos</h2>
        <p>Pagos recurrentes por mes, pendientes hasta que los marques como pagos.</p>
      </header>

      <div className="controls" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <label>
          Año
          <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(Number(e.target.value))} />
        </label>
        <label>
          Mes
          <select value={activeMonth} onChange={(e) => setActiveMonth(Number(e.target.value))}>
            {MONTHS.map((month, index) => (
              <option key={month} value={index}>
                {month}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ingreso liquido
          <input type="text" value={formatMoney(income)} readOnly />
        </label>
        <label>
          Ingreso manual
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
          Pagado
          <input type="text" value={formatMoney(paidTotal)} readOnly />
        </label>
        <label>
          Pendiente fijo
          <input type="text" value={formatMoney(fixedPendingTotal)} readOnly />
        </label>
        <label>
          Deuda tarjeta
          <input type="text" value={formatMoney(cardDebtTotal)} readOnly />
        </label>
        <label>
          Deuda pagada
          <input type="text" value={formatMoney(cardPaidDebtTotal)} readOnly />
        </label>
        <label>
          Saldo actual
          <input type="text" value={formatMoney(currentBalance)} readOnly />
        </label>
        <label>
          Saldo si pagas todo
          <input type="text" value={formatMoney(projectedBalance)} readOnly />
        </label>
      </div>

      <section className="month-editor">
        <h2>Nuevo pago recurrente</h2>
        <div className="editor-grid">
          <label>
            Nombre
            <input type="text" value={recurringForm.name} onChange={(e) => setRecurringForm((prev) => ({ ...prev, name: e.target.value }))} />
          </label>
          <label>
            Categoria
            <select value={recurringForm.category} onChange={(e) => setRecurringForm((prev) => ({ ...prev, category: e.target.value }))}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Monto
            <input type="number" min="0" step="0.01" value={recurringForm.amount} onChange={(e) => setRecurringForm((prev) => ({ ...prev, amount: e.target.value }))} />
          </label>
          <label>
            Fecha de terminacion
            <input type="date" value={recurringForm.endDate} onChange={(e) => setRecurringForm((prev) => ({ ...prev, endDate: e.target.value }))} />
          </label>
        </div>
        <button type="button" className="month-tab" onClick={addRecurringPayment} disabled={loading}>
          Agregar recurrente
        </button>
      </section>

      <section className="month-editor">
        <h2 className="capitalize">Pagos recurrentes - {MONTHS[activeMonth]}</h2>
        <div className="special-days-list">
          {recurringRows.length === 0 ? (
            <span>Sin pagos recurrentes cargados.</span>
          ) : (
            recurringRows.map((payment) => (
              <article key={payment.id} className={`schedule-card recurring-payment ${payment.paid ? 'is-rest-day' : ''}`}>
                <strong>{payment.name}</strong>
                <span>{payment.category}</span>
                <span>{payment.endDate ? `Termina: ${payment.endDate}` : 'Sin finalizacion'}</span>
                <span className="salary">{formatMoney(payment.amount)}</span>
                <div className="special-days-list">
                  <button type="button" className={`chip ${payment.paid ? 'chip-rest' : 'chip-work'}`} onClick={() => toggleRecurringPayment(payment)}>
                    {payment.paid ? 'Pagado' : 'Marcar pago'}
                  </button>
                  <button type="button" className="chip" onClick={() => removeRecurringPayment(payment.id)}>
                    Eliminar fijo
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="month-editor">
        <h2>Pago con tarjeta</h2>
        <div className="editor-grid">
          <label>
            Fecha
            <input type="date" value={expenseForm.date} onChange={(e) => setExpenseForm((prev) => ({ ...prev, date: e.target.value }))} />
          </label>
          <label>
            Dia de cierre
            <input type="number" min="1" max="31" step="1" value={cardClosingDay} onChange={(e) => updateCardClosingDay(e.target.value)} />
          </label>
          <label>
            Descripcion
            <input type="text" value={expenseForm.description} onChange={(e) => setExpenseForm((prev) => ({ ...prev, description: e.target.value }))} />
          </label>
          <label>
            Monto total
            <input
              type="text"
              inputMode="decimal"
              value={expenseForm.amount}
              onChange={(e) => {
                setCardMessage('')
                setExpenseForm((prev) => ({ ...prev, amount: e.target.value }))
              }}
              placeholder="Ej: 10000"
            />
          </label>
          <label>
            Cuotas
            <input type="number" min="1" step="1" value={expenseForm.installments} onChange={(e) => setExpenseForm((prev) => ({ ...prev, installments: e.target.value }))} />
          </label>
        </div>
        {cardInstallmentAmount > 0 && (
          <div className="payment-summary">
            <span>Cuota estimada: {formatMoney(cardInstallmentAmount)}</span>
            <span>Cierre: dia {cardClosingDay}</span>
            <span>Primera cuota: {cardFirstInstallmentMonth}</span>
            <span>Ultima cuota: {cardLastInstallmentMonth}</span>
          </div>
        )}
        {cardMessage && <small className="form-message">{cardMessage}</small>}
        <button type="button" className="month-tab" onClick={addExpense} disabled={loading}>
          Agregar pago con tarjeta
        </button>
      </section>

      <section className="table-wrap expense-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Categoria</th>
              <th>Descripcion</th>
              <th>Cuota</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {recurringRows.length === 0 && cardRows.length === 0 ? (
              <tr>
                <td colSpan={5}>{loading ? 'Cargando...' : 'Sin gastos en este mes.'}</td>
              </tr>
            ) : (
              <>
                {recurringRows.map((payment) => (
                  <tr key={`recurring-${payment.id}`}>
                    <td>{payment.monthLabel}</td>
                    <td>{payment.category}</td>
                    <td>{payment.name}</td>
                    <td className="salary">{formatMoney(payment.amount)}</td>
                    <td>
                      <button type="button" className={`chip ${payment.paid ? 'chip-rest' : 'chip-work'}`} onClick={() => toggleRecurringPayment(payment)}>
                        {payment.paid ? 'Pagado' : 'Impago'}
                      </button>
                    </td>
                  </tr>
                ))}
                {cardRows.map((item) => (
                  <tr key={`item-${item.id}`}>
                    <td>{item.date}</td>
                    <td>{item.category || 'Tarjeta'}</td>
                    <td>
                      {item.type === 'card'
                        ? `${item.description} (${item.installments} cuotas, de ${getCardFirstInstallmentMonth(item)} a ${getCardLastInstallmentMonth(item)}) (${getCardInstallmentProgress(item, activeMonthKey)})`
                        : item.description}
                    </td>
                    <td className="salary">{formatMoney(getCardBaseInstallmentAmount(item))}</td>
                    <td>
                      <button type="button" className="chip" onClick={() => removeExpense(item.id)}>
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </section>
    </section>
  )
}

export default GestionPage
