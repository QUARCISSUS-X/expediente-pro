// Render del PDF en el navegador.
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import pdfMake from 'pdfmake/build/pdfmake';
import vfs from 'pdfmake/build/vfs_fonts';

let listo = false;

export async function renderPdfBrowser(def: TDocumentDefinitions): Promise<Uint8Array> {
  if (!listo) {
    pdfMake.addVirtualFileSystem(vfs);
    listo = true;
  }
  const blob: Blob = await pdfMake.createPdf(def).getBlob();
  return new Uint8Array(await blob.arrayBuffer());
}
