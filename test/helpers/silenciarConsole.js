// Os logs do app (Log.js) vão para o console; nos testes eles só poluem a saída.
// Para depurar um teste, rode com DEBUG_LOGS=1.
if (!process.env.DEBUG_LOGS) {
  jest.spyOn(console, 'log').mockImplementation(() => {});
}
