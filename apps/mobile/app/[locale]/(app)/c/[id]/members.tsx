import { privateMetadata } from "@/seo/metadata";
import { CirclePage } from "@/features/CirclePage";

// The "Cerchia" tab (v1 /c/[id]/members): the people, the invites, the way to the settings.
export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <CirclePage />;
}
