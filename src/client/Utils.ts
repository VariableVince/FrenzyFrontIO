export function renderTroops(troops: number): string {
  return renderNumber(troops / 10);
}

export function renderNumber(num: number) {
  num = Math.max(num, 0);
  let numStr = "";
  if (num >= 10_000_000) {
    numStr = (num / 1000000).toFixed(1) + "M";
  } else if (num >= 1_000_000) {
    numStr = (num / 1000000).toFixed(2) + "M";
  } else if (num >= 100000) {
    numStr = Math.floor(num / 1000) + "K";
  } else if (num >= 10000) {
    numStr = (num / 1000).toFixed(1) + "K";
  } else if (num >= 1000) {
    numStr = (num / 1000).toFixed(2) + "K";
  } else {
    numStr = Math.floor(num).toString();
  }
  return numStr;
}

export function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");

  // Set canvas style to fill the screen
  canvas.style.position = "fixed";
  canvas.style.left = "0";
  canvas.style.top = "0";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.touchAction = "none";

  return canvas;
}
/**
 * A polyfill for crypto.randomUUID that provides fallback implementations
 * for older browsers, particularly Safari versions < 15.4
 */
export function generateCryptoRandomUUID(): string {
  // Type guard to check if randomUUID is available
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  // Fallback using crypto.getRandomValues
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    return (([1e7] as any) + -1e3 + -4e3 + -8e3 + -1e11).replace(
      /[018]/g,
      (c: number): string =>
        (
          c ^
          (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))
        ).toString(16),
    );
  }

  // Last resort fallback using Math.random
  // Note: This is less cryptographically secure but ensures functionality
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (c: string): string => {
      const r: number = (Math.random() * 16) | 0;
      const v: number = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    },
  );
}
