/// <reference types="vite/client" />
declare module 'pdfmake/build/pdfmake';
declare module 'pdfmake/build/vfs_fonts';
declare module 'pdfmake/build/vfs_fonts.js';

declare module 'virtual:trabajador' {
  const Trabajador: new () => Worker;
  export default Trabajador;
}
