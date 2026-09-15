// Stub for pdfjs-dist's optional Node "canvas" dependency.
// pdf.js only requires this in its NodeCanvasFactory (server-side rendering).
// This app renders PDFs entirely in the browser, so an empty module is safe here.
module.exports = {};