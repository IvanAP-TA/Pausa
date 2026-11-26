import type { ReactNode } from "react";
import type { Picked } from "./parsers/read";

/** Android / iOS: there is nothing to drop a file on; the picker button is all there is. */
export function DropZone({ children }: { onFiles: (files: Picked[]) => void; disabled?: boolean; children: ReactNode }) {
  return <>{children}</>;
}
