export function fail(message, status = 400) {
  const error = new Error(message); error.status = status; throw error;
}
export function text(value, name, max, required = true) {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) fail(`Invalid ${name}.`);
  return value.trim();
}
export function integer(value, name, min = 1, max = 2147483647) {
  const number = Number(value);
  if (value === '' || value === null || !Number.isInteger(number) || number < min || number > max) fail(`Invalid ${name}.`);
  return number;
}
