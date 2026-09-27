export function nonNegativeInteger(value, name = "Nilai database") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw Error(`${name} harus berupa bilangan bulat non-negatif yang aman`);
  return number;
}
