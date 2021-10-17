export namespace Helpers {
  export function insertIntoSortedArray<T>(array: T[], elementToInsert: T, copmareFn: (a: T, b: T) => number) {
    let low = 0,
      high = array.length;

    while (low < high) {
      // tslint:disable-next-line: no-bitwise
      const mid = low + high >>> 1;
      if (copmareFn(array[mid], elementToInsert) < 0)
        low = mid + 1;
      else high = mid;
    }

    array.splice(low, 0, elementToInsert);
  }

  export function formatNumber(n: number, digits: number): string {
    return n.toString().padStart(digits, '0');
  }

  export function copyTextToClipboard(text: string) {
    if (!navigator['clipboard']) {
      fallbackCopyTextToClipboard(text);
      return;
    }
    navigator['clipboard'].writeText(text);
  }

  function fallbackCopyTextToClipboard(text: string) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      document.execCommand('copy');
    } catch (err) { }

    document.body.removeChild(textArea);
  }
}
