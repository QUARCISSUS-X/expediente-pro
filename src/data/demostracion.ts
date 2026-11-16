// Proyecto de demostración de la 3.0: el ejemplo con control de obra completo y los enlaces entre apartados a la vista
// (versión contractual y vigente, cambio con partidas, consulta que restringe una partida, plantilla de informe guardada).
import { controlDemostracion } from '../engine/control';
import { crearEscenario } from '../engine/escenarios';
import { calcularTodo } from '../engine/index';
import { plantillaInicial } from '../engine/informe';
import { montoDeCambio } from '../engine/integracion';
import type { Proyecto } from '../engine/types';
import { redondear, sumarDias, uid } from '../engine/util';
import { proyectoEjemplo } from './proyectos';

export function proyectoDemostracion(): Proyecto {
  const p = proyectoEjemplo();
  p.meta.nombre = `${p.meta.nombre.replace(/\s*\(proyecto de ejemplo\)\s*$/i, '')} (demostración)`;
  const r = calcularTodo(p);
  // versiones: oferta y contractual (el vigente sale de la contractual más los cambios aprobados)
  p.escenarios = [crearEscenario(p, r, 'Oferta', 'oferta', 'Presupuesto presentado'), crearEscenario(p, r, 'Contrato', 'contractual', 'Presupuesto firmado')];
  const c = controlDemostracion(r);
  const lb = c.lineaBase!;
  // cambio con partidas: al aprobarlo mueve el vigente, el EAC y el requerimiento de materiales
  const conMat = r.hojas.find((h) => h.metrado > 0 && r.apus[h.partida.id]?.items.some((i) => i.insumo.tipo === 'MAT'));
  if (conMat) {
    const partidas = [{ partidaId: conMat.partida.id, metrado: redondear(conMat.metrado * 0.1, 2) }];
    c.cambios.push({ id: uid('cmb'), numero: 'ADC-02', tipo: 'adicional', fecha: sumarDias(lb.inicio, 30), descripcion: `Mayor metrado de ${conMat.partida.descripcion}`, causa: 'Mayor metrado', monto: montoDeCambio(r, partidas), plazoDias: 3, estado: 'propuesto', partidas });
  }
  // consulta abierta asignada a una partida: aparece como restricción automática en Last Planner
  const futura = lb.partidas.find((b) => b.inicio > sumarDias(lb.inicio, 40)) ?? lb.partidas[lb.partidas.length - 1];
  if (futura) c.registros.push({ id: uid('reg'), tipo: 'rfi', numero: 'RFI-002', fecha: sumarDias(lb.inicio, 32), asunto: `Detalle constructivo de ${futura.descripcion}`, detalle: 'Se solicita el detalle de anclaje.', autor: 'Residente', destinatario: 'Proyectista', fechaLimite: sumarDias(lb.inicio, 45), respuesta: '', fechaRespuesta: '', estado: 'abierto', partidaId: futura.id });
  c.plantillasInforme = [{ ...plantillaInicial('mensual'), id: uid('pli'), nombre: 'Informe mensual para la supervisión', secciones: ['resumen', 'curva', 'avance', 'valorizacion', 'ppc', 'restricciones', 'calidad', 'cambios', 'firmas'] }];
  p.control = c;
  return p;
}
