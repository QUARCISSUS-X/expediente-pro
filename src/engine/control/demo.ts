// Datos de demostración (controlDemostracion) para todas las funciones de control.
// Parte del motor de control (src/engine/control.ts reexporta todo).
import { firmasPorDefecto, puntosSugeridos } from '../calidad';
import { enlazarRestriccion, generarTarjetas, moverTarjeta } from '../kanban';
import { resumirRiesgo, simularRiesgo } from '../riesgo';
import { type Resultados } from '../types';
import { difDias, redondear, sumarDias, uid } from '../util';
import { demostracionValor } from '../valorDemo';
import { ejecutadoHasta, pvPartida } from './evm';
import { calendarioDe, lunesDe } from './fechas';
import { crearLineaBase } from './lineaBase';
import { compromisosSugeridos, hitosDesdeCronograma, lookahead } from './lps';
import { type Control, controlVacio, type Ishikawa, PLANTILLAS_INSPECCION, TIPOS_RESTRICCION } from './modelo';

// ======================================================================= datos de demostración

/** Datos ficticios coherentes con el proyecto, para conocer las herramientas. */
export function controlDemostracion(r: Resultados): Control {
  const c = controlVacio();
  const lb = crearLineaBase(r, 'Línea base de demostración');
  lb.fecha = lb.inicio;
  c.lineaBase = lb;
  let semilla = 7;
  const azar = () => {
    semilla = (semilla * 16807) % 2147483647;
    return (semilla - 1) / 2147483646;
  };
  const cal = calendarioDe(r, lb.inicio);
  // frentes: uno por título de primer nivel
  const titulos = r.filas.filter((f) => f.esTitulo && f.nivel === 1).slice(0, 4);
  for (const t of titulos) {
    const pref = t.partida.codigo + '.';
    c.frentes.push({
      id: uid('fte'),
      nombre: `Frente ${t.partida.codigo} – ${t.partida.descripcion.slice(0, 40)}`,
      ubicacion: '',
      responsable: 'Ing. de campo',
      estado: 'activo',
      partidas: lb.partidas.filter((b) => b.codigo.startsWith(pref)).map((b) => b.id),
      nota: '',
    });
  }
  const frenteDe = (pid: string) => c.frentes.find((f) => f.partidas.includes(pid))?.id ?? '';
  // seis cortes semanales con avance algo por debajo de lo programado
  const nCortes = Math.min(6, Math.max(2, Math.floor(difDias(lb.inicio, lb.fin) / 7)));
  let prev = sumarDias(lb.inicio, -1);
  for (let i = 1; i <= nCortes; i++) {
    const fecha = sumarDias(lunesDe(lb.inicio), 7 * i - 2); // sábado
    const metrados: Record<string, number> = {};
    let costo = 0;
    for (const b of lb.partidas) {
      const plan = b.parcial > 0 ? (pvPartida(cal, b, fecha) - pvPartida(cal, b, prev)) / b.pu : 0;
      if (plan <= 0) continue;
      const factor = 0.78 + azar() * 0.3;
      const m = redondear(plan * factor, 2);
      if (m > 0) {
        metrados[b.id] = m;
        costo += m * b.pu * (0.97 + azar() * 0.12);
      }
    }
    c.cortes.push({ id: uid('cte'), fecha, nombre: `Semana ${i}`, metrados, costoReal: redondear(costo * 1.0), nota: '' });
    prev = fecha;
  }
  // mediciones de rendimiento de las partidas con más mano de obra
  const conMo = [...lb.partidas].filter((b) => b.hhUnidad > 0).sort((a, b) => b.hhUnidad * b.metrado - a.hhUnidad * a.metrado).slice(0, 5);
  for (const b of conMo) {
    for (let d = 0; d < 12; d++) {
      const fecha = sumarDias(b.inicio, d);
      if (!cal.esLaborable(fecha) || fecha > b.fin) continue;
      const trab = 4 + Math.round(azar() * 3);
      const horas = 8;
      const ip = 0.82 + azar() * 0.32;
      const cantidad = redondear((trab * horas) / (b.hhUnidad / ip), 2);
      c.mediciones.push({ id: uid('med'), fecha, frenteId: frenteDe(b.id), partidaId: b.id, cantidad, trabajadores: trab, horas, nota: '' });
    }
  }
  // Last Planner
  c.hitos = hitosDesdeCronograma(r);
  const h0 = c.hitos[0];
  if (h0)
    c.fases = [
      { id: uid('fase'), hitoId: h0.id, orden: 1, actividad: 'Recepción y protocolo de calidad', especialidad: 'Calidad', responsable: 'Supervisor de calidad', duracion: 1 },
      { id: uid('fase'), hitoId: h0.id, orden: 2, actividad: 'Ejecución de la última partida del frente', especialidad: 'Producción', responsable: 'Capataz', duracion: 5 },
      { id: uid('fase'), hitoId: h0.id, orden: 3, actividad: 'Abastecimiento de materiales del frente', especialidad: 'Logística', responsable: 'Almacenero', duracion: 3 },
      { id: uid('fase'), hitoId: h0.id, orden: 4, actividad: 'Liberación de permisos de trabajo', especialidad: 'Seguridad', responsable: 'Prevencionista', duracion: 2 },
    ];
  const causas = ['Materiales', 'Actividad previa', 'Clima', 'Mano de obra', 'Materiales', 'Equipos', 'Permisos', 'Materiales'];
  let ci = 0;
  for (let i = 0; i < nCortes; i++) {
    const lunes = sumarDias(lunesDe(lb.inicio), 7 * i);
    const sug = compromisosSugeridos(r, c, lunes).slice(0, 8);
    for (const x of sug) {
      x.responsable = 'Capataz';
      x.cumplido = azar() > 0.27;
      if (!x.cumplido) x.causa = causas[ci++ % causas.length];
    }
    c.semanas.push({ id: uid('sem'), inicio: lunes, compromisos: sug });
  }
  const proximas = lookahead(r, c, sumarDias(lunesDe(lb.inicio), 7 * nCortes), 4).filas.slice(0, 5);
  proximas.forEach((f, i) =>
    c.restricciones.push({
      id: uid('res'),
      partidaId: f.partidaId,
      tipo: TIPOS_RESTRICCION[i % 6],
      descripcion: ['Confirmar llegada de materiales al almacén de obra', 'Plano de detalle aprobado por la supervisión', 'Permiso de trabajo de la unidad', 'Cuadrilla adicional con inducción', 'Excavadora disponible del subcontratista'][i],
      responsable: ['Logística', 'Oficina técnica', 'Seguridad', 'Administración de obra', 'Equipos'][i],
      fechaRequerida: sumarDias(f.inicio, -3),
      fechaLiberacion: i < 2 ? sumarDias(f.inicio, -5) : '',
      liberada: i < 2,
    }),
  );
  // control de obra
  c.riesgos = [
    { id: uid('rsg'), descripcion: 'Lluvias intensas que paralicen movimiento de tierras', categoria: 'Clima', probabilidad: 4, impacto: 4, respuesta: 'mitigar', accion: 'Programar frentes alternos y drenaje provisional', responsable: 'Residente', contingencia: 15000, estado: 'abierto' },
    { id: uid('rsg'), descripcion: 'Demora en la aprobación de permisos de la unidad', categoria: 'Permisos', probabilidad: 3, impacto: 4, respuesta: 'mitigar', accion: 'Tramitar con dos semanas de anticipación', responsable: 'Seguridad', contingencia: 5000, estado: 'abierto' },
    { id: uid('rsg'), descripcion: 'Alza de precio del acero', categoria: 'Costos', probabilidad: 2, impacto: 3, respuesta: 'transferir', accion: 'Cerrar precio con el proveedor', responsable: 'Logística', contingencia: 8000, estado: 'abierto' },
  ];
  c.cambios = [
    { id: uid('cmb'), numero: 'ADC-01', tipo: 'adicional', fecha: sumarDias(lb.inicio, 20), descripcion: 'Mayor volumen de excavación por material suelto', causa: 'Condición de terreno', monto: redondear(lb.subtotal * 0.035), plazoDias: 7, estado: 'aprobado' },
    { id: uid('cmb'), numero: 'DED-01', tipo: 'deductivo', fecha: sumarDias(lb.inicio, 25), descripcion: 'Partida no ejecutada por cambio de diseño', causa: 'Cambio de diseño', monto: redondear(lb.subtotal * 0.01), plazoDias: 0, estado: 'aprobado' },
  ];
  c.registros = [
    { id: uid('reg'), tipo: 'rfi', numero: 'RFI-001', fecha: sumarDias(lb.inicio, 6), asunto: 'Cota de fondo de cimentación', detalle: 'Se solicita confirmar la cota de fondo en el eje 3.', autor: 'Residente', destinatario: 'Supervisión', fechaLimite: sumarDias(lb.inicio, 9), respuesta: 'Se mantiene la cota del plano E-02.', fechaRespuesta: sumarDias(lb.inicio, 8), estado: 'cerrado' },
    { id: uid('reg'), tipo: 'asiento', numero: '12', fecha: sumarDias(lb.inicio, 15), asunto: 'Paralización por lluvia', detalle: 'Se paralizan los trabajos de excavación por 4 horas.', autor: 'Residente', destinatario: 'Supervisión', fechaLimite: '', respuesta: '', fechaRespuesta: '', estado: 'abierto' },
  ];
  // lean
  if (conMo[0])
    c.cartas.push({
      id: uid('cb'),
      fecha: sumarDias(conMo[0].inicio, 2),
      tipo: 'carta',
      frenteId: frenteDe(conMo[0].id),
      partidaId: conMo[0].id,
      cuadrilla: '1 operario + 3 peones',
      conteos: { productivo: 112, transporte: 38, instrucciones: 12, mediciones: 9, limpieza: 7, preparacion: 14, otrosTC: 4, esperas: 26, viajes: 18, ocio: 11, retrabajo: 6, necesidades: 5, otrosTNC: 3 },
      nota: '',
    });
  c.perdidas = [
    { id: uid('prd'), fecha: sumarDias(lb.inicio, 3), frenteId: c.frentes[0]?.id ?? '', partidaId: conMo[0]?.id ?? '', tipo: 'Esperas', descripcion: 'Cuadrilla espera llegada del volquete', horas: 12, costo: 300 },
    { id: uid('prd'), fecha: sumarDias(lb.inicio, 5), frenteId: c.frentes[0]?.id ?? '', partidaId: conMo[1]?.id ?? '', tipo: 'Transporte', descripcion: 'Acarreo manual por acceso bloqueado', horas: 8, costo: 200 },
    { id: uid('prd'), fecha: sumarDias(lb.inicio, 9), frenteId: c.frentes[1]?.id ?? '', partidaId: conMo[2]?.id ?? '', tipo: 'Defectos / retrabajos', descripcion: 'Rehacer encofrado desalineado', horas: 6, costo: 180 },
  ];
  c.inspecciones.push({
    id: uid('ins'),
    fecha: sumarDias(lb.inicio, 7),
    plantilla: '5s',
    frenteId: c.frentes[0]?.id ?? '',
    responsable: 'Prevencionista',
    items: PLANTILLAS_INSPECCION['5s'].items.map((t, i) => ({ texto: t, resultado: i % 4 === 3 ? 'no' : 'si', nota: '' })),
    nota: '',
  });
  // six sigma
  c.series.push({ id: uid('ser'), nombre: 'Grado de compactación (Proctor modificado)', unidad: '%', lei: 95, les: null, objetivo: 97, valores: [97.2, 96.8, 98.1, 95.9, 97.5, 96.2, 97.9, 98.4, 96.6, 95.4, 97.1, 96.9, 97.8, 96.1, 98.0, 97.3] });
  const ish: Ishikawa = {
    id: uid('ish'),
    problema: 'Rendimiento de excavación por debajo del APU',
    causas: { 'Mano de obra': 'Cuadrilla nueva sin experiencia', Método: 'Acarreo manual en lugar de carretillas', Materiales: '', Máquinas: 'Volquete con demoras', Medición: 'Metrado diario estimado a ojo', 'Medio ambiente': 'Lluvias por la tarde' },
    raiz: 'Esperas de transporte (volquete)',
  };
  c.ishikawas.push(ish);
  c.dmaic.push({
    id: uid('dmc'),
    titulo: 'Reducir las HH por m³ de excavación',
    responsable: 'Ing. de producción',
    fase: 'I',
    problema: 'La excavación consume más horas-hombre que las presupuestadas.',
    objetivo: 'Llegar a un índice de productividad de 1.00',
    alcance: 'Frente 1',
    ctq: 'HH por m³',
    metrica: 'Índice de productividad',
    unidad: '',
    mayorEsMejor: true,
    lineaBaseValor: 0.86,
    metaValor: 1,
    valorActual: 0.94,
    causaRaiz: ish.raiz,
    ishikawaId: ish.id,
    acciones: [
      { id: uid('acc'), accion: 'Programar el volquete por ventanas horarias', responsable: 'Logística', fecha: sumarDias(lb.inicio, 12), hecho: true },
      { id: uid('acc'), accion: 'Medir el metrado diario con wincha y registro', responsable: 'Capataz', fecha: sumarDias(lb.inicio, 14), hecho: false },
    ],
    planControl: 'Carta de control semanal del índice de productividad.',
  });
  // ---------------------------------------------------------------- versión 2.5
  const hoyDemo = c.cortes[c.cortes.length - 1]?.fecha ?? lb.inicio;
  // riesgo de plazo y costo: tres valores propios en las actividades más largas, ± % general en el resto
  const largas = [...r.programa.actividades].sort((a, b) => b.duracion - a.duracion).slice(0, 3);
  for (const a of largas)
    c.riesgo.estimaciones[a.partidaId] = { optimista: Math.max(1, Math.round(a.duracion * 0.8)), probable: a.duracion, pesimista: Math.round(a.duracion * 1.6), costoOptimista: null, costoProbable: null, costoPesimista: null };
  c.riesgo.resumen = resumirRiesgo(simularRiesgo(r, c.riesgo, lb), hoyDemo);
  // kanban de materiales: lo que ya debía estar en obra llegó; lo próximo está pedido o en tránsito
  generarTarjetas(r, c, false, hoyDemo);
  let k = 0;
  for (const t of c.kanban.tarjetas) {
    if (t.fechaNecesaria <= hoyDemo) moverTarjeta(c, t.id, k++ % 9 === 4 ? 'almacen' : 'frente', t.fechaNecesaria);
    else if (t.fechaPedido <= hoyDemo) {
      enlazarRestriccion(c, t, hoyDemo);
      moverTarjeta(c, t.id, k++ % 3 === 0 ? 'transito' : 'pedido', t.fechaPedido);
    } else if (t.fechaNecesaria <= sumarDias(hoyDemo, 28)) enlazarRestriccion(c, t, hoyDemo);
  }
  // un material que no llegó a tiempo (quiebre de stock) y bloquea su actividad
  const atrasada = c.kanban.tarjetas.find((t) => t.fechaNecesaria <= hoyDemo && t.fechaNecesaria > sumarDias(hoyDemo, -14) && t.cantidad > 10);
  if (atrasada) {
    enlazarRestriccion(c, atrasada, hoyDemo);
    moverTarjeta(c, atrasada.id, 'transito', hoyDemo);
    atrasada.nota = 'Proveedor reprogramó el despacho';
  }
  // plan de calidad: puntos de inspección desde las EETT, protocolos de lo ejecutado y productos no conformes
  c.calidad.puntos = puntosSugeridos(r);
  const ppiDe = (pid: string) => c.calidad.puntos.find((x) => x.partidaId === pid);
  for (const x of c.calidad.puntos) if (/concreto|acero|geomembrana/i.test(r.hojas.find((h) => h.partida.id === x.partidaId)?.partida.descripcion ?? '')) x.tipo = 'H';
  const compactacion = c.calidad.puntos.find((x) => /compact/i.test(r.hojas.find((h) => h.partida.id === x.partidaId)?.partida.descripcion ?? ''));
  if (compactacion && c.series[0]) {
    compactacion.serieId = c.series[0].id;
    compactacion.norma = 'NTP 339.141 / ASTM D1557 (Proctor modificado); densidad de campo NTP 339.143';
    compactacion.criterio = 'Grado de compactación ≥ 95 % de la máxima densidad seca del Proctor modificado';
    compactacion.frecuencia = '1 ensayo por cada 250 m² por capa';
  }
  const ejecutado = ejecutadoHasta(c, hoyDemo);
  let np = 0;
  const firmado = (fecha: string) => firmasPorDefecto().map((f, i) => ({ ...f, nombre: ['Ing. de campo', 'Ing. de calidad', 'Supervisor de obra'][i], fecha, firmado: true }));
  for (const b of lb.partidas) {
    const ej = ejecutado[b.id] ?? 0;
    const ppi = ppiDe(b.id);
    if (!ppi || ej <= 0 || b.unidad === 'glb') continue;
    const n = b.metrado > 0 && ej / b.metrado > 0.5 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      np++;
      const fecha = sumarDias(b.inicio, 3 + i * 5) > hoyDemo ? hoyDemo : sumarDias(b.inicio, 3 + i * 5);
      const pendiente = np % 7 === 3;
      const observado = np % 11 === 5;
      c.calidad.protocolos.push({
        id: uid('prt'),
        numero: `PC-${String(np).padStart(3, '0')}`,
        puntoId: ppi.id,
        partidaId: b.id,
        frenteId: frenteDe(b.id),
        fecha,
        ubicacion: `Tramo ${i + 1}`,
        metrado: redondear(ej / n, 2),
        resultado: observado ? 'observado' : 'conforme',
        firmas: pendiente ? firmado(fecha).map((f, j) => (j === 2 ? { ...f, nombre: '', fecha: '', firmado: false } : f)) : observado ? firmasPorDefecto() : firmado(fecha),
        observaciones: observado ? 'Se observa espesor menor al especificado en un sector; se repite la medición.' : '',
      });
    }
  }
  const descDe = (pid: string) => r.hojas.find((h) => h.partida.id === pid)?.partida.descripcion ?? '';
  const protNc = c.calidad.protocolos.find((x) => /cobertura|relleno|suelo/i.test(descDe(x.partidaId))) ?? c.calidad.protocolos.find((x) => x.resultado === 'observado') ?? c.calidad.protocolos[0];
  if (protNc) {
    protNc.resultado = 'observado';
    protNc.firmas = firmasPorDefecto();
    protNc.observaciones = 'Se observa espesor menor al especificado en un sector; se repite la medición.';
  }
  if (protNc) {
    c.calidad.pnc.push({
      id: uid('pnc'),
      numero: 'PNC-001',
      fecha: protNc.fecha,
      partidaId: protNc.partidaId,
      frenteId: protNc.frenteId,
      protocoloId: protNc.id,
      descripcion: 'Espesor de capa por debajo del especificado en un sector del tramo inspeccionado.',
      detectadoPor: 'Supervisión',
      disposicion: 'reprocesar',
      causaRaiz: 'Control de niveles con estacas espaciadas a más de 10 m',
      ishikawaId: '',
      acciones: [
        { id: uid('acc'), accion: 'Reponer material y volver a compactar el sector', responsable: 'Capataz', fecha: sumarDias(protNc.fecha, 2), hecho: true },
        { id: uid('acc'), accion: 'Colocar estacas de nivel cada 5 m', responsable: 'Topógrafo', fecha: sumarDias(protNc.fecha, 3), hecho: false },
      ],
      verificacion: 'Nuevo protocolo del sector con espesores medidos cada 5 m.',
      costo: 1850,
      fechaCierre: '',
      estado: 'tratamiento',
      dmaicId: '',
    });
    const otro = c.calidad.protocolos.find((x) => x.partidaId !== protNc.partidaId && /geotextil|geomembrana/i.test(descDe(x.partidaId))) ?? c.calidad.protocolos.find((x) => x.partidaId !== protNc.partidaId);
    if (otro)
      c.calidad.pnc.push({
        id: uid('pnc'),
        numero: 'PNC-002',
        fecha: otro.fecha,
        partidaId: otro.partidaId,
        frenteId: otro.frenteId,
        protocoloId: otro.id,
        descripcion: 'Traslape de geosintético menor a 30 cm en dos paños.',
        detectadoPor: 'Control de calidad',
        disposicion: 'reparar',
        causaRaiz: 'Cuadrilla sin plantilla de traslape',
        ishikawaId: '',
        acciones: [{ id: uid('acc'), accion: 'Colocar parche con traslape de 50 cm y soldar', responsable: 'Instalador', fecha: sumarDias(otro.fecha, 1), hecho: true }],
        verificacion: 'Prueba de vacío de las uniones reparadas: conforme.',
        costo: 620,
        fechaCierre: sumarDias(otro.fecha, 2),
        estado: 'cerrado',
        dmaicId: '',
      });
  }
  // ingeniería de valor y costo meta
  c.valor = demostracionValor(r, hoyDemo);
  return c;
}
