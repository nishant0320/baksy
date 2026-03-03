import readline from "node:readline";

export default async function ask({
  question,
  defaultValue,
  allowedValues = [],
  caseInsensitive = true,
}) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const normalizedAllowed = caseInsensitive
    ? allowedValues.map((v) => v.toLowerCase())
    : allowedValues;

  const prompt = () =>
    new Promise((resolve) => {
      const label = defaultValue
        ? `${question} [${defaultValue}]: `
        : `${question}: `;
      rl.question(label, (answer) => resolve(answer || defaultValue));
    });

  try {
    while (true) {
      const input = await prompt();

      if (!allowedValues.length) {
        rl.close();
        return input;
      }

      const normalizedInput = caseInsensitive
        ? input.toLowerCase()
        : input;

      const matchIndex = normalizedAllowed.indexOf(normalizedInput);

      if (matchIndex !== -1) {
        rl.close();
        return allowedValues[matchIndex];
      }

      const suggestions = allowedValues.filter((v) =>
        v.toLowerCase().includes(normalizedInput),
      );

      console.log(
        suggestions.length
          ? `Invalid input. Did you mean: ${suggestions.join(", ")}?`
          : `Invalid input. Allowed values: ${allowedValues.join(", ")}`,
      );
    }
  } finally {
    rl.close();
  }
}