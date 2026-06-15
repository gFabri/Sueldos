import { useMemo, useState } from 'react'
import './App.css'
import SchedulePage from './SchedulePage'
import GestionPage from './GestionPage'

const DEFAULT_HOURLY_RATE = 170.39
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
    maximumFractionDigits: 0,
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
  const [employmentStartDate, setEmploymentStartDate] = useState('2026-02-12')
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
  const [monthlyFloreria, setMonthlyFloreria] = useState(Array(12).fill(FLORERIA_MVD))
  const [monthlyTicketManual, setMonthlyTicketManual] = useState(Array(12).fill(''))
  const [newSpecialDate, setNewSpecialDate] = useState('')
  const [newSpecialType, setNewSpecialType] = useState('rest')

  const dailyPay = Math.max(0, Number(hourlyRate) || 0) * Math.max(0, Number(hoursPerDay) || 0)
  const periods = useMemo(() => {
    const monthNamesOrder = [
      'enero',
      'febrero',
      'marzo',
      'abril',
      'mayo',
      'junio',
      'julio',
      'agosto',
      'septiembre',
      'octubre',
      'noviembre',
      'diciembre',
    ]

    const rows = Array.from({ length: 12 }, (_, monthIndex) => {
      const start = getPeriodStart(Number(year), monthIndex)
      const endExclusive = getPeriodEndExclusive(start)
      const endVisible = new Date(endExclusive)
      endVisible.setDate(endVisible.getDate() - 1)
      const startIso = formatIsoDate(start)
      const endIso = formatIsoDate(endVisible)
      const employmentStart = parseIsoDate(employmentStartDate)
      const effectiveStart = employmentStart > start ? employmentStart : start
      const isBeforeEmployment = effectiveStart >= endExclusive

      const restConfig = monthlyRestDays[monthIndex]
      const forcedRestSet = new Set(monthlyForcedRestDates[monthIndex])
      const forcedWorkSet = new Set(monthlyForcedWorkDates[monthIndex])
      const { totalDays, sundays, mondays, restDays } = countDays(
        isBeforeEmployment ? endExclusive : effectiveStart,
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
      const monthDailyPay = Math.max(0, Number(hourlyRate) || 0) * Math.max(0, Number(hoursPerDay) || 0)
      const workedHours = finalWorkDays * Math.max(0, Number(hoursPerDay) || 0)
      const monthSalary = finalWorkDays * monthDailyPay
      const taxes = monthSalary * (JUBILACION_RATE + FONASA_RATE + FRL_RATE)
      const floreria = Math.max(0, Number(monthlyFloreria[monthIndex]) || 0)
      const liquidSalary = Math.max(0, monthSalary - taxes - floreria)
      const ticketManual = Number(monthlyTicketManual[monthIndex]) || 0
      const foodTicket = ticketManual > 0 ? ticketManual : monthSalary * FOOD_TICKET_RATE
      const monthsWorked = monthDiff(employmentStart, endVisible)
      const presentismoEnabled = monthsWorked >= 2
      const presentismo = presentismoEnabled
        ? (monthlyPresentismoLostQ1[monthIndex] ? 0 : PRESENTISMO_PER_HALF) +
          (monthlyPresentismoLostQ2[monthIndex] ? 0 : PRESENTISMO_PER_HALF)
        : 0
      const totalToCollect = liquidSalary + presentismo
      const nominalForAguinaldo = monthSalary + presentismo

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
        floreria,
        presentismoEnabled,
        presentismo,
        totalToCollect,
        nominalForAguinaldo,
        monthNameLower: endVisible.toLocaleDateString('es-UY', { month: 'long' }).toLowerCase(),
        forcedRestDates: monthlyForcedRestDates[monthIndex],
        forcedWorkDates: monthlyForcedWorkDates[monthIndex],
      }
    })

    const firstSemesterSet = new Set(monthNamesOrder.slice(0, 5)) // ene-may
    const secondSemesterSet = new Set(monthNamesOrder.slice(5, 11)) // jun-nov

    const cuotaJunio = rows
      .filter((r) => firstSemesterSet.has(r.monthNameLower))
      .reduce((acc, r) => acc + r.nominalForAguinaldo, 0) / 12
    const cuotaDiciembre = rows
      .filter((r) => secondSemesterSet.has(r.monthNameLower))
      .reduce((acc, r) => acc + r.nominalForAguinaldo, 0) / 12

    rows.cuotaJunio = cuotaJunio
    rows.cuotaDiciembre = cuotaDiciembre
    rows.forEach((row) => {
      row.aguinaldoPeriodo = firstSemesterSet.has(row.monthNameLower) ? cuotaJunio : cuotaDiciembre
    })
    return rows
  }, [
    year,
    dailyPay,
    monthlyUnpaidDays,
    monthlyManualFinalDays,
    monthlyRestDays,
    monthlyForcedRestDates,
    monthlyForcedWorkDates,
    employmentStartDate,
    monthlyPresentismoLostQ1,
    monthlyPresentismoLostQ2,
    monthlyFloreria,
    monthlyTicketManual,
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

  const handleFloreriaChange = (index, value) => {
    setMonthlyFloreria((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleTicketManualChange = (index, value) => {
    setMonthlyTicketManual((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const handleCollectedManualChange = (index, value) => {
    setMonthlyCollectedManual((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const activePeriod = periods[activeMonth]
  const isHorariosRoute = window.location.pathname.toLowerCase().startsWith('/horarios')
  const isGestionRoute = window.location.pathname.toLowerCase().startsWith('/gestion')

  if (isHorariosRoute) {
    return (
      <main className="app-shell">
        <section className="panel">
          <SchedulePage />
        </section>
      </main>
    )
  }

  if (isGestionRoute) {
    return (
      <main className="app-shell">
        <section className="panel">
          <GestionPage />
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
            Fecha de ingreso
            <input
              type="date"
              value={employmentStartDate}
              onChange={(e) => setEmploymentStartDate(e.target.value)}
            />
          </label>

          <label>
            Pago por hora
            <input
              type="number"
              min="0"
              step="0.01"
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

          <label>
            Aguinaldo estimado (cuota junio)
            <input type="text" value={formatMoney(periods.cuotaJunio || 0)} readOnly />
          </label>

          <label>
            Aguinaldo estimado (cuota diciembre)
            <input type="text" value={formatMoney(periods.cuotaDiciembre || 0)} readOnly />
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
                disabled={!activePeriod.presentismoEnabled}
                onChange={() => togglePresentismoQ1(activeMonth)}
              />
            </label>

            <label>
              Presentismo 2da quincena (perdido)
              <input
                type="checkbox"
                checked={monthlyPresentismoLostQ2[activeMonth]}
                disabled={!activePeriod.presentismoEnabled}
                onChange={() => togglePresentismoQ2(activeMonth)}
              />
            </label>

            <label>
              Florería del mes
              <input
                type="number"
                min="0"
                step="0.01"
                value={monthlyFloreria[activeMonth]}
                onChange={(e) => handleFloreriaChange(activeMonth, e.target.value)}
              />
            </label>

            <label>
              Ticket manual del mes
              <input
                type="number"
                min="0"
                step="0.01"
                value={monthlyTicketManual[activeMonth]}
                onChange={(e) => handleTicketManualChange(activeMonth, e.target.value)}
                placeholder="vacío = automático"
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
            {!activePeriod.presentismoEnabled ? ' Se habilita desde el 3er mes laboral.' : ''}
          </small>
        </section>

        <section className="table-wrap salary-table-wrap">
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
                <th>Líquido calc.</th>
                
                <th>Florería</th>
                <th>Ticket alimentación</th>
                <th>Presentismo</th>
                <th>Total a cobrar</th>
                <th>Aguinaldo período</th>
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
                  <td>{formatMoney(period.floreria)}</td>
                  <td className="salary">{formatMoney(period.foodTicket)}</td>
                  <td className="salary">{formatMoney(period.presentismo)}</td>
                  <td className="salary">{formatMoney(period.totalToCollect)}</td>
                  <td className="salary">{formatMoney(period.aguinaldoPeriodo)}</td>
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








