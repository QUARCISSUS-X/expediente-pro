// Exportación del programa de obra a MS Project (formato XML MSPDI).
import type { Resultados } from '../engine/types';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const TIPO: Record<string, number> = { FF: 0, FC: 1, CC: 3 };

export function generarMsProject(r: Resultados): string {
  const m = r.proyecto.meta;
  const h = m.jornadaHoras || 8;
  const acts = new Map(r.programa.actividades.map((a) => [a.partidaId, a]));
  const uid = new Map<string, number>();
  let n = 1;
  // títulos que contienen actividades
  const conActividad = new Set<string>();
  for (const f of r.filas) {
    if (f.esTitulo || !acts.has(f.partida.id)) continue;
    let padre = f.padreId;
    while (padre) {
      conActividad.add(padre);
      padre = r.filas.find((x) => x.partida.id === padre)?.padreId ?? null;
    }
  }
  const filas = r.filas.filter((f) => (f.esTitulo ? conActividad.has(f.partida.id) : acts.has(f.partida.id)));
  for (const f of filas) uid.set(f.partida.id, n++);
  const fin = (iso: string) => `${iso}T${String(8 + Math.min(h, 8) + (h > 4 ? 1 : 0)).padStart(2, '0')}:00:00`;
  const ini = (iso: string) => `${iso}T08:00:00`;
  const rango = (id: string): [string, string] => {
    let a = '9999', b = '0000';
    for (const f of r.filas) {
      if (f.esTitulo) continue;
      let p: string | null = f.partida.id;
      let dentro = false;
      while (p) {
        if (p === id) { dentro = true; break; }
        p = r.filas.find((x) => x.partida.id === p)?.padreId ?? null;
      }
      const ac = acts.get(f.partida.id);
      if (dentro && ac) { if (ac.inicio < a) a = ac.inicio; if (ac.fin > b) b = ac.fin; }
    }
    return [a, b];
  };
  const tareas = filas
    .map((f) => {
      const id = uid.get(f.partida.id)!;
      const base = `<UID>${id}</UID><ID>${id}</ID><Name>${esc(f.partida.descripcion)}</Name><WBS>${esc(f.partida.codigo)}</WBS><OutlineLevel>${f.nivel}</OutlineLevel>`;
      if (f.esTitulo) {
        const [a, b] = rango(f.partida.id);
        return `<Task>${base}<Summary>1</Summary><Start>${ini(a)}</Start><Finish>${fin(b)}</Finish></Task>`;
      }
      const ac = acts.get(f.partida.id)!;
      const links = ac.predecesoras
        .filter((p) => uid.has(p.id))
        .map((p) => `<PredecessorLink><PredecessorUID>${uid.get(p.id)}</PredecessorUID><Type>${TIPO[p.tipo] ?? 1}</Type><CrossProject>0</CrossProject><LinkLag>${Math.round(p.desfase * h * 600)}</LinkLag><LagFormat>7</LagFormat></PredecessorLink>`)
        .join('');
      return `<Task>${base}<Summary>0</Summary><Type>1</Type><Start>${ini(ac.inicio)}</Start><Finish>${fin(ac.fin)}</Finish><Duration>PT${ac.duracion * h}H0M0S</Duration><DurationFormat>7</DurationFormat><Critical>${ac.critica ? 1 : 0}</Critical><Notes>${esc(`Metrado: ${ac.metrado} ${ac.unidad} · Parcial: ${m.moneda} ${ac.parcial.toFixed(2)}`)}</Notes>${links}</Task>`;
    })
    .join('\n    ');
  const laborables = new Set(m.diasLaborables);
  const tiempos = h <= 4
    ? `<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>${String(8 + h).padStart(2, '0')}:00:00</ToTime></WorkingTime></WorkingTimes>`
    : `<WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>12:00:00</ToTime></WorkingTime><WorkingTime><FromTime>13:00:00</FromTime><ToTime>${String(13 + h - 4).padStart(2, '0')}:00:00</ToTime></WorkingTime></WorkingTimes>`;
  const dias = [0, 1, 2, 3, 4, 5, 6]
    .map((d) => `<WeekDay><DayType>${d + 1}</DayType><DayWorking>${laborables.has(d) ? 1 : 0}</DayWorking>${laborables.has(d) ? tiempos : ''}</WeekDay>`)
    .join('');
  const feriados = m.feriados
    .map((f) => `<WeekDay><DayType>0</DayType><DayWorking>0</DayWorking><TimePeriod><FromDate>${f}T00:00:00</FromDate><ToDate>${f}T23:59:00</ToDate></TimePeriod></WeekDay>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>${esc(m.codigo)}.xml</Name>
  <Title>${esc(m.nombre)}</Title>
  <Company>${esc(r.proyecto.entidades.proyectista.nombre)}</Company>
  <Author>${esc(r.proyecto.responsables.elaboro.nombre)}</Author>
  <ScheduleFromStart>1</ScheduleFromStart>
  <StartDate>${ini(r.programa.inicio)}</StartDate>
  <FinishDate>${fin(r.programa.fin)}</FinishDate>
  <CalendarUID>1</CalendarUID>
  <DefaultStartTime>08:00:00</DefaultStartTime>
  <MinutesPerDay>${h * 60}</MinutesPerDay>
  <MinutesPerWeek>${h * 60 * laborables.size}</MinutesPerWeek>
  <DaysPerMonth>${Math.round((laborables.size * 30) / 7)}</DaysPerMonth>
  <CurrencySymbol>${esc(m.moneda)}</CurrencySymbol>
  <Calendars>
    <Calendar><UID>1</UID><Name>Calendario de obra</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>${dias}${feriados}</WeekDays></Calendar>
  </Calendars>
  <Tasks>
    ${tareas}
  </Tasks>
</Project>
`;
}
