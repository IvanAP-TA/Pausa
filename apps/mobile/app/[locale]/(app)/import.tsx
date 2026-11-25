import { privateMetadata } from "@/seo/metadata";
import { ImportScreen } from "@/features/import/ImportScreen";

export const generateMetadata = () => privateMetadata("Pausa");

export default function Screen() {
  return <ImportScreen />;
}
