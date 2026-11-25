import { privateMetadata } from "@/seo/metadata";
import { LogEdit } from "@/features/diary/LogForm";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <LogEdit />;
}
