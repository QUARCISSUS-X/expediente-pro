// Catálogo semilla de insumos. PRECIOS REFERENCIALES DE DEMOSTRACIÓN (sin IGV, Lima, oct-2026):
// reemplácelos con los de la Revista Costos, cotizaciones o su base histórica usando
// "Importar precios" en el módulo Insumos.
import type { Insumo } from '../engine/types';
import { tarifasMO } from './manoObra';

const mo = tarifasMO();
const F = 'Referencial demo – actualizar';
const FMO = 'Calculadora HH 2026 (jornal CAPECO)';

export const CATALOGO_BASE: Insumo[] = [
  // Mano de obra (IU 47)
  { codigo: 'MO01', descripcion: 'Capataz', unidad: 'hh', tipo: 'MO', precio: mo.capataz, iu: '47', fuente: FMO },
  { codigo: 'MO02', descripcion: 'Operario', unidad: 'hh', tipo: 'MO', precio: mo.operario, iu: '47', fuente: FMO },
  { codigo: 'MO03', descripcion: 'Oficial', unidad: 'hh', tipo: 'MO', precio: mo.oficial, iu: '47', fuente: FMO },
  { codigo: 'MO04', descripcion: 'Peón', unidad: 'hh', tipo: 'MO', precio: mo.peon, iu: '47', fuente: FMO },
  { codigo: 'MO05', descripcion: 'Operador de equipo pesado', unidad: 'hh', tipo: 'MO', precio: mo.operario, iu: '47', fuente: FMO },
  { codigo: 'MO06', descripcion: 'Topógrafo', unidad: 'hh', tipo: 'MO', precio: mo.operario, iu: '47', fuente: FMO },
  { codigo: 'MO07', descripcion: 'Técnico instalador de geomembrana', unidad: 'hh', tipo: 'MO', precio: 32.5, iu: '47-1', fuente: F },
  { codigo: 'MO08', descripcion: 'Vigía', unidad: 'hh', tipo: 'MO', precio: mo.peon, iu: '47', fuente: FMO },

  // Materiales
  { codigo: 'MA01', descripcion: 'Cemento portland tipo I (42.5 kg)', unidad: 'bls', tipo: 'MAT', precio: 25.5, iu: '21', pesoKg: 42.5, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA02', descripcion: 'Arena gruesa', unidad: 'm3', tipo: 'MAT', precio: 55, iu: '04', pesoKg: 1600, plazoCompraDias: 5, fuente: F },
  { codigo: 'MA03', descripcion: 'Piedra chancada de 1/2"', unidad: 'm3', tipo: 'MAT', precio: 65, iu: '05', pesoKg: 1550, plazoCompraDias: 5, fuente: F },
  { codigo: 'MA04', descripcion: 'Hormigón', unidad: 'm3', tipo: 'MAT', precio: 45, iu: '38', pesoKg: 1800, plazoCompraDias: 5, fuente: F },
  { codigo: 'MA05', descripcion: 'Agua puesta en obra', unidad: 'm3', tipo: 'MAT', precio: 6, iu: '39', plazoCompraDias: 1, fuente: F },
  { codigo: 'MA06', descripcion: 'Acero corrugado fy = 4200 kg/cm2 grado 60', unidad: 'kg', tipo: 'MAT', precio: 4.2, iu: '03', pesoKg: 1, plazoCompraDias: 10, fuente: F },
  { codigo: 'MA07', descripcion: 'Alambre negro recocido N° 16', unidad: 'kg', tipo: 'MAT', precio: 6.5, iu: '02', pesoKg: 1, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA08', descripcion: 'Alambre negro recocido N° 8', unidad: 'kg', tipo: 'MAT', precio: 6.2, iu: '02', pesoKg: 1, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA09', descripcion: 'Clavos para madera con cabeza de 3"', unidad: 'kg', tipo: 'MAT', precio: 5.8, iu: '02', pesoKg: 1, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA10', descripcion: 'Madera tornillo', unidad: 'p2', tipo: 'MAT', precio: 6.5, iu: '43', pesoKg: 1.4, plazoCompraDias: 10, fuente: F },
  { codigo: 'MA11', descripcion: 'Triplay de 18 mm (1.22 x 2.44 m)', unidad: 'pln', tipo: 'MAT', precio: 95, iu: '44', pesoKg: 30, plazoCompraDias: 10, fuente: F },
  { codigo: 'MA12', descripcion: 'Yeso en bolsa de 28 kg', unidad: 'bls', tipo: 'MAT', precio: 9.5, iu: '39', pesoKg: 28, plazoCompraDias: 5, fuente: F },
  { codigo: 'MA13', descripcion: 'Estaca de madera', unidad: 'und', tipo: 'MAT', precio: 1.5, iu: '43', pesoKg: 0.5, plazoCompraDias: 5, fuente: F },
  { codigo: 'MA14', descripcion: 'Geomembrana HDPE lisa de 1.5 mm', unidad: 'm2', tipo: 'MAT', precio: 22, iu: '91', pesoKg: 1.41, plazoCompraDias: 21, fuente: F },
  { codigo: 'MA15', descripcion: 'Geotextil no tejido de 300 g/m2', unidad: 'm2', tipo: 'MAT', precio: 6.5, iu: '91', pesoKg: 0.3, plazoCompraDias: 21, fuente: F },
  { codigo: 'MA16', descripcion: 'Material de préstamo seleccionado (en cantera)', unidad: 'm3', tipo: 'MAT', precio: 18, iu: '38', plazoCompraDias: 3, fuente: F },
  { codigo: 'MA17', descripcion: 'Suelo orgánico (top soil) de acopio', unidad: 'm3', tipo: 'MAT', precio: 12, iu: '39', plazoCompraDias: 3, fuente: F },
  { codigo: 'MA18', descripcion: 'Semilla de pastos nativos', unidad: 'kg', tipo: 'MAT', precio: 45, iu: '39', pesoKg: 1, plazoCompraDias: 15, fuente: F },
  { codigo: 'MA19', descripcion: 'Abono orgánico (compost)', unidad: 'kg', tipo: 'MAT', precio: 0.8, iu: '39', pesoKg: 1, plazoCompraDias: 10, fuente: F },
  { codigo: 'MA20', descripcion: 'Fertilizante NPK', unidad: 'kg', tipo: 'MAT', precio: 3.5, iu: '39', pesoKg: 1, plazoCompraDias: 10, fuente: F },
  { codigo: 'MA21', descripcion: 'Plantón de especie nativa', unidad: 'und', tipo: 'MAT', precio: 3, iu: '39', pesoKg: 1, plazoCompraDias: 30, fuente: F },
  { codigo: 'MA22', descripcion: 'Aditivo impermeabilizante para concreto', unidad: 'kg', tipo: 'MAT', precio: 9, iu: '81', pesoKg: 1, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA23', descripcion: 'Curador de concreto', unidad: 'gal', tipo: 'MAT', precio: 28, iu: '81', pesoKg: 4, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA24', descripcion: 'Desmoldante para encofrado', unidad: 'gal', tipo: 'MAT', precio: 22, iu: '81', pesoKg: 4, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA25', descripcion: 'Cartel de señalización de seguridad 0.60 x 0.40 m', unidad: 'und', tipo: 'MAT', precio: 85, iu: '83', pesoKg: 3, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA26', descripcion: 'Cinta de señalización', unidad: 'rll', tipo: 'MAT', precio: 35, iu: '83', pesoKg: 1, plazoCompraDias: 5, fuente: F },
  { codigo: 'MA27', descripcion: 'Cono de seguridad de 28"', unidad: 'und', tipo: 'MAT', precio: 45, iu: '83', pesoKg: 2, plazoCompraDias: 5, fuente: F },
  { codigo: 'MA28', descripcion: 'Pintura esmalte sintético', unidad: 'gal', tipo: 'MAT', precio: 55, iu: '86', pesoKg: 4.5, plazoCompraDias: 5, fuente: F },
  { codigo: 'MA29', descripcion: 'Tubería HDPE perforada de 4"', unidad: 'm', tipo: 'MAT', precio: 28, iu: '90', pesoKg: 1.2, plazoCompraDias: 15, fuente: F },
  { codigo: 'MA30', descripcion: 'Petróleo diésel B5', unidad: 'gal', tipo: 'MAT', precio: 16.5, iu: '53', plazoCompraDias: 2, fuente: F },
  { codigo: 'MA31', descripcion: 'Ladrillo King Kong de 18 huecos', unidad: 'und', tipo: 'MAT', precio: 0.85, iu: '17', pesoKg: 2.8, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA32', descripcion: 'Kit de equipo de protección personal por trabajador', unidad: 'und', tipo: 'MAT', precio: 380, iu: '83', pesoKg: 5, plazoCompraDias: 7, fuente: F },
  { codigo: 'MA33', descripcion: 'Piedra grande de 8"', unidad: 'm3', tipo: 'MAT', precio: 55, iu: '05', pesoKg: 1600, plazoCompraDias: 5, fuente: F },

  // Equipos
  { codigo: 'EQ01', descripcion: 'Herramientas manuales', unidad: '%MO', tipo: 'EQ', precio: 0, iu: '37', fuente: 'Porcentaje de la mano de obra' },
  { codigo: 'EQ02', descripcion: 'Mezcladora de concreto 9-11 p3 (18 HP)', unidad: 'hm', tipo: 'EQ', precio: 22, iu: '48', fuente: F },
  { codigo: 'EQ03', descripcion: 'Vibrador de concreto 4 HP 1.35"', unidad: 'hm', tipo: 'EQ', precio: 9.5, iu: '48', fuente: F },
  { codigo: 'EQ04', descripcion: 'Excavadora sobre orugas 170-250 HP 1.1-2.75 yd3 (incl. operador)', unidad: 'hm', tipo: 'EQ', precio: 285, iu: '49', fuente: F },
  { codigo: 'EQ05', descripcion: 'Cargador frontal sobre llantas 125 HP 2.5 yd3 (incl. operador)', unidad: 'hm', tipo: 'EQ', precio: 220, iu: '49', fuente: F },
  { codigo: 'EQ06', descripcion: 'Camión volquete 15 m3 (incl. operador)', unidad: 'hm', tipo: 'EQ', precio: 210, iu: '49', fuente: F },
  { codigo: 'EQ07', descripcion: 'Rodillo liso vibratorio autopropulsado 10-12 t (incl. operador)', unidad: 'hm', tipo: 'EQ', precio: 210, iu: '49', fuente: F },
  { codigo: 'EQ08', descripcion: 'Motoniveladora 125 HP (incl. operador)', unidad: 'hm', tipo: 'EQ', precio: 250, iu: '49', fuente: F },
  { codigo: 'EQ09', descripcion: 'Camión cisterna 2000 gal (incl. operador)', unidad: 'hm', tipo: 'EQ', precio: 140, iu: '49', fuente: F },
  { codigo: 'EQ10', descripcion: 'Plancha compactadora vibratoria 4 HP', unidad: 'hm', tipo: 'EQ', precio: 15, iu: '48', fuente: F },
  { codigo: 'EQ11', descripcion: 'Estación total', unidad: 'hm', tipo: 'EQ', precio: 18, iu: '48', fuente: F },
  { codigo: 'EQ12', descripcion: 'Nivel topográfico con trípode', unidad: 'hm', tipo: 'EQ', precio: 6, iu: '48', fuente: F },
  { codigo: 'EQ13', descripcion: 'Tractor sobre orugas 190-240 HP (incl. operador)', unidad: 'hm', tipo: 'EQ', precio: 320, iu: '49', fuente: F },
  { codigo: 'EQ14', descripcion: 'Equipo de termofusión y extrusión para geomembrana', unidad: 'hm', tipo: 'EQ', precio: 35, iu: '48', fuente: F },
  { codigo: 'EQ15', descripcion: 'Martillo neumático de 24 kg con compresora 250-330 PCM', unidad: 'hm', tipo: 'EQ', precio: 120, iu: '49', fuente: F },
  { codigo: 'EQ16', descripcion: 'Camioneta pick-up 4x4 doble cabina', unidad: 'hm', tipo: 'EQ', precio: 45, iu: '49', fuente: F },
  { codigo: 'EQ17', descripcion: 'Grupo electrógeno 20 kW', unidad: 'hm', tipo: 'EQ', precio: 35, iu: '48', fuente: F },

  // Subcontratos y servicios
  { codigo: 'SC01', descripcion: 'Movilización y desmovilización de equipo pesado (cama baja)', unidad: 'glb', tipo: 'SC', precio: 22000, iu: '32', fuente: F },
  { codigo: 'SC02', descripcion: 'Ensayo de densidad de campo (cono de arena)', unidad: 'und', tipo: 'SC', precio: 85, iu: '39', fuente: F },
  { codigo: 'SC03', descripcion: 'Ensayo de resistencia a la compresión de probetas', unidad: 'und', tipo: 'SC', precio: 25, iu: '39', fuente: F },
  { codigo: 'SC04', descripcion: 'Levantamiento topográfico y planos as built', unidad: 'glb', tipo: 'SC', precio: 6500, iu: '39', fuente: F },
  { codigo: 'SC05', descripcion: 'Elaboración del plan de seguridad, salud ocupacional y medio ambiente', unidad: 'glb', tipo: 'SC', precio: 4500, iu: '39', fuente: F },
  { codigo: 'SC06', descripcion: 'Alquiler de contenedor oficina/almacén 20 pies', unidad: 'mes', tipo: 'SC', precio: 1900, iu: '39', fuente: F },
  { codigo: 'SC07', descripcion: 'Monitoreo ambiental (agua, aire y ruido)', unidad: 'und', tipo: 'SC', precio: 3200, iu: '39', fuente: F },
];
