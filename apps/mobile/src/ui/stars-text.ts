/** Half stars as the number people read: 7 -> "3,5" (the person's decimal mark). */
export const starsText = (halves: number, locale: string) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(halves / 2);
