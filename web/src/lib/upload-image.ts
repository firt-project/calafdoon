/** Clear the input so choosing the same file again still fires `onChange`. */
export function resetFileInput(input: HTMLInputElement | null | undefined) {
  if (input) input.value = "";
}
