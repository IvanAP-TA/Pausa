import { privateMetadata } from "@/seo/metadata";
import { SerataHistory } from "@/features/serata/SerataHistory";

// One shell for every Cerchia id, filled in by the client (the Worker serves it for /{locale}/c/{id}/serate).
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <SerataHistory />;
}
