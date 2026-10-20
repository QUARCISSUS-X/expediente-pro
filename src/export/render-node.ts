// Render del PDF en Node (línea de comandos).
import pdfmakeMod from 'pdfmake';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import vfsMod from 'pdfmake/build/vfs_fonts.js';

let listo = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pdfmake: any = (pdfmakeMod as any).default ?? pdfmakeMod;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const vfs: Record<string, string> = (vfsMod as any).default ?? vfsMod;

function preparar() {
  if (listo) return;
  for (const [nombre, b64] of Object.entries(vfs)) if (typeof b64 === 'string') pdfmake.virtualfs.writeFileSync(nombre, Buffer.from(b64, 'base64'));
  pdfmake.setFonts({ Roboto: { normal: 'Roboto-Regular.ttf', bold: 'Roboto-Medium.ttf', italics: 'Roboto-Italic.ttf', bolditalics: 'Roboto-MediumItalic.ttf' } });
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => false);
  listo = true;
}

export async function renderPdfNode(def: TDocumentDefinitions): Promise<Uint8Array> {
  preparar();
  const buf: Buffer = await pdfmake.createPdf(def).getBuffer();
  return new Uint8Array(buf);
}
