// Índices Unificados de Precios de la Construcción (INEI), base diciembre 2025 = 100.
// Fuente: Metodología para el cálculo de los IUPC base diciembre 2025 (INEI, 2026).
// Código corto de 2 dígitos (el código oficial es de 6 dígitos: 21 -> 210000; 47-1 -> 471000).

export const INDICES_UNIFICADOS: Record<string, string> = {
  '01': 'Aceite y lubricante',
  '02': 'Acero de construcción liso',
  '03': 'Acero de construcción corrugado',
  '04': 'Agregado fino',
  '05': 'Agregado grueso',
  '06': 'Alambre y cable de cobre desnudo',
  '07': 'Alambre y cable tipo TW, THW, LSOH',
  '08': 'Alambre y cable tipo WP, CPI',
  '09': 'Alcantarilla metálica y guardavías',
  '10': 'Aparato sanitario con grifería',
  '11': 'Artefacto de alumbrado exterior',
  '12': 'Artefacto de alumbrado interior',
  '13': 'Asfalto',
  '14': 'Baldosa acústica',
  '16': 'Baldosa vinílica y PVC',
  '17': 'Bloque y ladrillo',
  '18': 'Cable telefónico y de red',
  '19': 'Cable NYY, N2XY, NPT, N2XOH y N2XSY',
  '20': 'Cemento asfáltico',
  '21': 'Cemento portland e hidráulico',
  '24': 'Cerámica y porcelanato',
  '26': 'Cerrajería',
  '27': 'Detonante',
  '28': 'Dinamita',
  '30': 'Dólar más inflación mercado USA',
  '31': 'Prefabricado de concreto',
  '32': 'Flete terrestre',
  '33': 'Flete aéreo',
  '34': 'Gasohol y gasolina',
  '37': 'Herramienta manual',
  '38': 'Hormigón y afirmado',
  '39': 'Índice de precios al consumidor (INEI)',
  '40': 'Loseta y terrazo',
  '41': 'Madera nacional en tiras para piso',
  '42': 'Madera importada para encofrado y carpintería',
  '43': 'Madera nacional para encofrado y carpintería',
  '44': 'Madera terciada nacional',
  '46': 'Malla de acero',
  '47': 'Mano de obra (incluye leyes sociales)',
  '47-1': 'Mano de obra de alta especialización (incluye leyes sociales)',
  '48': 'Maquinaria y equipo de construcción liviano',
  '49': 'Maquinaria y equipo de construcción pesado',
  '50': 'Marco y tapa de fierro',
  '51': 'Perfil de acero al carbono',
  '52': 'Perfil de aluminio',
  '53': 'Petróleo diésel',
  '54': 'Pintura látex',
  '55': 'Pintura temple',
  '56': 'Plancha de acero LAC',
  '57': 'Plancha de acero LAF',
  '59': 'Plancha de fibrocemento y yeso',
  '60': 'Plancha de poliuretano, poliestireno y termoaislante',
  '61': 'Plancha galvanizada',
  '62': 'Poste de concreto',
  '65': 'Tubería de acero negro y/o galvanizado',
  '66': 'Tubería de PVC para red de agua potable y alcantarillado',
  '68': 'Tubería de cobre',
  '71': 'Tubería de hierro fundido y dúctil',
  '72': 'Tubería de PVC para redes interiores',
  '77': 'Válvula de bronce y latón',
  '78': 'Válvula de hierro y acero',
  '79': 'Vidrio',
  '80': 'Concreto premezclado',
  '81': 'Aditivo de concreto y similar',
  '82': 'Alambre y cable de aluminio',
  '83': 'Implemento y accesorios de seguridad',
  '84': 'Madera terciada importada',
  '85': 'Perfil de acero galvanizado',
  '86': 'Pintura esmalte y epóxica',
  '87': 'Plancha con cubierta aluzinc',
  '88': 'Plancha y cobertura plástica',
  '89': 'Poste y tubería de fibra de vidrio',
  '90': 'Tubería de polietileno',
  '91': 'Geomembrana y geotextil',
  '92': 'Flete fluvial',
  '93': 'Bienes y servicios auxiliares',
  '94': 'Encofrado y andamio prefabricado',
  '95': 'Equipamiento permanente de obra',
};

export const AREAS_GEOGRAFICAS: Record<number, string> = {
  1: 'Lambayeque, Piura y Tumbes',
  2: 'Cajamarca y La Libertad',
  3: 'Áncash',
  4: 'Lima y Callao',
  5: 'Ica',
  6: 'Arequipa, Moquegua y Tacna',
  7: 'Amazonas y San Martín',
  8: 'Huánuco, Junín y Pasco',
  9: 'Ayacucho y Huancavelica',
  10: 'Apurímac, Cusco y Madre de Dios',
  11: 'Puno',
  12: 'Loreto',
  13: 'Ucayali',
};

// Símbolos usuales para los monomios de la fórmula polinómica.
export const SIMBOLO_IU: Record<string, string> = {
  '47': 'J',
  '47-1': 'JE',
  '39': 'GU',
  '21': 'C',
  '03': 'A',
  '02': 'A',
  '46': 'A',
  '04': 'AR',
  '05': 'AR',
  '38': 'H',
  '49': 'E',
  '48': 'E',
  '37': 'E',
  '53': 'P',
  '34': 'P',
  '43': 'M',
  '42': 'M',
  '44': 'M',
  '84': 'M',
  '30': 'D',
  '91': 'G',
  '80': 'CP',
  '32': 'F',
  '83': 'S',
  '17': 'L',
};

export function nombreIU(iu: string): string {
  return INDICES_UNIFICADOS[iu] ?? `Índice ${iu}`;
}

/** Índice unificado sugerido para un insumo según su descripción, tipo y unidad (criterio usual en expedientes). */
export function sugerirIU(descripcion: string, tipo: string, unidad = ''): string {
  const d = descripcion.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const u = unidad.toLowerCase();
  if (tipo === 'MO') return '47';
  if (u.startsWith('%') || /herramienta/.test(d)) return '37';
  if (tipo === 'EQ') {
    if (/compactador|plancha|vibrador|mezcladora|mochila|motobomba|estacion total|nivel|teodolito|detector|cortadora|winche|andamio/.test(d)) return '48';
    return '49';
  }
  if (tipo === 'SC') return '39';
  const reglas: [RegExp, string][] = [
    [/cemento/, '21'],
    [/arena/, '04'],
    [/afirmado|hormigon/, '38'],
    [/piedra|grava|chancada|filtro|agregado grueso/, '05'],
    [/acero|fierro|varilla/, '03'],
    [/alambre|clavo/, '02'],
    [/triplay|terciad|fenolico/, '44'],
    [/madera|estaca|poste de madera|tablon/, '43'],
    [/diesel|petroleo/, '53'],
    [/gasolina|gasohol/, '34'],
    [/aceite|lubricante|grasa/, '01'],
    [/pintura esmalte|epox/, '86'],
    [/pintura/, '54'],
    [/geotextil|geomembrana|geomalla|geocelda/, '91'],
    [/hdpe|polietileno/, '90'],
    [/pvc/, '72'],
    [/aditivo|desmoldeador|curador|sika|masilla|impermeabiliz/, '81'],
    [/epp|extintor|botiquin|letrero|senaliza|seguridad|casco|chaleco/, '83'],
    [/ladrillo|bloque/, '17'],
    [/concreto premezclado/, '80'],
  ];
  for (const [re, iu] of reglas) if (re.test(d)) return iu;
  return '39';
}
