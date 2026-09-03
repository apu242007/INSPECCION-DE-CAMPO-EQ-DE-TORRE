import "fake-indexeddb/auto";

// jsdom no trae createImageBitmap: comprimirImagen cae al catch y devuelve el blob original,
// que es exactamente el comportamiento degradado que queremos que sea seguro.
