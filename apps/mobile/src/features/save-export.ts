const NAME = "pausa-data.json";

/** Web: the JSON as a download (a Blob and a temporary link). */
export async function saveExport(json: string): Promise<void> {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = NAME;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
