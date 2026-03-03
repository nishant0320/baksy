// Generic async wrapper for try/catch on any function
const handler =
  (fn) =>
  (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      return err;
    }
  };
export default handler;
