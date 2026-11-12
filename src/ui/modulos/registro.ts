// Registro único de módulos. Para agregar uno:
//   1. electron/modulos.json  → grupo, texto de navegación, texto del menú de escritorio, atajo y reglas de validación
//   2. ModuloId en ../estado.ts
//   3. el componente aquí abajo
// tests/organizacion.test.ts comprueba que las tres listas coinciden.
import type { ComponentType } from 'react';
import navegacion from '../../../electron/modulos.json';
import type { Contexto, ModuloId } from '../estado';
import { ModBanco } from './Banco';
import { ModCalidad } from './Calidad';
import { ModCcpm } from './Ccpm';
import { ModControl } from './Control';
import { ModCronogramas } from './Cronogramas';
import { ModDocumentos } from './Documentos';
import { ModEjecucion } from './Ejecucion';
import { ModExportar } from './Exportar';
import { ModGG } from './GastosGenerales';
import { ModInsumos } from './Insumos';
import { ModLogistica } from './Logistica';
import { ModLps } from './Lps';
import { ModPendientes } from './Pendientes';
import { ModPolinomica } from './Polinomica';
import { ModPresupuesto } from './Presupuesto';
import { ModPrograma } from './Programa';
import { ModProyecto } from './Proyecto';
import { ModProyectos } from './Proyectos';
import { ModResumen } from './Resumen';
import { ModRiesgo } from './Riesgo';
import { ModSigma } from './Sigma';
import { ModTdr } from './Tdr';
import { ModValidacion } from './Validacion';
import { ModValor } from './Valor';
import { ModVersiones } from './Versiones';

export interface ItemNav { id: ModuloId; texto: string; menu: string; atajo: string; reglas: number[] }

/** Grupos y módulos en el orden de la navegación (y del menú Módulos de la app de escritorio). */
export const NAV = navegacion as { grupo: string; items: ItemNav[] }[];

export const MODULOS: Record<ModuloId, ComponentType<{ ctx: Contexto }>> = {
  proyectos: ModProyectos,
  resumen: ModResumen,
  pendientes: ModPendientes,
  proyecto: ModProyecto,
  tdr: ModTdr,
  banco: ModBanco,
  presupuesto: ModPresupuesto,
  versiones: ModVersiones,
  insumos: ModInsumos,
  gg: ModGG,
  polinomica: ModPolinomica,
  valor: ModValor,
  programa: ModPrograma,
  cronogramas: ModCronogramas,
  control: ModControl,
  lps: ModLps,
  ejecucion: ModEjecucion,
  sigma: ModSigma,
  riesgo: ModRiesgo,
  ccpm: ModCcpm,
  logistica: ModLogistica,
  calidad: ModCalidad,
  documentos: ModDocumentos,
  validacion: ModValidacion,
  exportar: ModExportar,
};
