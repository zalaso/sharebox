// Segnaposto per il controllo dei tipi. Nel bundle `./user.js` resta esterno:
// nel container workerd carica al suo posto il worker del creatore (o un modulo vuoto).
const worker: unknown = {};
export default worker;
