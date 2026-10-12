// The name is passed to the contract as a Cairo short string: ASCII, 31 chars max.
export function validateName(name) {
  if (typeof name !== 'string' || !/^[\x20-\x7e]{1,31}$/.test(name)) {
    return 'name must be 1 to 31 printable ASCII characters';
  }
  return null;
}
