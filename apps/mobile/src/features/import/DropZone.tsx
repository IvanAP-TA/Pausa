import { useState, type ReactNode } from "react";
import { cssVar } from "@/theme";
import type { Picked } from "./parsers/read";

/**
 * Web: v1's drop zone, a dashed rectangle on the ground (muted edge, ink under a file being dragged over it). Dropping files reads
 * them as bytes and hands them over, like the picker does. The button inside still works for keyboards and screen readers.
 */
export function DropZone({ onFiles, disabled, children }: { onFiles: (files: Picked[]) => void; disabled?: boolean; children: ReactNode }) {
  const [over, setOver] = useState(false);
  return (
    <div
      data-testid="drop-zone"
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (disabled) return;
        const list = Array.from(e.dataTransfer.files);
        if (list.length === 0) return;
        void Promise.all(list.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))).then(onFiles);
      }}
      style={{ display: "grid", gap: 12, padding: 20, border: `1px dashed var(${cssVar(over ? "ink" : "muted")})`, transition: "border-color 150ms" }}
    >
      {children}
    </div>
  );
}
