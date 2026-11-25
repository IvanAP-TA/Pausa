import { privateMetadata } from "@/seo/metadata";
import { Thread } from "@/features/diary/Thread";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <Thread />;
}
