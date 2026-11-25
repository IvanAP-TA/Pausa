import { privateMetadata } from "@/seo/metadata";
import { LogNew } from "@/features/diary/LogForm";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <LogNew />;
}
