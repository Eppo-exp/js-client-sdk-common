// pause execution for a given number of milliseconds
export async function waitForMs(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
