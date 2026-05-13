import { useMemo, useState } from 'react'
import './App.css'
import SchedulePage from './SchedulePage'

const DEFAULT_HOURLY_RATE = 170
const DEFAULT_HOURS_PER_DAY = 8
const JUBILACION_RATE = 0.15
const FONASA_RATE = 0.045
const FRL_RATE = 0.001
const FLORERIA_MVD = 18
const FOOD_TICKET_RATE = 0.0695
const PRESENTISMO_PER_HALF = 1350
const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

function formatMoney(value) {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    maximumFractionDigits: 2,
  }).format(value)
}

function formatDate(date) {
  return date.toLocaleDateString('es-UY')
}

function formatIsoDate(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getPeriodStart(year, monthIndex) {
  return new Date(year, monthIndex - 1, 26)
}

function getPeriodEndExclusive(start) {
  return new Date(start.getFullYear(), start.getMonth() + 1, 26)
}

function countDays(startInclusive, endExclusive, restDaysConfig, forcedRestSet, forcedWorkSet) {
  let totalDays = 0
  let sundays = 0
  let mondays = 0
  let restDays = 0

  const current = new Date(startInclusive)
  while (current < endExclusive) {
    totalDays += 1
    const day = current.getDay()
    const isoDate = formatIsoDate(current)
    const isForcedRest = forcedRestSet.has(isoDate)
    const isForcedWork = forcedWorkSet.has(isoDate)
    const isBaseRest = restDaysConfig[day]
    const isRestDay = isForcedRest || (!isForcedWork && isBaseRest)
    if (day === 0) sundays += 1
    if (day === 1) mondays += 1
    if (isRestDay) restDays += 1
    current.setDate(current.getDate() + 1)
  }

  return { totalDays, sundays, mondays, restDays }
}

function App() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [hourlyRate, setHourlyRate] = useState(DEFAULT_HOURLY_RATE)
  const [hoursPerDay, setHoursPerDay] = useState(DEFAULT_HOURS_PER_DAY)
  const [activeMonth, setActiveMonth] = useState(now.getMonth())
  const [monthlyUnpaidDays, setMonthlyUnpaidDays] = useState(Array(12).fill(0))
  const [monthlyManualFinalDays, setMonthlyManualFinalDays] = useState(Array(12).fill(''))
  const [monthlyRestDays, setMonthlyRestDays] = useState(
    Array.from({ length: 12 }, () => [true, true, false, false, false, false, false]),
  )
  const [monthlyForcedRestDates, setMonthlyForcedRestDates] = useState(Array.from({ length: 12 }, () => []))
  const [monthlyForcedWorkDates, setMonthlyForcedWorkDates] = useState(Array.from({ length: 12 }, () => []))
  const [monthlyPresentismoLostQ1, setMonthlyPresentismoLostQ1] = useState(Array(12).fill(false))
  const [monthlyPresentismoLostQ2, setMonthlyPresentismoLostQ2] = useState(Array(12).fill(false))
  const [newSpecialDate, setNewSpecialDate] = useState('')
  const [newSpecialType, setNewSpecialType] = useState('rest')

  const dailyPay = Math.max(0, Number(hourlyRate) || 0) * Math.max(0, Number(hoursPerDay) || 0)
  const periods = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const start = getPeriodStart(Number(year), monthIndex)
      const endExclusive = getPeriodEndExclusive(start)
      const endVisible = new Date(endExclusive)
      endVisible.setDate(endVisible.getDate() - 1)
      const startIso = formatIsoDate(start)
      const endIso = formatIsoDate(endVisible)

      const restConfig = monthlyRestDays[monthIndex]
      const forcedRestSet = new Set(monthlyForcedRestDates[monthIndex])
      const forcedWorkSet = new Set(monthlyForcedWorkDates[monthIndex])
      const { totalDays, sundays, mondays, restDays } = countDays(
        start,
        endExclusive,
        restConfig,
        forcedRestSet,
        forcedWorkSet,
      )
      const baseWorkDays = Math.max(0, totalDays - restDays)
      const extraUnpaid = Math.max(0, Number(monthlyUnpaidDays[monthIndex]) || 0)
      const autoFinalWorkDays = Math.max(0, baseWorkDays - extraUnpaid)
      const manualFinalDaysRaw = monthlyManualFinalDays[monthIndex]
      const hasManualFinalDays = manualFinalDaysRaw !== '' && manualFinalDaysRaw !== null
      const finalWorkDays = hasManualFinalDays
        ? Math.max(0, Number(manualFinalDaysRaw) || 0)
        : autoFinalWorkDays
      const workedHours = finalWorkDays * Math.max(0, Number(hoursPerDay) || 0)
      const monthSalary = finalWorkDays * dailyPay
      const taxes = monthSalary * (JUBILACION_RATE + FONASA_RATE + FRL_RATE)
      const liquidSalary = Math.max(0, monthSalary - taxes - FLORERIA_MVD)
      const foodTicket = monthSalary * FOOD_TICKET_RATE
      const presentismo =
        (monthlyPresentismoLostQ1[monthIndex] ? 0 : PRESENTISMO_PER_HALF) +
        (monthlyPresentismoLostQ2[monthIndex] ? 0 : PRESENTISMO_PER_HALF)
      const totalToCollect = liquidSalary + presentismo

      return {
        key: `${year}-${monthIndex}`,
        label: endVisible.toLocaleDateString('es-UY', { month: 'long' }),
        periodText: `${formatDate(start)} al ${formatDate(endVisible)}`,
        startIso,
        endIso,
        sundays,
        mondays,
        restDays,
        baseWorkDays,
        extraUnpaid,
        autoFinalWorkDays,
        hasManualFinalDays,
        finalWorkDays,
        workedHours,
        monthSalary,
        liquidSalary,
        foodTicket,
        presentismo,
        totalToCollect,
        forcedRestDates: monthlyForcedRestDates[monthIndex],
        forcedWorkDates: monthlyForcedWorkDates[monthIndex],
      }
    })
  }, [
    year,
    dailyPay,
    monthlyUnpaidDays,
    monthlyManualFinalDays,
    monthlyRestDays,
    monthlyForcedRestDates,
    monthlyForcedWorkDates,
    monthlyPresentismoLostQ1,
    monthlyPresentismoLostQ2,
    hoursPerDay,
  ])

  const handleMonthlyUnpaidChange = (index, value) => {
    setMonthlyUnpaidDays((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleMonthlyManualFinalDaysChange = (index, value) => {
    setMonthlyManualFinalDays((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const toggleRestDay = (monthIndex, dayIndex) => {
    setMonthlyRestDays((prev) => {
      const next = prev.map((days) => [...days])
      next[monthIndex][dayIndex] = !next[monthIndex][dayIndex]
      return next
    })
  }

  const addSpecialDate = () => {
    if (!newSpecialDate) return
    const active = periods[activeMonth]
    if (newSpecialDate < active.startIso || newSpecialDate > active.endIso) return

    if (newSpecialType === 'rest') {
      setMonthlyForcedRestDates((prev) => {
        const next = prev.map((dates) => [...dates])
        if (!next[activeMonth].includes(newSpecialDate)) next[activeMonth].push(newSpecialDate)
        return next
      })
      setMonthlyForcedWorkDates((prev) => {
        const next = prev.map((dates) => dates.filter((d) => d !== newSpecialDate))
        return next
      })
    } else {
      setMonthlyForcedWorkDates((prev) => {
        const next = prev.map((dates) => [...dates])
        if (!next[activeMonth].includes(newSpecialDate)) next[activeMonth].push(newSpecialDate)
        return next
      })
      setMonthlyForcedRestDates((prev) => {
        const next = prev.map((dates) => dates.filter((d) => d !== newSpecialDate))
        return next
      })
    }

    setNewSpecialDate('')
  }

  const removeSpecialDate = (type, date) => {
    if (type === 'rest') {
      setMonthlyForcedRestDates((prev) => prev.map((dates, idx) => (idx === activeMonth ? dates.filter((d) => d !== date) : dates)))
    } else {
      setMonthlyForcedWorkDates((prev) => prev.map((dates, idx) => (idx === activeMonth ? dates.filter((d) => d !== date) : dates)))
    }
  }

  const togglePresentismoQ1 = (monthIndex) => {
    setMonthlyPresentismoLostQ1((prev) => {
      const next = [...prev]
      next[monthIndex] = !next[monthIndex]
      return next
    })
  }

  const togglePresentismoQ2 = (monthIndex) => {
    setMonthlyPresentismoLostQ2((prev) => {
      const next = [...prev]
      next[monthIndex] = !next[monthIndex]
      return next
    })
  }

  const activePeriod = periods[activeMonth]
  const isHorariosRoute = window.location.pathname.toLowerCase().startsWith('/horarios')

  if (isHorariosRoute) {
    return (
      <main className="app-shell">
        <section className="panel">
          <SchedulePage />
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="panel">
        <header className="header">
          <h1>Calculadora de Sueldo Mes a Mes</h1>
          <p>Períodos: del 26 al 25 siguiente (26 del siguiente mes exclusivo).</p>
        </header>

        <div className="controls">
          <label>
            Año
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>

          <label>
            Pago por hora
            <input
              type="number"
              min="0"
              step="1"
              value={hourlyRate}
              onChange={(e) => setHourlyRate(e.target.value)}
            />
          </label>

          <label>
            Horas por día
            <input
              type="number"
              min="0"
              step="1"
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(e.target.value)}
            />
          </label>

          <label>
            Pago por día (calculado)
            <input type="text" value={formatMoney(dailyPay)} readOnly />
          </label>
        </div>

        <section className="tabs-wrap">
          {periods.map((period, index) => (
            <button
              key={period.key}
              type="button"
              className={`month-tab ${activeMonth === index ? 'is-active' : ''}`}
              onClick={() => setActiveMonth(index)}
            >
              <span className="capitalize">{period.label}</span>
            </button>
          ))}
        </section>

        <section className="month-editor">
          <h2 className="capitalize">Edición manual: {activePeriod.label}</h2>
          <p>{activePeriod.periodText}</p>
          <div className="editor-grid">
            <label>
              Descuento opcional de días no pagos
              <input
                type="number"
                min="0"
                step="1"
                value={monthlyUnpaidDays[activeMonth]}
                onChange={(e) => handleMonthlyUnpaidChange(activeMonth, e.target.value)}
              />
            </label>

            <label>
              Días finales manuales (vacío = automático)
              <input
                type="number"
                min="0"
                step="1"
                value={monthlyManualFinalDays[activeMonth]}
                onChange={(e) => handleMonthlyManualFinalDaysChange(activeMonth, e.target.value)}
                placeholder="Ej: 18"
              />
            </label>

            <label>
              Presentismo 1ra quincena (perdido)
              <input
                type="checkbox"
                checked={monthlyPresentismoLostQ1[activeMonth]}
                onChange={() => togglePresentismoQ1(activeMonth)}
              />
            </label>

            <label>
              Presentismo 2da quincena (perdido)
              <input
                type="checkbox"
                checked={monthlyPresentismoLostQ2[activeMonth]}
                onChange={() => togglePresentismoQ2(activeMonth)}
              />
            </label>
          </div>
          <div className="rest-days-picker">
            <span>Días libres para este mes:</span>
            <div className="weekday-buttons">
              {DAY_LABELS.map((day, dayIndex) => (
                <button
                  key={day}
                  type="button"
                  className={`weekday-btn ${monthlyRestDays[activeMonth][dayIndex] ? 'is-on' : ''}`}
                  onClick={() => toggleRestDay(activeMonth, dayIndex)}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div className="special-days">
            <span>Ajustes puntuales por fecha (solo para semanas específicas):</span>
            <div className="special-days-controls">
              <input
                type="date"
                min={activePeriod.startIso}
                max={activePeriod.endIso}
                value={newSpecialDate}
                onChange={(e) => setNewSpecialDate(e.target.value)}
              />
              <select value={newSpecialType} onChange={(e) => setNewSpecialType(e.target.value)}>
                <option value="rest">Marcar como Libre</option>
                <option value="work">Marcar como Trabajado</option>
              </select>
              <button type="button" className="month-tab" onClick={addSpecialDate}>
                Agregar
              </button>
            </div>
            <div className="special-days-list">
              {activePeriod.forcedRestDates.map((date) => (
                <button key={`rest-${date}`} type="button" className="chip chip-rest" onClick={() => removeSpecialDate('rest', date)}>
                  Libre {date} x
                </button>
              ))}
              {activePeriod.forcedWorkDates.map((date) => (
                <button key={`work-${date}`} type="button" className="chip chip-work" onClick={() => removeSpecialDate('work', date)}>
                  Trabajado {date} x
                </button>
              ))}
            </div>
          </div>
          <small>
            Automático: {activePeriod.autoFinalWorkDays} días.
            {activePeriod.hasManualFinalDays
              ? ` Manual aplicado: ${activePeriod.finalWorkDays} días.`
              : ' Sin override manual.'}
            {` Ticket alimentación auto: ${(FOOD_TICKET_RATE * 100).toFixed(2)}% del sueldo.`}
            {` Presentismo: ${formatMoney(activePeriod.presentismo)} (1350 por quincena).`}
          </small>
        </section>

        <section className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th>Período</th>
                <th>Descanso</th>
                <th>Días base</th>
                <th>Descuento opcional</th>
                <th>Días finales</th>
                <th>Horas trabajadas</th>
                <th>Sueldo mes</th>
                <th>Líquido</th>
                <th>Ticket alimentación</th>
                <th>Presentismo</th>
                <th>Total a cobrar</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((period, index) => (
                <tr key={period.key}>
                  <td className="capitalize">{period.label}</td>
                  <td>{period.periodText}</td>
                  <td>{period.restDays}</td>
                  <td>{period.baseWorkDays}</td>
                  <td>
                    <input
                      className="small-input"
                      type="number"
                      min="0"
                      step="1"
                      value={monthlyUnpaidDays[index]}
                      onChange={(e) => handleMonthlyUnpaidChange(index, e.target.value)}
                    />
                  </td>
                  <td>{period.finalWorkDays}</td>
                  <td>{period.workedHours}</td>
                  <td className="salary">{formatMoney(period.monthSalary)}</td>
                  <td className="salary">{formatMoney(period.liquidSalary)}</td>
                  <td className="salary">{formatMoney(period.foodTicket)}</td>
                  <td className="salary">{formatMoney(period.presentismo)}</td>
                  <td className="salary">{formatMoney(period.totalToCollect)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </section>
    </main>
  )
}

export default App



